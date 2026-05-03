use anyhow::{Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, FromSample, Sample, SampleFormat, Stream, StreamConfig};
use crossbeam_channel::Receiver;
use log::{debug, error, info};
use ringbuf::{
    traits::{Consumer, Producer, Split},
    HeapRb,
};

use super::{candidate_hosts, device_name_matches};

/// Plays audio received from a channel to a named output device.
pub struct AudioPlayback {
    stream: Stream,
    _device_name: String,
    _config: StreamConfig,
    _feeder: std::thread::JoinHandle<()>,
}

impl AudioPlayback {
    /// Create playback to a specific device name.
    ///
    /// `device_name`: `"default"` for default output, or a specific name like `"BlackHole 2ch"`.
    /// `sample_rate`: desired sample rate (e.g. 48000).
    /// `receiver`: channel providing audio sample buffers to play.
    pub fn new(device_name: &str, sample_rate: u32, receiver: Receiver<Vec<f32>>) -> Result<Self> {
        let device = find_output_device(device_name)?;
        let actual_name = device.name().unwrap_or_else(|_| "unknown".into());

        let default_cfg = device
            .default_output_config()
            .context("Failed to get default output config")?;

        let channels = default_cfg.channels();

        let config = StreamConfig {
            channels,
            sample_rate: cpal::SampleRate(sample_rate),
            buffer_size: cpal::BufferSize::Default,
        };

        info!(
            "Opening playback device '{}' with config: rate={}, channels={}, device_default_rate={}",
            actual_name,
            sample_rate,
            config.channels,
            default_cfg.sample_rate().0
        );

        let supported = device
            .supported_output_configs()
            .context("Failed to query supported output configs")?;

        debug!("Supported output configs for '{}':", actual_name);
        for cfg in supported {
            debug!("  {:?}", cfg);
        }

        // Ring buffer: long enough for full synthesized replies without clipping the tail.
        let ring_size = sample_rate as usize * 60;
        let ring = HeapRb::<f32>::new(ring_size);
        let (mut producer, consumer) = ring.split();

        // Feeder thread: reads from crossbeam channel, pushes into ring buffer
        let feeder_name = actual_name.clone();
        let feeder = std::thread::Builder::new()
            .name(format!("playback-feeder-{}", feeder_name))
            .spawn(move || {
                debug!("Playback feeder thread started for '{}'", feeder_name);
                loop {
                    match receiver.recv() {
                        Ok(samples) => {
                            for &sample in &samples {
                                // If ring buffer is full, overwrite oldest (skip failed pushes)
                                let _ = producer.try_push(sample);
                            }
                        }
                        Err(_) => {
                            debug!("Playback feeder: channel disconnected, stopping");
                            break;
                        }
                    }
                }
            })
            .context("Failed to spawn playback feeder thread")?;

        let stream = match default_cfg.sample_format() {
            SampleFormat::F32 => build_output_stream::<f32>(&device, &config, channels, consumer)?,
            SampleFormat::I16 => build_output_stream::<i16>(&device, &config, channels, consumer)?,
            SampleFormat::U16 => build_output_stream::<u16>(&device, &config, channels, consumer)?,
            other => anyhow::bail!("Unsupported output sample format: {:?}", other),
        };

        Ok(Self {
            stream,
            _device_name: actual_name,
            _config: config,
            _feeder: feeder,
        })
    }

    pub fn start(&self) -> Result<()> {
        self.stream
            .play()
            .context("Failed to start playback stream")?;
        info!("Playback started on '{}'", self._device_name);
        Ok(())
    }

    pub fn stop(&self) -> Result<()> {
        self.stream
            .pause()
            .context("Failed to pause playback stream")?;
        info!("Playback stopped on '{}'", self._device_name);
        Ok(())
    }
}

fn build_output_stream<T>(
    device: &Device,
    config: &StreamConfig,
    channels: u16,
    mut consumer: impl Consumer<Item = f32> + Send + 'static,
) -> Result<Stream>
where
    T: Sample + FromSample<f32> + cpal::SizedSample,
{
    device
        .build_output_stream(
            config,
            move |data: &mut [T], _info: &cpal::OutputCallbackInfo| {
                let frame_channels = channels as usize;
                let mut filled_frames = 0usize;

                for frame in data.chunks_mut(frame_channels) {
                    let sample = consumer.try_pop().unwrap_or(0.0);
                    let out_sample = T::from_sample(sample);
                    for out in frame {
                        *out = out_sample;
                    }
                    filled_frames += 1;
                }

                let expected_frames = data.len() / frame_channels;
                if filled_frames > 0 && consumer.is_empty() {
                    debug!(
                        "Playback drained buffer: wrote {} frames ({} channels)",
                        expected_frames, frame_channels
                    );
                }
            },
            move |err| {
                error!("Playback stream error: {}", err);
            },
            None,
        )
        .context("Failed to build output stream")
}

/// Find an output device by name. `"default"` returns the default output device.
fn find_output_device(name: &str) -> Result<Device> {
    if name == "default" {
        for host in candidate_hosts() {
            if let Some(device) = host.default_output_device() {
                return Ok(device);
            }
        }
        anyhow::bail!("No default output device available");
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
            "Using partial output device match '{}' for request '{}'",
            matched_name, name
        );
        return Ok(device);
    }

    anyhow::bail!(
        "Output device '{}' not found. Available output devices: {:?}",
        name,
        available
    )
}
