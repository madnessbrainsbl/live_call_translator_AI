/// Piper TTS engine — local speech synthesis via ONNX Runtime.
///
/// Architecture:
///   1. Text -> espeak-ng (subprocess) -> IPA phonemes
///   2. IPA phonemes -> phoneme_id_map (from JSON config) -> phoneme IDs
///   3. phoneme IDs -> ONNX VITS model (via ort) -> raw audio at model_sample_rate
///   4. raw audio -> rubato resampler -> output at output_sample_rate
use std::collections::HashMap;
use std::io::Write as _;
use std::path::Path;
use std::process::{Command, Stdio};

use anyhow::{Context, Result};
use log::{debug, info, warn};
use ndarray::{Array1, Array2};
use ort::session::Session;
use ort::value::Value;
use rubato::{
    Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};
use serde::Deserialize;

fn debug_log(message: &str) {
    let path = match std::env::var("TRANSLATOR_DEBUG_LOG") {
        Ok(v) if !v.trim().is_empty() => v,
        _ => return,
    };

    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        use std::io::Write;
        let _ = writeln!(file, "{}", message);
    }
}

/// Piper model configuration parsed from the `.onnx.json` file.
#[derive(Debug, Deserialize)]
struct PiperConfig {
    audio: AudioConfig,
    espeak: EspeakConfig,
    inference: InferenceConfig,
    phoneme_id_map: HashMap<String, Vec<i64>>,
    #[serde(default)]
    num_speakers: u32,
    #[serde(default)]
    #[allow(dead_code)] // present in Piper JSON configs, needed for deserialization
    speaker_id_map: HashMap<String, i64>,
}

#[derive(Debug, Deserialize)]
struct AudioConfig {
    sample_rate: u32,
}

#[derive(Debug, Deserialize)]
struct EspeakConfig {
    voice: String,
}

#[derive(Debug, Deserialize)]
struct InferenceConfig {
    noise_scale: f32,
    length_scale: f32,
    noise_w: f32,
}

// Special phoneme tokens (matching Piper convention)
const BOS: &str = "^"; // beginning of sequence
const EOS: &str = "$"; // end of sequence
const PAD: &str = "_"; // padding between phonemes

pub struct PiperTts {
    session: Session,
    config: PiperConfig,
    output_sample_rate: u32,
    espeak_binary: String,
}

impl PiperTts {
    /// Create a new Piper TTS instance.
    ///
    /// `config_path` — path to the `.onnx.json` config file.
    /// `model_path`  — path to the `.onnx` model file.
    /// `output_sample_rate` — target sample rate (e.g. 48000).
    pub fn new(config_path: &str, model_path: &str, output_sample_rate: u32) -> Result<Self> {
        // Load and parse JSON config
        let config_str = std::fs::read_to_string(config_path)
            .with_context(|| format!("Failed to read Piper config: {}", config_path))?;
        let config: PiperConfig = serde_json::from_str(&config_str)
            .with_context(|| format!("Failed to parse Piper config: {}", config_path))?;

        info!(
            "Piper config: voice={}, sample_rate={}, phonemes={}",
            config.espeak.voice,
            config.audio.sample_rate,
            config.phoneme_id_map.len()
        );

        // Load ONNX model
        let model = Path::new(model_path);
        anyhow::ensure!(model.exists(), "Piper model not found: {}", model_path);

        let session = Session::builder()
            .context("Failed to create ONNX session builder")?
            .commit_from_file(model_path)
            .with_context(|| format!("Failed to load Piper ONNX model: {}", model_path))?;

        info!("Piper ONNX model loaded: {}", model_path);

        // Find espeak-ng binary
        let espeak_binary = find_espeak_ng()?;
        info!("Using espeak-ng: {}", espeak_binary);

        Ok(Self {
            session,
            config,
            output_sample_rate,
            espeak_binary,
        })
    }

    /// Synthesize text to f32 audio samples at `output_sample_rate`.
    pub fn synthesize(&mut self, text: &str) -> Result<Vec<f32>> {
        let text = text.trim();
        if text.is_empty() {
            return Ok(Vec::new());
        }

        let start = std::time::Instant::now();

        // Step 1: Text -> IPA phonemes via espeak-ng
        let phonemes = self.phonemize(text)?;
        debug!("Phonemized '{}' -> '{}'", text, phonemes);

        // Step 2: Phonemes -> phoneme IDs
        let phoneme_ids = self.phonemes_to_ids(&phonemes);
        debug!("Phoneme IDs: {} tokens", phoneme_ids.len());

        if phoneme_ids.is_empty() {
            warn!("No phoneme IDs produced for text: '{}'", text);
            return Ok(Vec::new());
        }

        // Step 3: Run ONNX inference
        let raw_audio = self.infer(&phoneme_ids)?;

        let synth_elapsed = start.elapsed();
        debug!(
            "Piper synthesized {} samples in {:?} ({}Hz)",
            raw_audio.len(),
            synth_elapsed,
            self.config.audio.sample_rate
        );

        // Step 4: Resample to output rate if necessary
        if self.config.audio.sample_rate != self.output_sample_rate {
            let resampled = resample(
                &raw_audio,
                self.config.audio.sample_rate,
                self.output_sample_rate,
            )?;
            debug!(
                "Resampled {} -> {} samples ({}Hz -> {}Hz)",
                raw_audio.len(),
                resampled.len(),
                self.config.audio.sample_rate,
                self.output_sample_rate
            );
            Ok(resampled)
        } else {
            Ok(raw_audio)
        }
    }

    /// Call espeak-ng to convert text to IPA phonemes.
    fn phonemize(&self, text: &str) -> Result<String> {
        let mut command = Command::new(&self.espeak_binary);
        command
            .args([
                "-q", // quiet (no audio)
                "-b", // explicit UTF-8 input encoding
                "1",
                "--stdin", // avoid Windows argv/codepage issues for Cyrillic text
                "--ipa=2", // IPA output with tie bars
                "-v",
                &self.config.espeak.voice,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Ok(path) = std::env::var("ESPEAK_DATA_PATH") {
            if !path.trim().is_empty() {
                command.env("ESPEAK_DATA_PATH", path);
            }
        }
        if let Ok(path) = std::env::var("ESPEAKNG_DATA_PATH") {
            if !path.trim().is_empty() {
                command.env("ESPEAKNG_DATA_PATH", path);
            }
        }

        debug_log(&format!(
            "espeak preview: binary={} voice={} text={} espeak_data={} espeakng_data={}",
            self.espeak_binary,
            self.config.espeak.voice,
            text,
            std::env::var("ESPEAK_DATA_PATH").unwrap_or_default(),
            std::env::var("ESPEAKNG_DATA_PATH").unwrap_or_default()
        ));

        let mut child = command
            .spawn()
            .context("Failed to run espeak-ng for phonemization")?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(text.as_bytes())
                .context("Failed to write text to espeak-ng stdin")?;
        }

        let output = child
            .wait_with_output()
            .context("Failed to wait for espeak-ng phonemization")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            debug_log(&format!("espeak failed: {}", stderr.trim()));
            anyhow::bail!("espeak-ng failed: {}", stderr);
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if !stderr.is_empty() {
            debug_log(&format!("espeak stderr: {}", stderr));
        }

        let phonemes = String::from_utf8(output.stdout)
            .context("espeak-ng output is not valid UTF-8")?
            .trim()
            .to_string();

        debug_log(&format!("espeak phonemes: {}", phonemes));

        Ok(phonemes)
    }

    /// Convert IPA phoneme string to a sequence of phoneme IDs using the model's phoneme_id_map.
    ///
    /// Follows Piper convention:
    ///   BOS + (phoneme + PAD)* + EOS
    fn phonemes_to_ids(&self, phonemes: &str) -> Vec<i64> {
        let map = &self.config.phoneme_id_map;
        let mut ids: Vec<i64> = Vec::new();

        // BOS token
        if let Some(bos_ids) = map.get(BOS) {
            ids.extend(bos_ids);
        }

        // Each character in the phoneme string
        for ch in phonemes.chars() {
            let key = ch.to_string();
            if let Some(ph_ids) = map.get(&key) {
                ids.extend(ph_ids);
            } else {
                // Skip unknown phonemes but log a warning
                debug!("Unknown phoneme in map: '{}' (U+{:04X})", ch, ch as u32);
                continue;
            }

            // PAD between each phoneme
            if let Some(pad_ids) = map.get(PAD) {
                ids.extend(pad_ids);
            }
        }

        // EOS token
        if let Some(eos_ids) = map.get(EOS) {
            ids.extend(eos_ids);
        }

        ids
    }

    /// Run ONNX inference on phoneme IDs to produce raw audio samples.
    fn infer(&mut self, phoneme_ids: &[i64]) -> Result<Vec<f32>> {
        let seq_len = phoneme_ids.len();

        // input: [1, seq_len] int64
        let input = Array2::from_shape_vec((1, seq_len), phoneme_ids.to_vec())
            .context("Failed to create input tensor")?;

        // input_lengths: [1] int64
        let input_lengths = Array1::from_vec(vec![seq_len as i64]);

        // scales: [3] float32 — [noise_scale, length_scale, noise_w]
        let scales = Array1::from_vec(vec![
            self.config.inference.noise_scale,
            self.config.inference.length_scale,
            self.config.inference.noise_w,
        ]);

        let input_value = Value::from_array(input)?;
        let lengths_value = Value::from_array(input_lengths)?;
        let scales_value = Value::from_array(scales)?;

        let outputs = if self.config.num_speakers > 1 {
            // Multi-speaker model: provide speaker ID
            let sid = Array1::from_vec(vec![0i64]); // default speaker
            let sid_value = Value::from_array(sid)?;
            self.session.run(ort::inputs![
                "input" => input_value,
                "input_lengths" => lengths_value,
                "scales" => scales_value,
                "sid" => sid_value,
            ])?
        } else {
            self.session.run(ort::inputs![
                "input" => input_value,
                "input_lengths" => lengths_value,
                "scales" => scales_value,
            ])?
        };

        // Output shape is typically [1, 1, num_samples]
        let (_shape, raw_data) = outputs[0]
            .try_extract_tensor::<f32>()
            .context("Failed to extract output audio tensor")?;

        // Flatten to 1D
        let samples: Vec<f32> = raw_data.iter().copied().collect();

        Ok(samples)
    }
}

/// Find the espeak-ng binary, checking common paths.
fn find_espeak_ng() -> Result<String> {
    if let Ok(path) = std::env::var("ESPEAK_NG_PATH") {
        if !path.trim().is_empty() {
            let result = Command::new(&path).arg("--version").output();
            if let Ok(output) = result {
                if output.status.success() {
                    return Ok(path);
                }
            }
        }
    }

    // Check PATH first
    let candidates = [
        "espeak-ng.exe",
        "espeak-ng",
        r"C:\Program Files\eSpeak NG\espeak-ng.exe",
        r"C:\Program Files (x86)\eSpeak NG\espeak-ng.exe",
        r"C:\ProgramData\chocolatey\bin\espeak-ng.exe",
        "/opt/homebrew/bin/espeak-ng",
        "/usr/local/bin/espeak-ng",
        "/usr/bin/espeak-ng",
    ];

    for candidate in &candidates {
        let result = Command::new(candidate).arg("--version").output();
        if let Ok(output) = result {
            if output.status.success() {
                return Ok(candidate.to_string());
            }
        }
    }

    anyhow::bail!(
        "espeak-ng not found. Install it with your package manager (apt install espeak-ng / brew install espeak-ng)"
    )
}

/// Resample mono f32 audio using a high-quality sinc interpolator.
fn resample(input: &[f32], from_rate: u32, to_rate: u32) -> Result<Vec<f32>> {
    if input.is_empty() {
        return Ok(Vec::new());
    }

    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };

    let ratio = to_rate as f64 / from_rate as f64;

    let mut resampler = SincFixedIn::<f32>::new(
        ratio,
        2.0, // max_resample_ratio_relative (not used for fixed ratio)
        params,
        input.len(),
        1, // mono channel
    )
    .context("Failed to create resampler")?;

    let waves_in = vec![input.to_vec()];
    let waves_out = resampler
        .process(&waves_in, None)
        .context("Resampling failed")?;

    Ok(waves_out.into_iter().next().unwrap_or_default())
}
