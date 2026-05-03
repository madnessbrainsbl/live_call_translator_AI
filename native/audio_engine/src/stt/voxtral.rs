/// Safe Rust wrapper around voxtral.c FFI.
///
/// Provides `VoxtralEngine` (model context, Send-safe) and
/// `VoxtralStream` (single-threaded streaming transcription session).

use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_float, c_int};
use std::ptr;

use anyhow::{bail, Context, Result};
use log::{debug, info, warn};

// ---------------------------------------------------------------------------
// FFI declarations (matches voxtral.h)
// ---------------------------------------------------------------------------

#[repr(C)]
struct VoxCtx {
    _private: [u8; 0],
}

#[repr(C)]
struct VoxStream {
    _private: [u8; 0],
}

extern "C" {
    fn vox_load(model_dir: *const c_char) -> *mut VoxCtx;
    fn vox_free(ctx: *mut VoxCtx);
    fn vox_set_delay(ctx: *mut VoxCtx, delay_ms: c_int);

    fn vox_stream_init(ctx: *mut VoxCtx) -> *mut VoxStream;
    fn vox_stream_feed(s: *mut VoxStream, samples: *const c_float, n_samples: c_int) -> c_int;
    fn vox_stream_finish(s: *mut VoxStream) -> c_int;
    fn vox_stream_get(s: *mut VoxStream, out_tokens: *mut *const c_char, max: c_int) -> c_int;
    fn vox_set_processing_interval(s: *mut VoxStream, seconds: c_float);
    fn vox_stream_set_continuous(s: *mut VoxStream, enable: c_int);
    fn vox_stream_flush(s: *mut VoxStream) -> c_int;
    fn vox_stream_free(s: *mut VoxStream);
}

// ---------------------------------------------------------------------------
// VoxtralEngine — model context (read-only after load, thread-safe)
// ---------------------------------------------------------------------------

/// Safe wrapper for voxtral.c model context.
///
/// Loads the model (~8.9 GB mmap) once. The context is read-only after
/// creation and can be shared across threads via `Arc<VoxtralEngine>`.
pub struct VoxtralEngine {
    ctx: *mut VoxCtx,
}

// VoxCtx is read-only after vox_load — safe to share across threads.
unsafe impl Send for VoxtralEngine {}
unsafe impl Sync for VoxtralEngine {}

impl VoxtralEngine {
    /// Load model from a directory containing `consolidated.safetensors` + `tekken.json`.
    pub fn new(model_dir: &str) -> Result<Self> {
        info!("Loading voxtral model from {}", model_dir);
        let c_path =
            CString::new(model_dir).context("model_dir contains interior NUL byte")?;

        let ctx = unsafe { vox_load(c_path.as_ptr()) };
        if ctx.is_null() {
            bail!("vox_load failed for model_dir={}", model_dir);
        }

        info!("Voxtral model loaded successfully");
        Ok(Self { ctx })
    }

    /// Set transcription delay in milliseconds (80..2400, default 480).
    pub fn set_delay(&self, delay_ms: i32) {
        debug!("Setting voxtral delay to {} ms", delay_ms);
        unsafe { vox_set_delay(self.ctx, delay_ms as c_int) };
    }

    /// Create a new streaming transcription session.
    pub fn create_stream(&self) -> Result<VoxtralStream> {
        let stream = unsafe { vox_stream_init(self.ctx) };
        if stream.is_null() {
            bail!("vox_stream_init returned NULL");
        }
        Ok(VoxtralStream { stream, total_fed: 0 })
    }
}

impl Drop for VoxtralEngine {
    fn drop(&mut self) {
        debug!("Freeing voxtral context");
        unsafe { vox_free(self.ctx) };
    }
}

// ---------------------------------------------------------------------------
// VoxtralStream — single streaming transcription session (NOT thread-safe)
// ---------------------------------------------------------------------------

/// Streaming transcription session.
///
/// Wraps `vox_stream_t`. Each stream must be used from a single thread.
pub struct VoxtralStream {
    stream: *mut VoxStream,
    total_fed: usize,
}

/// Token buffer size for vox_stream_get calls.
const MAX_TOKENS_PER_GET: usize = 64;

impl VoxtralStream {
    /// Feed audio samples (mono f32, 16 kHz, [-1, 1]).
    ///
    /// Internally runs the encoder/decoder on available data and queues
    /// output tokens. Retrieve them with [`get_tokens`].
    pub fn feed(&mut self, samples: &[f32]) -> Result<()> {
        self.total_fed += samples.len();
        let ret = unsafe {
            vox_stream_feed(
                self.stream,
                samples.as_ptr(),
                samples.len() as c_int,
            )
        };
        if ret != 0 {
            bail!("vox_stream_feed returned error ({})", ret);
        }
        Ok(())
    }

    /// Retrieve pending decoded text tokens.
    ///
    /// Returns an empty `Vec` when nothing is available yet.
    pub fn get_tokens(&mut self) -> Vec<String> {
        let mut tokens = Vec::new();
        let mut ptrs: [*const c_char; MAX_TOKENS_PER_GET] =
            [ptr::null(); MAX_TOKENS_PER_GET];

        loop {
            let n = unsafe {
                vox_stream_get(
                    self.stream,
                    ptrs.as_mut_ptr(),
                    MAX_TOKENS_PER_GET as c_int,
                )
            };
            if n <= 0 {
                break;
            }
            debug!("vox_stream_get returned {} tokens", n);
            for &p in &ptrs[..n as usize] {
                if p.is_null() {
                    continue;
                }
                // Safety: vox_stream_get returns pointers valid until vox_stream_free
                let s = unsafe { CStr::from_ptr(p) };
                tokens.push(s.to_string_lossy().into_owned());
            }
        }
        tokens
    }

    /// Signal end of audio and process the remaining buffered data.
    pub fn finish(&mut self) -> Result<()> {
        info!("vox_stream_finish called (total fed: {} samples = {:.1}s)", self.total_fed, self.total_fed as f32 / 16000.0);
        let ret = unsafe { vox_stream_finish(self.stream) };
        info!("vox_stream_finish returned: {}", ret);
        if ret != 0 {
            bail!("vox_stream_finish returned error ({})", ret);
        }
        Ok(())
    }

    /// Set minimum time between encoder runs (seconds).
    ///
    /// Lower = more responsive (higher GPU overhead).
    /// Higher = more efficient batching (higher latency).
    /// Default: 2.0s.
    pub fn set_processing_interval(&mut self, seconds: f32) {
        unsafe { vox_set_processing_interval(self.stream, seconds) };
    }

    /// Enable continuous (live) mode.
    ///
    /// Auto-restarts the decoder on EOS or KV overflow — required for
    /// open-ended live transcription.
    pub fn set_continuous(&mut self, enable: bool) {
        unsafe { vox_stream_set_continuous(self.stream, enable as c_int) };
    }

    /// Force the encoder to process whatever audio is currently buffered,
    /// regardless of the processing interval.
    pub fn flush(&mut self) -> Result<()> {
        info!("vox_stream_flush called");
        let ret = unsafe { vox_stream_flush(self.stream) };
        info!("vox_stream_flush returned: {}", ret);
        if ret != 0 {
            bail!("vox_stream_flush returned error ({})", ret);
        }
        Ok(())
    }
}

impl Drop for VoxtralStream {
    fn drop(&mut self) {
        debug!("Freeing voxtral stream");
        unsafe { vox_stream_free(self.stream) };
    }
}
