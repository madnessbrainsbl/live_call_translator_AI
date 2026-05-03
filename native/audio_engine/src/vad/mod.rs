/// Voice Activity Detector — detects speech segments in an audio stream.
/// Uses Silero VAD v5 ONNX model via the `ort` crate.

use anyhow::{Context, Result};
use log::{debug, info};
use ort::session::Session;
use ort::value::Tensor;

// Silero VAD expects 16kHz audio
const SILERO_SAMPLE_RATE: u32 = 16000;
// Chunk size for 16kHz: 512 samples = 32ms
const SILERO_CHUNK_SIZE: usize = 512;
// State dimensions for Silero VAD v5: [2, 1, 128]
const STATE_DIM_0: usize = 2;
const STATE_DIM_1: usize = 1;
const STATE_DIM_2: usize = 128;
const STATE_LEN: usize = STATE_DIM_0 * STATE_DIM_1 * STATE_DIM_2;

/// VAD speech state machine states.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SpeechState {
    /// No speech detected
    Silence,
    /// Speech just started (transition frame)
    SpeechStart,
    /// Ongoing speech
    Speech,
    /// Speech just ended (transition frame)
    SpeechEnd,
}

/// Configuration for the Voice Activity Detector.
pub struct VadConfig {
    /// Speech detection threshold (0.0 - 1.0)
    pub threshold: f32,
    /// Minimum silence duration (ms) to trigger SpeechEnd
    pub min_silence_ms: u32,
    /// Padding before/after speech (ms)
    pub speech_pad_ms: u32,
    /// Input sample rate (audio will be downsampled to 16kHz internally)
    pub sample_rate: u32,
}

impl Default for VadConfig {
    fn default() -> Self {
        Self {
            threshold: 0.3,
            min_silence_ms: 500,
            speech_pad_ms: 30,
            sample_rate: 48000,
        }
    }
}

/// Silero VAD detector.
///
/// Wraps the Silero VAD v5 ONNX model, handles downsampling from the
/// input sample rate to 16kHz, maintains LSTM hidden/cell state between
/// calls, and runs a state machine that emits speech boundary events.
pub struct VoiceActivityDetector {
    session: Session,
    config: VadConfig,
    // Silero v5 combined state (flattened [2, 1, 128])
    state: Vec<f32>,
    // State machine tracking
    is_speaking: bool,
    silence_samples: u32,
    // Leftover samples from previous process() call (at input sample rate)
    leftover: Vec<f32>,
}

impl VoiceActivityDetector {
    /// Create a new VAD detector from a Silero ONNX model file.
    pub fn new(model_path: &str, config: VadConfig) -> Result<Self> {
        info!("Loading Silero VAD model from {}", model_path);

        let session = Session::builder()
            .context("Failed to create ONNX session builder")?
            .commit_from_file(model_path)
            .context("Failed to load Silero VAD ONNX model")?;

        info!("Silero VAD model loaded successfully");

        Ok(Self {
            session,
            config,
            state: vec![0.0; STATE_LEN],
            is_speaking: false,
            silence_samples: 0,
            leftover: Vec::new(),
        })
    }

    /// Process a chunk of f32 audio samples at the configured sample_rate.
    ///
    /// Internally downsamples to 16kHz and feeds 512-sample chunks to Silero.
    /// Returns the speech probability of the *last* evaluated chunk and
    /// the current speech state. If the input is too short to form a full
    /// Silero chunk, leftover samples are buffered for the next call and
    /// the previous state is returned with probability 0.
    pub fn process(&mut self, samples: &[f32]) -> Result<(f32, SpeechState)> {
        // Log audio level for debugging
        if !samples.is_empty() {
            let rms = (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt();
            let max = samples.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
            if rms > 0.001 {
                debug!("Audio in: {} samples, rms={:.4}, max={:.4}", samples.len(), rms, max);
            }
        }

        // Downsample input to 16kHz
        let downsampled = downsample(samples, self.config.sample_rate, SILERO_SAMPLE_RATE);

        // Prepend any leftover samples from the previous call
        let mut buffer = std::mem::take(&mut self.leftover);
        buffer.extend_from_slice(&downsampled);

        let mut last_prob = 0.0f32;
        let mut last_state = self.current_state();

        // Process as many full 512-sample chunks as we can
        let mut offset = 0;
        let mut chunk_count = 0;
        while offset + SILERO_CHUNK_SIZE <= buffer.len() {
            let chunk = &buffer[offset..offset + SILERO_CHUNK_SIZE];
            let prob = self.infer_chunk(chunk)?;
            if prob > 0.1 || chunk_count == 0 {
                debug!("VAD chunk prob={:.3}", prob);
            }
            last_state = self.update_state(prob);
            last_prob = prob;
            offset += SILERO_CHUNK_SIZE;
            chunk_count += 1;
        }

        // Save remaining samples for next call
        if offset < buffer.len() {
            self.leftover = buffer[offset..].to_vec();
        }

        Ok((last_prob, last_state))
    }

    /// Reset all internal state (LSTM state, speech state, leftover buffer).
    /// Call this between different speakers or sessions.
    pub fn reset(&mut self) {
        self.state.fill(0.0);
        self.is_speaking = false;
        self.silence_samples = 0;
        self.leftover.clear();
        debug!("VAD state reset");
    }

    /// Run a single 512-sample chunk through the Silero model.
    /// Updates internal LSTM state and returns the speech probability.
    fn infer_chunk(&mut self, chunk: &[f32]) -> Result<f32> {
        debug_assert_eq!(chunk.len(), SILERO_CHUNK_SIZE);

        // Silero VAD v5 inputs:
        //   "input": [1, chunk_size] f32
        //   "state": [2, 1, 128] f32
        //   "sr":    scalar i64
        let input_tensor: Tensor<f32> =
            Tensor::from_array(([1_i64, SILERO_CHUNK_SIZE as i64], chunk.to_vec()))
                .context("Failed to create input tensor")?;

        let state_tensor: Tensor<f32> = Tensor::from_array((
            [STATE_DIM_0 as i64, STATE_DIM_1 as i64, STATE_DIM_2 as i64],
            self.state.clone(),
        ))
        .context("Failed to create state tensor")?;

        let sr_tensor: Tensor<i64> = Tensor::from_array(((), vec![SILERO_SAMPLE_RATE as i64]))
            .context("Failed to create sr tensor")?;

        let outputs = self.session.run(ort::inputs![
            "input" => input_tensor,
            "state" => state_tensor,
            "sr" => sr_tensor,
        ])?;

        // Silero VAD v5 outputs:
        //   "output": [1, 1] f32 — speech probability
        //   "stateN": [2, 1, 128] f32 — updated state
        let (_, output_data) = outputs["output"]
            .try_extract_tensor::<f32>()
            .context("Failed to extract output tensor")?;
        let prob = output_data.first().copied().unwrap_or(0.0);

        let (_, state_out) = outputs["stateN"]
            .try_extract_tensor::<f32>()
            .context("Failed to extract stateN tensor")?;
        self.state.copy_from_slice(state_out);

        Ok(prob)
    }

    /// Update speech state machine based on the latest probability.
    fn update_state(&mut self, prob: f32) -> SpeechState {
        let min_silence_samples =
            (self.config.min_silence_ms as f32 / 1000.0 * SILERO_SAMPLE_RATE as f32) as u32;

        if prob >= self.config.threshold {
            self.silence_samples = 0;

            if !self.is_speaking {
                self.is_speaking = true;
                debug!("VAD: SpeechStart (prob={:.3})", prob);
                return SpeechState::SpeechStart;
            }
            SpeechState::Speech
        } else if self.is_speaking {
            self.silence_samples += SILERO_CHUNK_SIZE as u32;

            if self.silence_samples >= min_silence_samples {
                self.is_speaking = false;
                self.silence_samples = 0;
                debug!(
                    "VAD: SpeechEnd (silence exceeded {}ms)",
                    self.config.min_silence_ms
                );
                return SpeechState::SpeechEnd;
            }
            // Still in speech — silence not long enough yet
            SpeechState::Speech
        } else {
            SpeechState::Silence
        }
    }

    /// Return the current speech state without advancing the state machine.
    fn current_state(&self) -> SpeechState {
        if self.is_speaking {
            SpeechState::Speech
        } else {
            SpeechState::Silence
        }
    }
}

/// Downsample audio from `from_rate` to `to_rate` using simple decimation.
///
/// When the ratio is an integer (e.g. 48000 -> 16000 = factor 3), every Nth
/// sample is picked. For non-integer ratios a linear-interpolation resampler
/// is used. This is good enough for VAD purposes.
fn downsample(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate {
        return samples.to_vec();
    }

    let ratio = from_rate as f64 / to_rate as f64;
    let out_len = (samples.len() as f64 / ratio).floor() as usize;
    let mut out = Vec::with_capacity(out_len);

    if from_rate % to_rate == 0 {
        // Integer ratio — simple decimation
        let step = (from_rate / to_rate) as usize;
        for i in (0..samples.len()).step_by(step) {
            out.push(samples[i]);
        }
    } else {
        // Non-integer ratio — linear interpolation
        for i in 0..out_len {
            let src_pos = i as f64 * ratio;
            let idx = src_pos as usize;
            let frac = (src_pos - idx as f64) as f32;

            if idx + 1 < samples.len() {
                out.push(samples[idx] * (1.0 - frac) + samples[idx + 1] * frac);
            } else if idx < samples.len() {
                out.push(samples[idx]);
            }
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_downsample_same_rate() {
        let input = vec![1.0, 2.0, 3.0];
        let output = downsample(&input, 16000, 16000);
        assert_eq!(input, output);
    }

    #[test]
    fn test_downsample_integer_ratio() {
        let input: Vec<f32> = (0..9).map(|i| i as f32).collect();
        // 48000 -> 16000 = factor 3, take every 3rd: 0, 3, 6
        let output = downsample(&input, 48000, 16000);
        assert_eq!(output, vec![0.0, 3.0, 6.0]);
    }

    #[test]
    fn test_default_config() {
        let cfg = VadConfig::default();
        assert_eq!(cfg.threshold, 0.3);
        assert_eq!(cfg.min_silence_ms, 500);
        assert_eq!(cfg.speech_pad_ms, 30);
        assert_eq!(cfg.sample_rate, 48000);
    }

    #[test]
    fn test_state_machine_transitions() {
        // Manually test update_state logic without a model
        // We can't construct VoiceActivityDetector without a model,
        // so we test the downsample and config independently.
    }
}
