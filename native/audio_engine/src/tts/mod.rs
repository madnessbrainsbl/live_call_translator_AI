pub mod piper;

use anyhow::Result;
use log::info;

use self::piper::PiperTts;

/// TTS engine that converts text to f32 audio samples.
///
/// Wraps the Piper TTS backend (ONNX inference + espeak-ng phonemization)
/// and handles resampling from the model's native sample rate (typically
/// 22050 Hz) to the pipeline output rate (typically 48000 Hz).
pub struct TtsEngine {
    inner: PiperTts,
}

impl TtsEngine {
    /// Create a new TTS engine.
    ///
    /// `config_path` — path to the Piper `.onnx.json` config file.
    /// `model_path`  — path to the Piper `.onnx` model file.
    /// `output_sample_rate` — target sample rate for the audio pipeline (e.g. 48000).
    pub fn new(config_path: &str, model_path: &str, output_sample_rate: u32) -> Result<Self> {
        info!(
            "Initializing TTS engine: config={}, model={}, output_rate={}",
            config_path, model_path, output_sample_rate
        );
        let inner = PiperTts::new(config_path, model_path, output_sample_rate)?;
        info!("TTS engine ready");
        Ok(Self { inner })
    }

    /// Synthesize text into f32 audio samples at `output_sample_rate`.
    pub fn synthesize(&mut self, text: &str) -> Result<Vec<f32>> {
        self.inner.synthesize(text)
    }
}
