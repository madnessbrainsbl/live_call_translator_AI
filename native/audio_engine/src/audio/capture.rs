use anyhow::{Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream, StreamConfig};
use crossbeam_channel::Sender;
use log::{debug, error, info};

use super::{candidate_hosts, device_name_matches};

pub struct AudioChunk {
    pub samples: Vec<f32>,
}

pub const SYSTEM_LOOPBACK_DEVICE: &str = "__system_output_loopback__";

/// Captures audio from a named device and sends chunks to a channel.
pub struct AudioCapture {
    stream: Stream,
    device_name: String,
    sample_rate: u32,
}

pub fn input_device_exists(name: &str) -> bool {
    find_input_device(name).is_ok()
}

pub fn output_loopback_device_exists(name: &str) -> bool {
    find_output_device(name).is_ok()
}

pub fn is_system_loopback_device(name: &str) -> bool {
    name == SYSTEM_LOOPBACK_DEVICE
}

impl AudioCapture {
    /// Create capture from a specific device name.
    ///
    /// Uses the device's default configuration (sample rate + channels) to guarantee
    /// compatibility across different devices (built-in mic, headphones, etc.).
    /// Audio is downmixed to mono before sending.
    pub fn new(device_name: &str, sender: Sender<AudioChunk>) -> Result<Self> {
        let device = find_input_device(device_name)?;
        let actual_name = device.name().unwrap_or_else(|_| "unknown".into());

        let default_cfg = device
            .default_input_config()
            .context("Failed to get default input config")?;

        let channels = default_cfg.channels();
        let sample_rate = default_cfg.sample_rate().0;

        let config = StreamConfig {
            channels,
            sample_rate: default_cfg.sample_rate(),
            buffer_size: cpal::BufferSize::Default,
        };

        info!(
            "Opening capture device '{}': rate={}, channels={}",
            actual_name, sample_rate, channels
        );

        let stream = match default_cfg.sample_format() {
            SampleFormat::F32 => build_input_stream_f32(&device, &config, channels, sender)?,
            SampleFormat::I16 => build_input_stream_i16(&device, &config, channels, sender)?,
            SampleFormat::U16 => build_input_stream_u16(&device, &config, channels, sender)?,
            other => anyhow::bail!("Unsupported input sample format: {:?}", other),
        };

        Ok(Self {
            stream,
            device_name: actual_name,
            sample_rate,
        })
    }

    /// Create WASAPI loopback capture from an output device.
    ///
    /// On Windows, cpal transparently enables WASAPI loopback when an input
    /// stream is built on a render endpoint. Other platforms will fail cleanly.
    pub fn new_loopback(output_device_name: &str, sender: Sender<AudioChunk>) -> Result<Self> {
        let device = find_output_device(output_device_name)?;
        let actual_name = device.name().unwrap_or_else(|_| "unknown".into());

        let default_cfg = device
            .default_output_config()
            .context("Failed to get default output config for loopback capture")?;

        let channels = default_cfg.channels();
        let sample_rate = default_cfg.sample_rate().0;

        let config = StreamConfig {
            channels,
            sample_rate: default_cfg.sample_rate(),
            buffer_size: cpal::BufferSize::Default,
        };

        info!(
            "Opening output loopback capture device '{}': rate={}, channels={}",
            actual_name, sample_rate, channels
        );

        let stream = match default_cfg.sample_format() {
            SampleFormat::F32 => build_input_stream_f32(&device, &config, channels, sender)?,
            SampleFormat::I16 => build_input_stream_i16(&device, &config, channels, sender)?,
            SampleFormat::U16 => build_input_stream_u16(&device, &config, channels, sender)?,
            other => anyhow::bail!("Unsupported loopback sample format: {:?}", other),
        };

        Ok(Self {
            stream,
            device_name: format!("{} (loopback)", actual_name),
            sample_rate,
        })
    }

    pub fn start(&self) -> Result<()> {
        self.stream
            .play()
            .context("Failed to start capture stream")?;
        info!("Capture started on '{}'", self.device_name);
        Ok(())
    }

    pub fn stop(&self) -> Result<()> {
        self.stream
            .pause()
            .context("Failed to pause capture stream")?;
        info!("Capture stopped on '{}'", self.device_name);
        Ok(())
    }

    /// Actual sample rate the device is running at.
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
}

fn build_input_stream_f32(
    device: &Device,
    config: &StreamConfig,
    channels: u16,
    sender: Sender<AudioChunk>,
) -> Result<Stream> {
    device
        .build_input_stream(
            config,
            move |data: &[f32], _info: &cpal::InputCallbackInfo| {
                let mono: Vec<f32> = if channels == 1 {
                    data.to_vec()
                } else {
                    data.chunks(channels as usize)
                        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
                        .collect()
                };
                let chunk = AudioChunk { samples: mono };
                if let Err(e) = sender.try_send(chunk) {
                    debug!("Capture channel full or disconnected: {}", e);
                }
            },
            move |err| error!("Capture stream error: {}", err),
            None,
        )
        .context("Failed to build input stream")
}

fn build_input_stream_i16(
    device: &Device,
    config: &StreamConfig,
    channels: u16,
    sender: Sender<AudioChunk>,
) -> Result<Stream> {
    device
        .build_input_stream(
            config,
            move |data: &[i16], _info: &cpal::InputCallbackInfo| {
                let mono: Vec<f32> = if channels == 1 {
                    data.iter().map(|&s| s as f32 / 32768.0).collect()
                } else {
                    data.chunks(channels as usize)
                        .map(|frame| {
                            frame.iter().map(|&s| s as f32 / 32768.0).sum::<f32>() / channels as f32
                        })
                        .collect()
                };
                let chunk = AudioChunk { samples: mono };
                if let Err(e) = sender.try_send(chunk) {
                    debug!("Capture channel full or disconnected: {}", e);
                }
            },
            move |err| error!("Capture stream error: {}", err),
            None,
        )
        .context("Failed to build input stream")
}

fn build_input_stream_u16(
    device: &Device,
    config: &StreamConfig,
    channels: u16,
    sender: Sender<AudioChunk>,
) -> Result<Stream> {
    device
        .build_input_stream(
            config,
            move |data: &[u16], _info: &cpal::InputCallbackInfo| {
                let mono: Vec<f32> = if channels == 1 {
                    data.iter()
                        .map(|&s| (s as f32 - 32768.0) / 32768.0)
                        .collect()
                } else {
                    data.chunks(channels as usize)
                        .map(|frame| {
                            frame
                                .iter()
                                .map(|&s| (s as f32 - 32768.0) / 32768.0)
                                .sum::<f32>()
                                / channels as f32
                        })
                        .collect()
                };
                let chunk = AudioChunk { samples: mono };
                if let Err(e) = sender.try_send(chunk) {
                    debug!("Capture channel full or disconnected: {}", e);
                }
            },
            move |err| error!("Capture stream error: {}", err),
            None,
        )
        .context("Failed to build input stream")
}

/// Find an input device by name. `"default"` returns the default input device.
fn find_input_device(name: &str) -> Result<Device> {
    if name == "default" {
        for host in candidate_hosts() {
            if let Some(device) = host.default_input_device() {
                return Ok(device);
            }
        }
        anyhow::bail!("No default input device available. Microphone may be disconnected, disabled, or blocked by OS privacy settings.");
    }

    let mut available = Vec::new();
    let mut partial_match = None;

    for host in candidate_hosts() {
        if let Ok(devices) = host.input_devices() {
            for device in devices {
                let dev_name = device.name().unwrap_or_else(|_| "unknown".into());
                if dev_name == name {
                    return Ok(device);
                }

                if partial_match.is_none() && device_name_matches(&dev_name, name) {
                    partial_match = Some((device, dev_name.clone()));
                }

                if !available.contains(&dev_name) {
                    available.push(dev_name);
                }
            }
        }
    }

    if let Some((device, matched_name)) = partial_match {
        info!(
            "Using partial input device match '{}' for request '{}'",
            matched_name, name
        );
        return Ok(device);
    }

    if available.is_empty() {
        anyhow::bail!(
            "Input device '{}' not found because no input devices are available at all. Microphone may be disconnected, disabled, or blocked by OS privacy settings.",
            name
        )
    } else {
        anyhow::bail!(
            "Input device '{}' not found. Available input devices: {:?}",
            name,
            available
        )
    }
}

/// Find an output device by name. `"default"` returns the default output device.
fn find_output_device(name: &str) -> Result<Device> {
    if name == "default" {
        for host in candidate_hosts() {
            if let Some(device) = host.default_output_device() {
                return Ok(device);
            }
        }
        anyhow::bail!("No default output device available for system loopback capture.");
    }

    let mut available = Vec::new();
    let mut partial_match = None;

    for host in candidate_hosts() {
        if let Ok(devices) = host.output_devices() {
            for device in devices {
                let dev_name = device.name().unwrap_or_else(|_| "unknown".into());
                if dev_name == name {
                    return Ok(device);
                }

                if partial_match.is_none() && device_name_matches(&dev_name, name) {
                    partial_match = Some((device, dev_name.clone()));
                }

                if !available.contains(&dev_name) {
                    available.push(dev_name);
                }
            }
        }
    }

    if let Some((device, matched_name)) = partial_match {
        info!(
            "Using partial output loopback device match '{}' for request '{}'",
            matched_name, name
        );
        return Ok(device);
    }

    anyhow::bail!(
        "Output device '{}' not found for system loopback capture. Available output devices: {:?}",
        name,
        available
    )
}
