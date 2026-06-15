//! Main engine coordinator.
//!
//! Two pipelines:
//!   OUTGOING: Mic -> Deepgram(ru) -> Translate(ru->en) -> TTS(en) -> Speakers
//!   INCOMING: Call audio input -> Deepgram(en) -> Translate(en->ru) -> TTS(ru) -> Speakers

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::{bail, Context, Result};
use crossbeam_channel::{bounded, Sender};
use log::{error, info, warn};

use crate::audio;
use crate::audio::capture::{
    input_device_exists, is_system_loopback_device, output_loopback_device_exists, AudioCapture,
    AudioChunk,
};
use crate::audio::playback::AudioPlayback;
use crate::protocol::Event;
use crate::stt::DeepgramStt;
use crate::translation::{TranslationDirection, TranslationEngine};
use crate::tts::TtsEngine;

const CONFIG_DEEPGRAM_API_KEY: &str = "deepgram_api_key";
const CONFIG_GROQ_API_KEY: &str = "groq_api_key";
const CONFIG_MIC_DEVICE: &str = "mic_device";
const CONFIG_SPEAKER_DEVICE: &str = "speaker_device";
const CONFIG_MEET_INPUT_DEVICE: &str = "meet_input_device";
const CONFIG_MEET_OUTPUT_DEVICE: &str = "meet_output_device";
const CONFIG_ENDPOINTING_MS: &str = "endpointing_ms";
const CONFIG_MY_LANGUAGE: &str = "my_language";
const CONFIG_THEIR_LANGUAGE: &str = "their_language";
const CONFIG_TEXT_ONLY_MODE: &str = "text_only_mode";
const CONFIG_TRANSCRIPT_ONLY_MODE: &str = "transcript_only_mode";
const CONFIG_TRANSLATION_ENABLED: &str = "translation_enabled";
const CONFIG_TTS_ENABLED: &str = "tts_enabled";
const CONFIG_TTS_PROVIDER: &str = "tts_provider";
const CONFIG_SAMPLE_RATE: &str = "sample_rate";
const INCOMING_ENDPOINTING_FLOOR_MS: u32 = 900;
const OUTGOING_MERGE_SILENCE_MS: u64 = 2_200;
const INCOMING_MERGE_SILENCE_MS: u64 = 4_200;
const OUTGOING_SHORT_MERGE_SILENCE_MS: u64 = 650;
const INCOMING_SHORT_MERGE_SILENCE_MS: u64 = 900;
const MAX_MERGE_POLL_MS: u64 = 250;
const OUTGOING_INCOMPLETE_MERGE_SILENCE_MS: u64 = 4_500;
const INCOMING_INCOMPLETE_MERGE_SILENCE_MS: u64 = 7_000;
const SHORT_COMPLETE_UTTERANCE_MAX_WORDS: usize = 3;
const MAX_WEAK_INCOMING_FRAGMENT_WORDS: usize = 8;
const INCOMING_ACTIVITY_RMS: f32 = 0.006;
const INCOMING_ACTIVITY_PEAK: f32 = 0.025;
const INCOMING_ACTIVITY_HANGOVER_MS: u64 = 1_100;
const OUTGOING_MIC_RMS: f32 = 0.010;
const OUTGOING_MIC_PEAK: f32 = 0.035;
const OUTGOING_MIC_HANGOVER_MS: u64 = 650;
const OUTGOING_BLEED_RMS: f32 = 0.003;
const OUTGOING_BLEED_PEAK: f32 = 0.012;
const AUDIO_DROP_DEBUG_INTERVAL_MS: u64 = 1_000;

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

// ---------------------------------------------------------------------------
// EngineConfig
// ---------------------------------------------------------------------------

pub struct EngineConfig {
    pub deepgram_api_key: String,
    pub groq_api_key: String,
    pub tts_en_model: String,
    pub tts_en_config: String,
    pub tts_ru_model: String,
    pub tts_ru_config: String,
    pub mic_device: String,
    pub speaker_device: String,
    pub meet_input_device: String,
    pub meet_output_device: String,
    pub sample_rate: u32,
    pub endpointing_ms: u32,
    pub my_language: String,
    pub their_language: String,
    pub tts_enabled: bool,
    pub translation_enabled: bool,
    pub tts_provider: String,
}

impl EngineConfig {
    pub fn from_env() -> Self {
        let base = std::env::var("TRANSLATOR_MODELS_DIR").unwrap_or_else(|_| "./models".into());
        let (default_meet_input, default_meet_output) = default_virtual_devices();
        let default_sample_rate = default_sample_rate();

        Self {
            deepgram_api_key: std::env::var("DEEPGRAM_API_KEY").unwrap_or_default(),
            groq_api_key: std::env::var("GROQ_API_KEY").unwrap_or_default(),
            tts_en_model: std::env::var("TRANSLATOR_TTS_EN_MODEL")
                .unwrap_or_else(|_| format!("{}/piper-en/en_US-ryan-medium.onnx", base)),
            tts_en_config: std::env::var("TRANSLATOR_TTS_EN_CONFIG")
                .unwrap_or_else(|_| format!("{}/piper-en/en_US-ryan-medium.onnx.json", base)),
            tts_ru_model: std::env::var("TRANSLATOR_TTS_RU_MODEL")
                .unwrap_or_else(|_| format!("{}/piper-ru/ru_RU-denis-medium.onnx", base)),
            tts_ru_config: std::env::var("TRANSLATOR_TTS_RU_CONFIG")
                .unwrap_or_else(|_| format!("{}/piper-ru/ru_RU-denis-medium.onnx.json", base)),
            mic_device: std::env::var("TRANSLATOR_MIC_DEVICE").unwrap_or_else(|_| "default".into()),
            speaker_device: std::env::var("TRANSLATOR_SPEAKER_DEVICE")
                .unwrap_or_else(|_| "default".into()),
            meet_input_device: std::env::var("TRANSLATOR_MEET_INPUT")
                .unwrap_or_else(|_| default_meet_input.clone()),
            meet_output_device: std::env::var("TRANSLATOR_MEET_OUTPUT")
                .unwrap_or(default_meet_output),
            sample_rate: std::env::var("TRANSLATOR_SAMPLE_RATE")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(default_sample_rate),
            endpointing_ms: std::env::var("TRANSLATOR_ENDPOINTING_MS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(700),
            my_language: std::env::var("TRANSLATOR_MY_LANG").unwrap_or_else(|_| "ru".into()),
            their_language: std::env::var("TRANSLATOR_THEIR_LANG").unwrap_or_else(|_| "en".into()),
            tts_enabled: std::env::var("TRANSLATOR_TTS_ENABLED")
                .map(|s| {
                    !matches!(
                        s.to_ascii_lowercase().as_str(),
                        "0" | "false" | "no" | "off"
                    )
                })
                .unwrap_or(true),
            translation_enabled: std::env::var("TRANSLATOR_TRANSLATION_ENABLED")
                .map(|s| {
                    !matches!(
                        s.to_ascii_lowercase().as_str(),
                        "0" | "false" | "no" | "off"
                    )
                })
                .unwrap_or(true),
            tts_provider: std::env::var("TRANSLATOR_TTS_PROVIDER")
                .unwrap_or_else(|_| "piper".into())
                .to_ascii_lowercase(),
        }
    }
}

fn default_virtual_devices() -> (String, String) {
    match std::env::consts::OS {
        "linux" => ("translator_call_in".into(), "translator_call_out".into()),
        "windows" => (
            "CABLE-A Output (VB-Audio Cable A)".into(),
            "CABLE-B Input (VB-Audio Cable B)".into(),
        ),
        _ => ("BlackHole 16ch".into(), "BlackHole 2ch".into()),
    }
}

fn default_sample_rate() -> u32 {
    match std::env::consts::OS {
        "linux" => 44_100,
        _ => 48_000,
    }
}

fn json_string(value: &serde_json::Value) -> Option<String> {
    value.as_str().map(|v| v.trim().to_string())
}

fn json_u32(value: &serde_json::Value) -> Option<u32> {
    if let Some(v) = value.as_u64() {
        return u32::try_from(v).ok();
    }

    value.as_str()?.trim().parse::<u32>().ok()
}

fn normalized_tts_provider(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "edge" => "edge".into(),
        "browser" => "browser".into(),
        _ => "piper".into(),
    }
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

#[derive(Debug, PartialEq)]
enum EngineState {
    Idle,
    Running,
    ShuttingDown,
}

pub struct Engine {
    state: EngineState,
    config: EngineConfig,
    event_tx: Sender<Event>,
    pipeline_handles: Vec<thread::JoinHandle<()>>,
    stop_flag: Option<Arc<AtomicBool>>,
    mute_outgoing: Arc<AtomicBool>,
    mute_incoming: Arc<AtomicBool>,
    tts_enabled: Arc<AtomicBool>,
    translation_enabled: Arc<AtomicBool>,
    browser_monitor_enabled: Arc<AtomicBool>,
    recent_tts: Arc<Mutex<Vec<RecentTts>>>,
}

#[derive(Clone, Debug)]
struct RecentTts {
    direction: String,
    normalized_text: String,
    created_at: Instant,
}

impl Engine {
    pub fn new(config: EngineConfig, event_tx: Sender<Event>) -> Self {
        let tts_enabled = config.tts_enabled;
        let translation_enabled = config.translation_enabled;
        Self {
            state: EngineState::Idle,
            config,
            event_tx,
            pipeline_handles: Vec::new(),
            stop_flag: None,
            mute_outgoing: Arc::new(AtomicBool::new(false)),
            mute_incoming: Arc::new(AtomicBool::new(false)),
            tts_enabled: Arc::new(AtomicBool::new(tts_enabled)),
            translation_enabled: Arc::new(AtomicBool::new(translation_enabled)),
            browser_monitor_enabled: Arc::new(AtomicBool::new(false)),
            recent_tts: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn is_shutting_down(&self) -> bool {
        self.state == EngineState::ShuttingDown
    }

    pub fn handle_command(&mut self, cmd: crate::protocol::Command) -> Vec<Event> {
        use crate::protocol::Command;

        match cmd {
            Command::Ping => vec![Event::Pong],

            Command::Start { pipelines, config } => {
                if self.state == EngineState::Running {
                    return vec![
                        Event::Log {
                            level: "info".into(),
                            message: "Pipelines already running; keeping current pipelines".into(),
                        },
                        Event::Started {
                            pipelines: pipelines.clone(),
                        },
                    ];
                }

                if let Some(config) = config.as_ref() {
                    self.apply_start_config(config);
                }

                if let Err(e) = audio::list_devices() {
                    info!("Could not enumerate audio devices: {:#}", e);
                }

                if self.config.deepgram_api_key.is_empty() {
                    return vec![Event::Error {
                        message: "DEEPGRAM_API_KEY is not set".into(),
                    }];
                }

                match self.start_pipelines(&pipelines) {
                    Ok(()) => {
                        self.state = EngineState::Running;
                        vec![
                            Event::Log {
                                level: "info".into(),
                                message: format!("Starting pipelines: {:?}", pipelines),
                            },
                            Event::Started {
                                pipelines: pipelines.clone(),
                            },
                        ]
                    }
                    Err(e) => {
                        error!("Failed to start pipelines: {:#}", e);
                        vec![Event::Error {
                            message: format!("Failed to start pipelines: {:#}", e),
                        }]
                    }
                }
            }

            Command::Stop => {
                self.stop_pipelines();
                self.state = EngineState::Idle;
                vec![
                    Event::Log {
                        level: "info".into(),
                        message: "Pipelines stopped".into(),
                    },
                    Event::Stopped,
                ]
            }

            Command::SetConfig { key, value } => {
                self.apply_config(&key, &value);
                vec![Event::Log {
                    level: "info".into(),
                    message: format!("Config set: {} = {}", key, value),
                }]
            }

            Command::ListDevices => match audio::list_devices() {
                Ok((input, output)) => vec![Event::DeviceList { input, output }],
                Err(e) => vec![Event::Error {
                    message: format!("Failed to list devices: {:#}", e),
                }],
            },

            Command::TtsPreview { lang, voice } => {
                debug_log(&format!(
                    "TTS preview requested: lang={}, voice={}",
                    lang, voice
                ));
                let models_base =
                    std::env::var("TRANSLATOR_MODELS_DIR").unwrap_or_else(|_| "./models".into());
                let model_path = format!("{}/piper-{}/{}.onnx", models_base, lang, voice);
                let config_path = format!("{}/piper-{}/{}.onnx.json", models_base, lang, voice);
                let text = match lang.as_str() {
                    "ru" => "Здравствуйте. Сейчас вы слышите русский тестовый голос.",
                    "de" => "Hallo, dies ist ein Stimmtest.",
                    "fr" => "Bonjour, ceci est un test de voix.",
                    "es" => "Hola, esta es una prueba de voz.",
                    "it" => "Ciao, questo è un test vocale.",
                    "pt" => "Olá, este é um teste de voz.",
                    "zh" => "你好，这是语音测试。",
                    "ar" => "مرحبا، هذا اختبار صوتي.",
                    "hi" => "नमस्ते, यह एक आवाज़ परीक्षण है।",
                    "tr" => "Merhaba, bu bir ses testidir.",
                    "nl" => "Hallo, dit is een stemtest.",
                    "pl" => "Cześć, to jest test głosu.",
                    "uk" => "Привіт, це тест голосу.",
                    _ => "Hello. You are now hearing the English test voice.",
                };

                match TtsEngine::new(&config_path, &model_path, self.config.sample_rate) {
                    Ok(mut tts) => {
                        debug_log(&format!("TTS preview model loaded: {}", model_path));
                        match tts.synthesize(text) {
                            Ok(samples) => {
                                let sample_count = samples.len();
                                let peak = samples.iter().fold(0.0_f32, |max, &s| max.max(s.abs()));
                                debug_log(&format!(
                                    "TTS preview synthesized: samples={}, peak={:.5}",
                                    sample_count, peak
                                ));

                                if sample_count == 0 || peak <= 0.000_001 {
                                    debug_log("TTS preview produced silent audio");
                                    return vec![Event::Error {
                                        message: format!(
                                            "Preview synthesis produced silent audio: samples={}, peak={:.8}",
                                            sample_count, peak
                                        ),
                                    }];
                                }

                                let monitor_rate = 16000u32;
                                let monitor_samples =
                                    resample(&samples, self.config.sample_rate, monitor_rate);
                                let mut pcm_bytes = Vec::with_capacity(monitor_samples.len() * 2);
                                for &s in &monitor_samples {
                                    let i = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
                                    pcm_bytes.extend_from_slice(&i.to_le_bytes());
                                }
                                use base64::Engine as _;
                                let b64 =
                                    base64::engine::general_purpose::STANDARD.encode(&pcm_bytes);
                                debug_log(&format!(
                                    "TTS preview audio event prepared: bytes={}",
                                    pcm_bytes.len()
                                ));

                                vec![
                                    Event::TtsAudio {
                                        direction: "preview".into(),
                                        sample_rate: monitor_rate,
                                        audio_b64: b64,
                                    },
                                    Event::Log {
                                        level: "info".into(),
                                        message: format!(
                                            "Preview synthesis ok: samples={}, peak={:.5}",
                                            sample_count, peak
                                        ),
                                    },
                                    Event::TtsPreviewDone,
                                ]
                            }
                            Err(e) => {
                                debug_log(&format!("TTS preview synthesis failed: {:#}", e));
                                vec![Event::Error {
                                    message: format!("Preview synthesis failed: {:#}", e),
                                }]
                            }
                        }
                    }
                    Err(e) => {
                        debug_log(&format!("TTS preview load failed: {:#}", e));
                        vec![Event::Error {
                            message: format!("Preview TTS load failed: {:#}", e),
                        }]
                    }
                }
            }

            Command::Shutdown => {
                let mut events = Vec::new();
                if self.state == EngineState::Running {
                    self.stop_pipelines();
                    events.push(Event::Stopped);
                }
                self.state = EngineState::ShuttingDown;
                events
            }
        }
    }

    fn apply_start_config(&mut self, config: &HashMap<String, serde_json::Value>) {
        for (key, value) in config {
            match key.as_str() {
                CONFIG_DEEPGRAM_API_KEY => {
                    if let Some(v) = json_string(value) {
                        self.config.deepgram_api_key = v;
                    }
                }
                CONFIG_GROQ_API_KEY => {
                    if let Some(v) = json_string(value) {
                        self.config.groq_api_key = v;
                    }
                }
                CONFIG_MIC_DEVICE => {
                    if let Some(v) = json_string(value) {
                        self.config.mic_device = v;
                    }
                }
                CONFIG_SPEAKER_DEVICE => {
                    if let Some(v) = json_string(value) {
                        self.config.speaker_device = v;
                    }
                }
                CONFIG_MEET_INPUT_DEVICE => {
                    if let Some(v) = json_string(value) {
                        self.config.meet_input_device = v;
                    }
                }
                CONFIG_MEET_OUTPUT_DEVICE => {
                    if let Some(v) = json_string(value) {
                        self.config.meet_output_device = v;
                    }
                }
                CONFIG_ENDPOINTING_MS => {
                    if let Some(v) = json_u32(value) {
                        self.config.endpointing_ms = v;
                    }
                }
                CONFIG_MY_LANGUAGE => {
                    if let Some(v) = json_string(value) {
                        self.config.my_language = v;
                    }
                }
                CONFIG_THEIR_LANGUAGE => {
                    if let Some(v) = json_string(value) {
                        self.config.their_language = v;
                    }
                }
                CONFIG_TEXT_ONLY_MODE => {
                    if let Some(text_only) = value.as_bool() {
                        let enabled = !text_only;
                        self.config.tts_enabled = enabled;
                        self.tts_enabled.store(enabled, Ordering::SeqCst);
                    }
                }
                CONFIG_TRANSCRIPT_ONLY_MODE => {
                    if let Some(transcript_only) = value.as_bool() {
                        let enabled = !transcript_only;
                        self.config.translation_enabled = enabled;
                        self.translation_enabled.store(enabled, Ordering::SeqCst);
                    }
                }
                CONFIG_TRANSLATION_ENABLED => {
                    if let Some(enabled) = value.as_bool() {
                        self.config.translation_enabled = enabled;
                        self.translation_enabled.store(enabled, Ordering::SeqCst);
                    }
                }
                CONFIG_TTS_ENABLED => {
                    if let Some(enabled) = value.as_bool() {
                        self.config.tts_enabled = enabled;
                        self.tts_enabled.store(enabled, Ordering::SeqCst);
                    }
                }
                CONFIG_TTS_PROVIDER => {
                    if let Some(v) = json_string(value) {
                        self.config.tts_provider = normalized_tts_provider(&v);
                    }
                }
                CONFIG_SAMPLE_RATE => {
                    if let Some(v) = json_u32(value) {
                        self.config.sample_rate = v;
                    }
                }
                _ => {}
            }
        }
    }

    fn apply_config(&mut self, key: &str, value: &serde_json::Value) {
        match key {
            CONFIG_MY_LANGUAGE => {
                if let Some(v) = json_string(value) {
                    self.config.my_language = v;
                    info!("My language: {}", self.config.my_language);
                }
            }
            CONFIG_THEIR_LANGUAGE => {
                if let Some(v) = json_string(value) {
                    self.config.their_language = v;
                    info!("Their language: {}", self.config.their_language);
                }
            }
            CONFIG_ENDPOINTING_MS => {
                if let Some(v) = json_u32(value) {
                    self.config.endpointing_ms = v;
                    info!("Updated endpointing_ms to {}", v);
                }
            }
            "mute_outgoing" => {
                let muted = value.as_bool().unwrap_or(false);
                self.mute_outgoing.store(muted, Ordering::SeqCst);
                info!("Outgoing mute: {}", muted);
            }
            "mute_incoming" => {
                let muted = value.as_bool().unwrap_or(false);
                self.mute_incoming.store(muted, Ordering::SeqCst);
                info!("Incoming mute: {}", muted);
            }
            "tts_enabled" => {
                let enabled = value.as_bool().unwrap_or(true);
                self.config.tts_enabled = enabled;
                self.tts_enabled.store(enabled, Ordering::SeqCst);
                info!("TTS enabled: {}", enabled);
            }
            CONFIG_TEXT_ONLY_MODE => {
                let enabled = !value.as_bool().unwrap_or(false);
                self.config.tts_enabled = enabled;
                self.tts_enabled.store(enabled, Ordering::SeqCst);
                info!("TTS enabled: {}", enabled);
            }
            CONFIG_TRANSCRIPT_ONLY_MODE => {
                let enabled = !value.as_bool().unwrap_or(false);
                self.config.translation_enabled = enabled;
                self.translation_enabled.store(enabled, Ordering::SeqCst);
                info!("Translation enabled: {}", enabled);
            }
            CONFIG_TRANSLATION_ENABLED => {
                let enabled = value.as_bool().unwrap_or(true);
                self.config.translation_enabled = enabled;
                self.translation_enabled.store(enabled, Ordering::SeqCst);
                info!("Translation enabled: {}", enabled);
            }
            CONFIG_TTS_PROVIDER => {
                if let Some(v) = value.as_str() {
                    self.config.tts_provider = normalized_tts_provider(v);
                    info!("TTS provider: {}", self.config.tts_provider);
                }
            }
            "browser_monitor_enabled" => {
                let enabled = value.as_bool().unwrap_or(false);
                self.browser_monitor_enabled
                    .store(enabled, Ordering::SeqCst);
                info!("Browser monitor playback enabled: {}", enabled);
            }
            _ => warn!("Unknown config key: {}", key),
        }
    }

    fn start_pipelines(&mut self, pipelines: &[String]) -> Result<()> {
        self.validate_pipeline_devices(pipelines)?;

        let stop_flag = Arc::new(AtomicBool::new(false));
        self.stop_flag = Some(stop_flag.clone());

        let translation_enabled = self.translation_enabled.load(Ordering::SeqCst);
        let translator = if translation_enabled || !self.config.groq_api_key.trim().is_empty() {
            info!("Loading translation models...");
            Arc::new(
                TranslationEngine::new(&self.config.groq_api_key)
                    .context("Failed to initialize translation engine")?,
            )
        } else {
            Arc::new(TranslationEngine::disabled())
        };

        let tts_provider =
            if self.config.tts_provider == "edge" || self.config.tts_provider == "browser" {
                self.config.tts_provider.as_str()
            } else {
                "piper"
            };
        let mut tts_out = if tts_provider != "piper" {
            info!(
                "External TTS provider '{}' selected; skipping Piper model load.",
                tts_provider
            );
            Some(None)
        } else {
            info!("Loading TTS models...");
            Some(Some(
                TtsEngine::new(
                    &self.config.tts_en_config,
                    &self.config.tts_en_model,
                    self.config.sample_rate,
                )
                .context("Failed to load TTS engine (outgoing/en)")?,
            ))
        };
        let mut tts_in = if tts_provider != "piper" {
            Some(None)
        } else {
            Some(Some(
                TtsEngine::new(
                    &self.config.tts_ru_config,
                    &self.config.tts_ru_model,
                    self.config.sample_rate,
                )
                .context("Failed to load TTS engine (incoming/ru)")?,
            ))
        };

        info!("All models loaded, spawning pipelines...");

        let wants_outgoing = pipelines.iter().any(|pipeline| pipeline == "outgoing");
        let wants_incoming = pipelines.iter().any(|pipeline| pipeline == "incoming");
        let dual_channel_mode = wants_outgoing && wants_incoming;
        let incoming_audio_active_until = Arc::new(AtomicU64::new(0));

        for pipeline_name in pipelines {
            match pipeline_name.as_str() {
                "outgoing" => {
                    let tts = tts_out.take().expect("outgoing TTS already taken");
                    let capture_device = self.config.mic_device.clone();
                    let stt = DeepgramStt::new(
                        self.config.deepgram_api_key.clone(),
                        self.config.my_language.clone(),
                        endpointing_ms_for_direction("outgoing", self.config.endpointing_ms),
                    );
                    let handle = spawn_pipeline(
                        "outgoing",
                        capture_device,
                        self.config.meet_output_device.clone(),
                        self.config.speaker_device.clone(),
                        self.config.sample_rate,
                        stt,
                        translator.clone(),
                        TranslationDirection::new(
                            &self.config.my_language,
                            &self.config.their_language,
                        ),
                        &self.config.my_language,
                        tts,
                        self.event_tx.clone(),
                        stop_flag.clone(),
                        self.mute_outgoing.clone(),
                        self.tts_enabled.clone(),
                        self.translation_enabled.clone(),
                        self.browser_monitor_enabled.clone(),
                        self.recent_tts.clone(),
                        dual_channel_mode,
                        incoming_audio_active_until.clone(),
                        tts_provider.to_string(),
                    )?;
                    self.pipeline_handles.push(handle);
                }
                "incoming" => {
                    let tts = tts_in.take().expect("incoming TTS already taken");
                    let stt = DeepgramStt::new(
                        self.config.deepgram_api_key.clone(),
                        self.config.their_language.clone(),
                        endpointing_ms_for_direction("incoming", self.config.endpointing_ms),
                    );
                    let handle = spawn_pipeline(
                        "incoming",
                        self.config.meet_input_device.clone(),
                        self.config.speaker_device.clone(),
                        self.config.speaker_device.clone(),
                        self.config.sample_rate,
                        stt,
                        translator.clone(),
                        TranslationDirection::new(
                            &self.config.their_language,
                            &self.config.my_language,
                        ),
                        &self.config.their_language,
                        tts,
                        self.event_tx.clone(),
                        stop_flag.clone(),
                        self.mute_incoming.clone(),
                        self.tts_enabled.clone(),
                        self.translation_enabled.clone(),
                        self.browser_monitor_enabled.clone(),
                        self.recent_tts.clone(),
                        dual_channel_mode,
                        incoming_audio_active_until.clone(),
                        tts_provider.to_string(),
                    )?;
                    self.pipeline_handles.push(handle);
                }
                other => warn!("Unknown pipeline: {}", other),
            }
        }

        Ok(())
    }

    fn validate_pipeline_devices(&self, pipelines: &[String]) -> Result<()> {
        let wants_outgoing = pipelines.iter().any(|p| p == "outgoing");
        let wants_incoming = pipelines.iter().any(|p| p == "incoming");

        if wants_outgoing && !input_device_exists(&self.config.mic_device) {
            if is_system_loopback_device(&self.config.mic_device) {
                if !output_loopback_device_exists(&self.config.speaker_device) {
                    bail!("No output device available for system loopback capture.");
                }
            } else {
                bail!("No microphone input. Turn on Monitor or connect a microphone.");
            }
        }

        if wants_incoming {
            if is_system_loopback_device(&self.config.meet_input_device) {
                if !output_loopback_device_exists(&self.config.speaker_device) {
                    bail!("No output device available for system loopback capture.");
                }
            } else if self
                .config
                .meet_input_device
                .eq_ignore_ascii_case("default")
            {
                bail!("Incoming capture requires a specific input/loopback device. Select System output loopback to capture speaker audio.");
            } else if !input_device_exists(&self.config.meet_input_device) {
                bail!("Incoming capture device is unavailable. Select a real input/loopback device or use System Audio.");
            }
        }

        Ok(())
    }

    fn stop_pipelines(&mut self) {
        if let Some(flag) = self.stop_flag.take() {
            flag.store(true, Ordering::SeqCst);
        }

        for handle in self.pipeline_handles.drain(..) {
            let name = handle.thread().name().unwrap_or("unnamed").to_string();
            info!("Waiting for pipeline thread '{}' to stop...", name);
            if let Err(e) = handle.join() {
                error!("Pipeline thread '{}' panicked: {:?}", name, e);
            }
        }
        info!("All pipeline threads stopped");
    }
}

// ---------------------------------------------------------------------------
// Pipeline spawning
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
fn spawn_pipeline(
    direction: &str,
    capture_device: String,
    playback_device: String,
    loopback_output_device: String,
    sample_rate: u32,
    stt: DeepgramStt,
    translator: Arc<TranslationEngine>,
    translate_direction: TranslationDirection,
    source_lang: &str,
    tts: Option<TtsEngine>,
    event_tx: Sender<Event>,
    stop_flag: Arc<AtomicBool>,
    mute_flag: Arc<AtomicBool>,
    tts_enabled: Arc<AtomicBool>,
    translation_enabled: Arc<AtomicBool>,
    browser_monitor_enabled: Arc<AtomicBool>,
    recent_tts: Arc<Mutex<Vec<RecentTts>>>,
    dual_channel_mode: bool,
    incoming_audio_active_until: Arc<AtomicU64>,
    tts_provider: String,
) -> Result<thread::JoinHandle<()>> {
    let dir_name = direction.to_string();
    let src_lang = source_lang.to_string();

    let handle = thread::Builder::new()
        .name(format!("pipeline-{}", direction))
        .spawn(move || {
            if let Err(e) = run_pipeline(
                &dir_name,
                &capture_device,
                &playback_device,
                &loopback_output_device,
                sample_rate,
                stt,
                &translator,
                translate_direction,
                &src_lang,
                tts,
                &event_tx,
                &stop_flag,
                &mute_flag,
                &tts_enabled,
                &translation_enabled,
                &browser_monitor_enabled,
                recent_tts,
                dual_channel_mode,
                incoming_audio_active_until,
                &tts_provider,
            ) {
                error!("{} pipeline failed: {:#}", dir_name, e);
                let _ = event_tx.send(Event::Error {
                    message: format!("{} pipeline failed: {:#}", dir_name, e),
                });
            }
            info!("{} pipeline thread exiting", dir_name);
        })
        .context("Failed to spawn pipeline thread")?;

    Ok(handle)
}

// ---------------------------------------------------------------------------
// Core pipeline logic
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
fn run_pipeline(
    direction: &str,
    capture_device: &str,
    playback_device: &str,
    loopback_output_device: &str,
    sample_rate: u32,
    stt: DeepgramStt,
    translator: &TranslationEngine,
    translate_direction: TranslationDirection,
    source_lang: &str,
    mut tts: Option<TtsEngine>,
    event_tx: &Sender<Event>,
    stop_flag: &AtomicBool,
    mute_flag: &AtomicBool,
    tts_enabled: &Arc<AtomicBool>,
    translation_enabled: &Arc<AtomicBool>,
    browser_monitor_enabled: &Arc<AtomicBool>,
    recent_tts: Arc<Mutex<Vec<RecentTts>>>,
    dual_channel_mode: bool,
    incoming_audio_active_until: Arc<AtomicU64>,
    tts_provider: &str,
) -> Result<()> {
    info!(
        "[{}] Starting pipeline: capture='{}', playback='{}'",
        direction, capture_device, playback_device
    );

    let (audio_tx, audio_rx) = bounded::<AudioChunk>(512);
    let (playback_tx, playback_rx) = bounded::<Vec<f32>>(64);
    let (device_error_tx, device_error_rx) = bounded::<String>(8);
    // Transcripts go here; the processor thread picks them up without blocking audio.
    let (proc_tx, proc_rx) = bounded::<(String, u64)>(16);

    let capture = if is_system_loopback_device(capture_device) {
        AudioCapture::new_loopback(loopback_output_device, audio_tx, device_error_tx.clone())
    } else {
        AudioCapture::new(capture_device, audio_tx, device_error_tx.clone())
    }
    .with_context(|| format!("[{}] Failed to create AudioCapture", direction))?;
    let capture_rate = capture.sample_rate();

    let playback = AudioPlayback::new(playback_device, sample_rate, playback_rx, device_error_tx)
        .with_context(|| format!("[{}] Failed to create AudioPlayback", direction))?;

    // Connect to Deepgram — stream at 16kHz to save bandwidth
    let stt_sample_rate = 16_000_u32;
    let mut session = stt
        .create_session(stt_sample_rate)
        .with_context(|| format!("[{}] Failed to connect to Deepgram", direction))?;

    capture
        .start()
        .with_context(|| format!("[{}] Failed to start capture", direction))?;
    playback
        .start()
        .with_context(|| format!("[{}] Failed to start playback", direction))?;

    let drained = audio_rx.try_iter().count();
    if drained > 0 {
        info!("[{}] Drained {} stale audio chunks", direction, drained);
    }

    info!("[{}] Pipeline running", direction);

    // Echo suppression: ignore captured loopback while TTS is playing through speakers.
    let echo_suppress = Arc::new(AtomicBool::new(false));
    let echo_suppress_token = Arc::new(AtomicU64::new(0));

    // Processor thread: translate + TTS, runs independently so audio loop is never blocked.
    let proc_translator = translator.clone();
    let proc_playback_tx = playback_tx.clone();
    let proc_event_tx = event_tx.clone();
    let proc_direction = direction.to_string();
    let proc_source_lang = source_lang.to_string();
    let proc_sample_rate = sample_rate;
    let proc_recent_tts = recent_tts.clone();
    let proc_tts_enabled = tts_enabled.clone();
    let proc_translation_enabled = translation_enabled.clone();
    let proc_browser_monitor_enabled = browser_monitor_enabled.clone();
    let proc_tts_provider = tts_provider.to_string();
    let proc_echo_suppress = echo_suppress.clone();
    let proc_echo_suppress_token = echo_suppress_token.clone();
    let proc_suppress_tts_playback =
        would_feedback_loopback(capture_device, playback_device, loopback_output_device);
    if proc_suppress_tts_playback {
        info!(
            "[{}] System loopback capture shares the playback output; TTS echo guard enabled for this pipeline",
            direction
        );
    }
    let _proc_handle = std::thread::spawn(move || {
        while let Ok((text, stt_ms)) = proc_rx.recv() {
            let (merged_text, merged_stt_ms) =
                merge_neighboring_chunks(text, stt_ms, &proc_rx, &proc_direction);
            if should_drop_standalone_fragment(&merged_text, &proc_direction) {
                info!(
                    "[{}] Dropping standalone STT fragment: '{}'",
                    proc_direction, merged_text
                );
                continue;
            }
            let _audio_len = process_utterance(
                &proc_direction,
                &merged_text,
                merged_stt_ms,
                &proc_translator,
                &translate_direction,
                &proc_source_lang,
                &mut tts,
                proc_sample_rate,
                &proc_playback_tx,
                &proc_event_tx,
                &proc_tts_enabled,
                &proc_translation_enabled,
                &proc_browser_monitor_enabled,
                &proc_echo_suppress,
                &proc_echo_suppress_token,
                proc_suppress_tts_playback,
                &proc_recent_tts,
                &proc_tts_provider,
            );
        }
    });

    info!(
        "[{}] Capture rate: {}Hz, STT rate: {}Hz",
        direction, capture_rate, stt_sample_rate
    );

    let mut last_strong_outgoing_audio = None;
    let mut audio_drop_debug_at = HashMap::new();

    loop {
        if stop_flag.load(Ordering::SeqCst) {
            info!("[{}] Stop flag set, exiting", direction);
            break;
        }
        if let Ok(device_error) = device_error_rx.try_recv() {
            let _ = event_tx.send(Event::AudioDeviceLost {
                direction: direction.to_string(),
                message: device_error,
            });
            break;
        }

        match audio_rx.recv_timeout(std::time::Duration::from_millis(100)) {
            Ok(chunk) => {
                if mute_flag.load(Ordering::Relaxed) {
                    debug_audio_drop(
                        direction,
                        AudioDropReason::Muted,
                        &chunk.samples,
                        &mut audio_drop_debug_at,
                    );
                    continue;
                }
                note_incoming_audio_activity(
                    direction,
                    dual_channel_mode,
                    &chunk.samples,
                    &incoming_audio_active_until,
                );
                if echo_suppress.load(Ordering::SeqCst) {
                    debug_audio_drop(
                        direction,
                        AudioDropReason::EchoSuppressed,
                        &chunk.samples,
                        &mut audio_drop_debug_at,
                    );
                    if !ensure_deepgram_keepalive(
                        direction,
                        &stt,
                        stt_sample_rate,
                        event_tx,
                        &mut session,
                    ) {
                        break;
                    }
                    continue;
                }
                if let Some(reason) = should_drop_outgoing_audio(
                    direction,
                    dual_channel_mode,
                    &chunk.samples,
                    &incoming_audio_active_until,
                    &mut last_strong_outgoing_audio,
                ) {
                    debug_audio_drop(direction, reason, &chunk.samples, &mut audio_drop_debug_at);
                    if drop_requires_keepalive(reason)
                        && !ensure_deepgram_keepalive(
                            direction,
                            &stt,
                            stt_sample_rate,
                            event_tx,
                            &mut session,
                        )
                    {
                        break;
                    }
                    continue;
                }
                let samples_16k = resample(&chunk.samples, capture_rate, stt_sample_rate);
                if let Err(e) = session.send_audio(&samples_16k) {
                    warn!("[{}] Deepgram send error: {:#}", direction, e);
                    if is_reconnectable_deepgram_error(&e) {
                        match reconnect_deepgram(direction, &stt, stt_sample_rate, event_tx) {
                            Ok(new_session) => session = new_session,
                            Err(reconnect_error) => {
                                error!(
                                    "[{}] Deepgram reconnect failed: {:#}",
                                    direction, reconnect_error
                                );
                                let _ = event_tx.send(Event::Error {
                                    message: format!(
                                        "[{}] Deepgram reconnect failed: {:#}",
                                        direction, reconnect_error
                                    ),
                                });
                                break;
                            }
                        }
                    }
                }
            }
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                if stop_flag.load(Ordering::SeqCst) || mute_flag.load(Ordering::Relaxed) {
                    continue;
                }
                if !ensure_deepgram_keepalive(
                    direction,
                    &stt,
                    stt_sample_rate,
                    event_tx,
                    &mut session,
                ) {
                    break;
                }
            }
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                info!("[{}] Audio capture channel disconnected", direction);
                break;
            }
        }

        // Poll for completed utterances (non-blocking) — just queue, don't process here
        match session.poll_transcript() {
            Ok(Some(result)) => {
                if echo_suppress.load(Ordering::SeqCst) {
                    info!("[{}] Echo suppressed: '{}'", direction, result.text);
                } else if should_suppress_recent_tts(direction, &result.text, &recent_tts) {
                    info!("[{}] Recent TTS suppressed: '{}'", direction, result.text);
                } else {
                    if let Err(e) = proc_tx.try_send((result.text, result.stt_latency_ms)) {
                        warn!(
                            "[{}] Processor channel full, dropping transcript: {}",
                            direction, e
                        );
                    }
                }
            }
            Ok(None) => {}
            Err(e) => {
                if is_reconnectable_deepgram_error(&e) {
                    match reconnect_deepgram(direction, &stt, stt_sample_rate, event_tx) {
                        Ok(new_session) => {
                            session = new_session;
                            continue;
                        }
                        Err(reconnect_error) => {
                            error!(
                                "[{}] Deepgram reconnect failed: {:#}",
                                direction, reconnect_error
                            );
                            let _ = event_tx.send(Event::Error {
                                message: format!(
                                    "[{}] Deepgram reconnect failed: {:#}",
                                    direction, reconnect_error
                                ),
                            });
                            break;
                        }
                    }
                } else {
                    error!("[{}] Deepgram error: {:#}", direction, e);
                    let _ = event_tx.send(Event::Error {
                        message: format!("[{}] Deepgram error: {:#}", direction, e),
                    });
                    break;
                }
            }
        }
    }

    session.close();
    let _ = capture.stop();
    let _ = playback.stop();
    drop(playback_tx);

    info!("[{}] Pipeline stopped cleanly", direction);
    Ok(())
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
enum AudioDropReason {
    EchoSuppressed,
    IncomingActive,
    Muted,
    QuietOutgoing,
}

impl AudioDropReason {
    fn as_str(self) -> &'static str {
        match self {
            Self::EchoSuppressed => "echo-suppressed",
            Self::IncomingActive => "incoming-active",
            Self::Muted => "muted",
            Self::QuietOutgoing => "quiet-outgoing",
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct AudioLevel {
    rms: f32,
    peak: f32,
}

fn audio_level(samples: &[f32]) -> AudioLevel {
    if samples.is_empty() {
        return AudioLevel {
            rms: 0.0,
            peak: 0.0,
        };
    }

    let mut sum_squares = 0.0_f32;
    let mut peak = 0.0_f32;
    for sample in samples {
        let abs = sample.abs();
        sum_squares += sample * sample;
        if abs > peak {
            peak = abs;
        }
    }

    AudioLevel {
        rms: (sum_squares / samples.len() as f32).sqrt(),
        peak,
    }
}

fn above_audio_gate(level: AudioLevel, rms_threshold: f32, peak_threshold: f32) -> bool {
    level.rms >= rms_threshold || level.peak >= peak_threshold
}

fn below_audio_gate(level: AudioLevel, rms_threshold: f32, peak_threshold: f32) -> bool {
    level.rms < rms_threshold && level.peak < peak_threshold
}

fn monotonic_wall_clock_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

fn note_incoming_audio_activity(
    direction: &str,
    dual_channel_mode: bool,
    samples: &[f32],
    incoming_audio_active_until: &AtomicU64,
) {
    if !dual_channel_mode || direction != "incoming" {
        return;
    }

    let level = audio_level(samples);
    if above_audio_gate(level, INCOMING_ACTIVITY_RMS, INCOMING_ACTIVITY_PEAK) {
        incoming_audio_active_until.store(
            monotonic_wall_clock_ms().saturating_add(INCOMING_ACTIVITY_HANGOVER_MS),
            Ordering::SeqCst,
        );
    }
}

fn should_drop_outgoing_audio(
    direction: &str,
    dual_channel_mode: bool,
    samples: &[f32],
    incoming_audio_active_until: &AtomicU64,
    last_strong_outgoing_audio: &mut Option<Instant>,
) -> Option<AudioDropReason> {
    if !dual_channel_mode || direction != "outgoing" {
        return None;
    }

    let level = audio_level(samples);
    if above_audio_gate(level, OUTGOING_MIC_RMS, OUTGOING_MIC_PEAK) {
        *last_strong_outgoing_audio = Some(Instant::now());
        return None;
    }

    if let Some(last_seen) = last_strong_outgoing_audio {
        if last_seen.elapsed() <= Duration::from_millis(OUTGOING_MIC_HANGOVER_MS) {
            return None;
        }
    }

    if monotonic_wall_clock_ms() > incoming_audio_active_until.load(Ordering::SeqCst) {
        return None;
    }

    if below_audio_gate(level, OUTGOING_BLEED_RMS, OUTGOING_BLEED_PEAK) {
        return Some(AudioDropReason::QuietOutgoing);
    }

    Some(AudioDropReason::IncomingActive)
}

fn drop_requires_keepalive(reason: AudioDropReason) -> bool {
    matches!(
        reason,
        AudioDropReason::EchoSuppressed
            | AudioDropReason::IncomingActive
            | AudioDropReason::QuietOutgoing
    )
}

fn debug_audio_drop(
    direction: &str,
    reason: AudioDropReason,
    samples: &[f32],
    last_debug_at: &mut HashMap<AudioDropReason, Instant>,
) {
    let now = Instant::now();
    if let Some(last) = last_debug_at.get(&reason) {
        if now.duration_since(*last) < Duration::from_millis(AUDIO_DROP_DEBUG_INTERVAL_MS) {
            return;
        }
    }

    last_debug_at.insert(reason, now);
    let level = audio_level(samples);
    debug_log(&format!(
        "[{}] audio-drop reason={} rms={:.5} peak={:.5}",
        direction,
        reason.as_str(),
        level.rms,
        level.peak
    ));
}

fn is_reconnectable_deepgram_error(error: &anyhow::Error) -> bool {
    let message = format!("{:#}", error).to_lowercase();
    message.contains("connection closed")
        || message.contains("already closed")
        || message.contains("reset without closing handshake")
        || message.contains("connection reset")
        || message.contains("broken pipe")
        || message.contains("os error 10053")
        || message.contains("os error 10054")
        || message.contains("10053")
        || message.contains("10054")
        || message.contains("was aborted")
        || message.contains("разорвала установленное подключение")
        || message.contains("принудительно разорвал существующее подключение")
}

fn ensure_deepgram_keepalive(
    direction: &str,
    stt: &DeepgramStt,
    sample_rate: u32,
    event_tx: &Sender<Event>,
    session: &mut crate::stt::DeepgramSession,
) -> bool {
    if let Err(e) = session.send_keepalive_if_idle() {
        if is_reconnectable_deepgram_error(&e) {
            match reconnect_deepgram(direction, stt, sample_rate, event_tx) {
                Ok(new_session) => {
                    *session = new_session;
                    return true;
                }
                Err(reconnect_error) => {
                    error!(
                        "[{}] Deepgram reconnect failed: {:#}",
                        direction, reconnect_error
                    );
                    let _ = event_tx.send(Event::Error {
                        message: format!(
                            "[{}] Deepgram reconnect failed: {:#}",
                            direction, reconnect_error
                        ),
                    });
                    return false;
                }
            }
        }

        error!("[{}] Deepgram keepalive error: {:#}", direction, e);
        let _ = event_tx.send(Event::Error {
            message: format!("[{}] Deepgram keepalive error: {:#}", direction, e),
        });
        return false;
    }

    true
}

fn reconnect_deepgram(
    direction: &str,
    stt: &DeepgramStt,
    sample_rate: u32,
    event_tx: &Sender<Event>,
) -> Result<crate::stt::DeepgramSession> {
    warn!(
        "[{}] Deepgram stream closed; reconnecting without stopping pipeline",
        direction
    );
    let session = stt
        .create_session(sample_rate)
        .with_context(|| format!("[{}] Failed to reconnect to Deepgram", direction))?;
    let _ = event_tx.send(Event::Log {
        level: "info".into(),
        message: format!("[{}] Deepgram reconnected", direction),
    });
    Ok(session)
}

// ---------------------------------------------------------------------------
// Utterance processing: transcript -> translate -> TTS -> playback
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
fn process_utterance(
    direction: &str,
    text: &str,
    stt_ms: u64,
    translator: &TranslationEngine,
    translate_direction: &TranslationDirection,
    source_lang: &str,
    tts: &mut Option<TtsEngine>,
    sample_rate: u32,
    playback_tx: &Sender<Vec<f32>>,
    event_tx: &Sender<Event>,
    tts_enabled: &AtomicBool,
    translation_enabled: &AtomicBool,
    browser_monitor_enabled: &AtomicBool,
    echo_suppress: &Arc<AtomicBool>,
    echo_suppress_token: &Arc<AtomicU64>,
    suppress_tts_playback: bool,
    recent_tts: &Arc<Mutex<Vec<RecentTts>>>,
    tts_provider: &str,
) -> usize {
    info!("[{}] Transcript: '{}'", direction, text);

    let _ = event_tx.send(Event::Transcript {
        direction: direction.to_string(),
        text: text.to_string(),
        lang: source_lang.to_string(),
    });

    let translate_start = Instant::now();
    let translation_is_disabled = !translation_enabled.load(Ordering::SeqCst);
    let same_language = translate_direction.from_code == translate_direction.to_code;
    let translated = if translation_is_disabled || same_language {
        text.trim().to_string()
    } else {
        match translator.translate(text, translate_direction) {
            Ok(t) => t,
            Err(e) => {
                error!("[{}] Translation error: {:#}", direction, e);
                let _ = event_tx.send(Event::Error {
                    message: format!("[{}] Translation failed: {:#}", direction, e),
                });
                return 0;
            }
        }
    };
    let translate_ms = if translation_is_disabled {
        0
    } else {
        translate_start.elapsed().as_millis() as u64
    };

    info!("[{}] Translation: '{}'", direction, translated);
    let _ = event_tx.send(Event::Translation {
        direction: direction.to_string(),
        text: translated.clone(),
    });

    if translated.trim().is_empty() {
        return 0;
    }

    if translation_is_disabled {
        info!(
            "[{}] Translation disabled, skipping TTS playback",
            direction
        );
        let _ = event_tx.send(Event::Metrics {
            stt_ms,
            translate_ms,
            tts_ms: 0,
        });
        return 0;
    }

    if same_language {
        info!(
            "[{}] Same-language mode ({}), skipping TTS playback to avoid mic feedback",
            direction, translate_direction
        );
        let _ = event_tx.send(Event::Metrics {
            stt_ms,
            translate_ms,
            tts_ms: 0,
        });
        return 0;
    }

    if !tts_enabled.load(Ordering::SeqCst) {
        info!(
            "[{}] Text-only mode enabled, skipping TTS playback",
            direction
        );
        let _ = event_tx.send(Event::Metrics {
            stt_ms,
            translate_ms,
            tts_ms: 0,
        });
        return 0;
    }

    if !tts_provider.eq_ignore_ascii_case("piper") {
        info!(
            "[{}] External TTS provider '{}' enabled, skipping Piper playback",
            direction, tts_provider
        );
        let _ = event_tx.send(Event::Metrics {
            stt_ms,
            translate_ms,
            tts_ms: 0,
        });
        return 0;
    }

    let Some(tts) = tts.as_mut() else {
        error!("[{}] Piper TTS engine is not loaded", direction);
        let _ = event_tx.send(Event::Error {
            message: format!("[{}] Piper TTS engine is not loaded", direction),
        });
        return 0;
    };

    let tts_start = Instant::now();
    let audio = match tts.synthesize(&translated) {
        Ok(samples) => samples,
        Err(e) => {
            error!("[{}] TTS error: {:#}", direction, e);
            let _ = event_tx.send(Event::Error {
                message: format!("[{}] TTS failed: {:#}", direction, e),
            });
            return 0;
        }
    };
    let tts_ms = tts_start.elapsed().as_millis() as u64;

    let audio_len = audio.len();

    if !audio.is_empty() {
        record_recent_tts(direction, &translated, recent_tts);

        // Downsample to 16kHz for browser monitor (good quality, ~40KB per phrase)
        let monitor_rate = 16000u32;
        let monitor_samples = resample(&audio, sample_rate, monitor_rate);
        let mut pcm_bytes = Vec::with_capacity(monitor_samples.len() * 2);
        for &s in &monitor_samples {
            let i = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
            pcm_bytes.extend_from_slice(&i.to_le_bytes());
        }
        use base64::Engine as _;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&pcm_bytes);
        let _ = event_tx.send(Event::TtsAudio {
            direction: direction.to_string(),
            sample_rate: monitor_rate,
            audio_b64: b64,
        });

        let browser_monitor_playback = browser_monitor_enabled.load(Ordering::SeqCst);
        if suppress_tts_playback {
            activate_echo_guard(echo_suppress, echo_suppress_token, audio_len, sample_rate);
        }

        if suppress_tts_playback && browser_monitor_playback {
            info!(
                "[{}] System loopback mode, sent TTS to browser monitor only",
                direction
            );
        } else if let Err(e) = playback_tx.try_send(audio) {
            warn!(
                "[{}] Playback channel full or disconnected: {}",
                direction, e
            );
        }
    }

    let _ = event_tx.send(Event::Metrics {
        stt_ms,
        translate_ms,
        tts_ms,
    });

    audio_len
}

fn activate_echo_guard(
    echo_suppress: &Arc<AtomicBool>,
    echo_suppress_token: &Arc<AtomicU64>,
    sample_count: usize,
    sample_rate: u32,
) {
    if sample_count == 0 {
        return;
    }

    let duration_ms = ((sample_count as f64 / sample_rate.max(1) as f64) * 1000.0).ceil() as u64;
    let guard_ms = (duration_ms + 900).clamp(900, 90_000);
    let token = echo_suppress_token.fetch_add(1, Ordering::SeqCst) + 1;
    echo_suppress.store(true, Ordering::SeqCst);

    let suppress = echo_suppress.clone();
    let suppress_token = echo_suppress_token.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(guard_ms));
        if suppress_token.load(Ordering::SeqCst) == token {
            suppress.store(false, Ordering::SeqCst);
        }
    });
}

fn would_feedback_loopback(
    capture_device: &str,
    _playback_device: &str,
    _loopback_output_device: &str,
) -> bool {
    if !is_system_loopback_device(capture_device) {
        return false;
    }

    // System loopback records the same Windows mix the user hears. When the
    // browser Monitor is enabled, playing TTS both through Rust playback and
    // the browser creates an audible double. Treat any loopback capture as an
    // echo-sensitive path; the per-utterance logic will prefer browser Monitor
    // playback while it is enabled.
    true
}

fn merge_neighboring_chunks(
    mut text: String,
    mut stt_ms: u64,
    proc_rx: &crossbeam_channel::Receiver<(String, u64)>,
    direction: &str,
) -> (String, u64) {
    let mut merge_deadline =
        Instant::now() + Duration::from_millis(merge_wait_ms(direction, &text));

    loop {
        let now = Instant::now();
        if now >= merge_deadline {
            break;
        }

        let wait = merge_deadline.saturating_duration_since(now);
        match proc_rx.recv_timeout(wait.min(Duration::from_millis(MAX_MERGE_POLL_MS))) {
            Ok((next_text, next_stt_ms)) => {
                if !next_text.trim().is_empty() {
                    text = merge_texts(&text, &next_text);
                    stt_ms = stt_ms.max(next_stt_ms);
                    merge_deadline =
                        Instant::now() + Duration::from_millis(merge_wait_ms(direction, &text));
                }
            }
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => continue,
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => break,
        }
    }

    (cleanup_repeated_word_spans(&text), stt_ms)
}

fn merge_wait_ms(direction: &str, text: &str) -> u64 {
    if is_probably_incomplete_utterance(text) {
        return incomplete_utterance_merge_silence_ms(direction);
    }

    if is_short_complete_utterance(text) {
        return short_utterance_merge_silence_ms(direction);
    }

    base_utterance_merge_silence_ms(direction)
}

fn endpointing_ms_for_direction(direction: &str, configured_ms: u32) -> u32 {
    if direction == "incoming" {
        configured_ms.max(INCOMING_ENDPOINTING_FLOOR_MS)
    } else {
        configured_ms
    }
}

fn base_utterance_merge_silence_ms(direction: &str) -> u64 {
    if direction == "incoming" {
        INCOMING_MERGE_SILENCE_MS
    } else {
        OUTGOING_MERGE_SILENCE_MS
    }
}

fn incomplete_utterance_merge_silence_ms(direction: &str) -> u64 {
    if direction == "incoming" {
        INCOMING_INCOMPLETE_MERGE_SILENCE_MS
    } else {
        OUTGOING_INCOMPLETE_MERGE_SILENCE_MS
    }
}

fn short_utterance_merge_silence_ms(direction: &str) -> u64 {
    if direction == "incoming" {
        INCOMING_SHORT_MERGE_SILENCE_MS
    } else {
        OUTGOING_SHORT_MERGE_SILENCE_MS
    }
}

fn is_short_complete_utterance(text: &str) -> bool {
    let normalized = normalize_text_for_match(text);
    if normalized.is_empty() {
        return false;
    }

    let words: Vec<&str> = normalized.split_whitespace().collect();
    !words.is_empty() && words.len() <= SHORT_COMPLETE_UTTERANCE_MAX_WORDS
}

fn should_drop_standalone_fragment(text: &str, direction: &str) -> bool {
    let normalized = normalize_text_for_match(text);
    if normalized.is_empty() {
        return true;
    }

    let words: Vec<&str> = normalized.split_whitespace().collect();
    if _has_question_mark(text) {
        return false;
    }

    if direction == "incoming" && is_weak_incoming_fragment(text, &words) {
        return true;
    }

    if words.len() > 1 {
        return false;
    }

    let word = words[0];
    if is_allowed_short_answer(word) || is_likely_named_term(text) {
        return false;
    }

    if direction == "incoming" {
        return true;
    }

    word.chars().count() <= 3
}

fn is_allowed_short_answer(word: &str) -> bool {
    matches!(
        word,
        "да" | "нет"
            | "ок"
            | "ага"
            | "окей"
            | "ладно"
            | "готово"
            | "понятно"
            | "хорошо"
            | "привет"
            | "yes"
            | "no"
            | "ok"
            | "okay"
            | "done"
            | "hello"
            | "hi"
            | "thanks"
    )
}

fn is_weak_incoming_fragment(text: &str, words: &[&str]) -> bool {
    if words.is_empty() {
        return true;
    }

    if words.len() == 1 {
        return !is_allowed_short_answer(words[0]) && !is_likely_named_term(text);
    }

    if words.len() <= 2 {
        let repeated_short_words = words.iter().all(|word| word.chars().count() <= 3)
            && words.windows(2).any(|pair| pair[0] == pair[1]);
        if repeated_short_words || is_probably_incomplete_utterance(text) {
            return true;
        }
    }

    words.len() <= MAX_WEAK_INCOMING_FRAGMENT_WORDS && is_probably_incomplete_utterance(text)
}

fn is_probably_incomplete_utterance(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() || _has_question_mark(trimmed) {
        return false;
    }

    if trimmed.ends_with(',') || trimmed.ends_with(':') || trimmed.ends_with(';') {
        return true;
    }

    let normalized = normalize_text_for_match(trimmed);
    let Some(last_word) = normalized.split_whitespace().last() else {
        return false;
    };

    is_hanging_tail_word(last_word)
}

fn _has_question_mark(text: &str) -> bool {
    text.contains('?') || text.contains('؟') || text.contains('？')
}

fn is_hanging_tail_word(word: &str) -> bool {
    matches!(
        word,
        "и" | "а"
            | "но"
            | "или"
            | "если"
            | "чтобы"
            | "чтоб"
            | "который"
            | "которая"
            | "которое"
            | "которые"
            | "что"
            | "как"
            | "когда"
            | "где"
            | "куда"
            | "потому"
            | "поскольку"
            | "короче"
            | "типа"
            | "это"
            | "этот"
            | "эта"
            | "эти"
            | "такой"
            | "такая"
            | "такие"
            | "всякой"
            | "всякая"
            | "всякие"
            | "в"
            | "во"
            | "на"
            | "по"
            | "к"
            | "ко"
            | "с"
            | "со"
            | "из"
            | "от"
            | "до"
            | "для"
            | "про"
            | "and"
            | "but"
            | "or"
            | "if"
            | "because"
            | "that"
            | "what"
            | "how"
            | "when"
            | "where"
            | "to"
            | "of"
            | "for"
            | "with"
            | "about"
            | "the"
            | "a"
            | "an"
    )
}

fn is_likely_named_term(text: &str) -> bool {
    let token = text
        .trim()
        .trim_matches(|ch: char| !ch.is_alphanumeric())
        .to_string();
    if token.len() < 2 || !token.is_ascii() {
        return false;
    }

    token.chars().any(|ch| ch.is_ascii_digit())
        || token.chars().skip(1).any(|ch| ch.is_ascii_uppercase())
        || token.chars().all(|ch| !ch.is_ascii_lowercase())
}

fn merge_texts(current: &str, next: &str) -> String {
    let current_trimmed = current.trim();
    let next_trimmed = next.trim();

    if current_trimmed.is_empty() {
        return next_trimmed.to_string();
    }
    if next_trimmed.is_empty() {
        return current_trimmed.to_string();
    }

    let current_norm = normalize_text_for_match(current_trimmed);
    let next_norm = normalize_text_for_match(next_trimmed);

    if current_norm == next_norm {
        return current_trimmed.to_string();
    }
    if current_norm.contains(&next_norm) {
        return current_trimmed.to_string();
    }
    if next_norm.contains(&current_norm) {
        return next_trimmed.to_string();
    }

    let current_words: Vec<&str> = current_norm.split_whitespace().collect();
    let next_words: Vec<&str> = next_norm.split_whitespace().collect();
    let shared_prefix = current_words
        .iter()
        .zip(next_words.iter())
        .take_while(|(left, right)| left == right)
        .count();
    if shared_prefix >= 3 {
        if next_words.len() >= current_words.len() {
            return next_trimmed.to_string();
        }
        return current_trimmed.to_string();
    }

    let max_overlap = current_words.len().min(next_words.len());
    for overlap in (2..=max_overlap).rev() {
        if current_words[current_words.len() - overlap..] == next_words[..overlap] {
            let next_original_words: Vec<&str> = next_trimmed.split_whitespace().collect();
            let suffix = next_original_words.get(overlap..).unwrap_or(&[]).join(" ");
            if suffix.is_empty() {
                return current_trimmed.to_string();
            }
            return format!("{} {}", current_trimmed, suffix);
        }
    }

    if current_words
        .last()
        .zip(next_words.first())
        .is_some_and(|(left, right)| is_mergeable_single_word_overlap(left, right))
    {
        let next_original_words: Vec<&str> = next_trimmed.split_whitespace().collect();
        let suffix = next_original_words.get(1..).unwrap_or(&[]).join(" ");
        if suffix.is_empty() {
            return current_trimmed.to_string();
        }
        return format!("{} {}", current_trimmed, suffix);
    }

    format!("{} {}", current_trimmed, next_trimmed)
}

fn is_mergeable_single_word_overlap(left: &str, right: &str) -> bool {
    left == right && left.chars().count() >= 3
}

fn cleanup_repeated_word_spans(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let original_words: Vec<&str> = trimmed.split_whitespace().collect();
    let normalized_words: Vec<String> = original_words
        .iter()
        .map(|word| normalize_text_for_match(word))
        .collect();
    let mut output: Vec<&str> = Vec::with_capacity(original_words.len());
    let mut index = 0;

    while index < original_words.len() {
        let remaining = original_words.len() - index;
        let max_span = (remaining / 2).min(24);
        let mut removed_repeat = false;

        for span in (3..=max_span).rev() {
            let left = &normalized_words[index..index + span];
            let right = &normalized_words[index + span..index + span * 2];
            if left.iter().all(|word| !word.is_empty()) && left == right {
                output.extend_from_slice(&original_words[index..index + span]);
                index += span * 2;
                removed_repeat = true;
                break;
            }
        }

        if !removed_repeat {
            output.push(original_words[index]);
            index += 1;
        }
    }

    output.join(" ")
}

fn normalize_text_for_match(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|ch| {
            if ch.is_alphanumeric() || ch.is_whitespace() {
                ch
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drops_noise_fragments_but_keeps_short_answers() {
        assert!(should_drop_standalone_fragment("Я", "incoming"));
        assert!(should_drop_standalone_fragment("это", "incoming"));
        assert!(should_drop_standalone_fragment("The.", "incoming"));
        assert!(!should_drop_standalone_fragment("да", "incoming"));
        assert!(!should_drop_standalone_fragment("No", "incoming"));
    }

    #[test]
    fn incoming_uses_longer_merge_window() {
        assert!(
            base_utterance_merge_silence_ms("incoming")
                > base_utterance_merge_silence_ms("outgoing")
        );
    }

    #[test]
    fn incomplete_fragments_wait_longer_before_emitting() {
        assert!(
            merge_wait_ms("incoming", "Но я, наверное, короче,")
                > base_utterance_merge_silence_ms("incoming")
        );
        assert!(
            merge_wait_ms("incoming", "Мне нужно уточнить, а чтобы")
                > base_utterance_merge_silence_ms("incoming")
        );
        assert_eq!(
            merge_wait_ms("incoming", "Как твои дела?"),
            INCOMING_SHORT_MERGE_SILENCE_MS
        );
    }

    #[test]
    fn short_complete_utterances_use_fast_merge_window() {
        assert_eq!(
            merge_wait_ms("outgoing", "Привет."),
            OUTGOING_SHORT_MERGE_SILENCE_MS
        );
        assert_eq!(
            merge_wait_ms("incoming", "Да, пойдет?"),
            INCOMING_SHORT_MERGE_SILENCE_MS
        );
        assert_eq!(
            merge_wait_ms("incoming", "Мне нужно уточнить, а чтобы"),
            INCOMING_INCOMPLETE_MERGE_SILENCE_MS
        );
    }

    #[test]
    fn incoming_endpointing_has_floor_without_slowing_outgoing() {
        assert_eq!(endpointing_ms_for_direction("outgoing", 500), 500);
        assert_eq!(
            endpointing_ms_for_direction("incoming", 500),
            INCOMING_ENDPOINTING_FLOOR_MS
        );
        assert_eq!(endpointing_ms_for_direction("incoming", 1_200), 1_200);
    }

    #[test]
    fn drops_weak_incoming_fragments_without_dropping_questions_or_terms() {
        assert!(should_drop_standalone_fragment("Вечно", "incoming"));
        assert!(should_drop_standalone_fragment("Что ты,", "incoming"));
        assert!(should_drop_standalone_fragment("я, я.", "incoming"));
        assert!(should_drop_standalone_fragment(
            "И интонирования с учетом всякой.",
            "incoming"
        ));
        assert!(!should_drop_standalone_fragment(
            "Что у тебя нового?",
            "incoming"
        ));
        assert!(!should_drop_standalone_fragment("MySQL", "incoming"));
    }

    #[test]
    fn merge_texts_removes_suffix_prefix_overlap() {
        assert_eq!(
            merge_texts("что такое sql", "sql injection"),
            "что такое sql injection"
        );
    }

    #[test]
    fn outgoing_gate_keeps_quiet_audio_when_incoming_is_inactive() {
        let active_until = AtomicU64::new(0);
        let mut last_strong_audio = None;

        assert_eq!(
            should_drop_outgoing_audio(
                "outgoing",
                true,
                &[0.002; 160],
                &active_until,
                &mut last_strong_audio,
            ),
            None
        );
    }

    #[test]
    fn outgoing_gate_is_disabled_outside_dual_channel_mode() {
        let active_until = AtomicU64::new(0);
        let mut last_strong_audio = None;

        assert_eq!(
            should_drop_outgoing_audio(
                "outgoing",
                false,
                &[0.002; 160],
                &active_until,
                &mut last_strong_audio,
            ),
            None
        );
    }

    #[test]
    fn outgoing_gate_drops_quiet_bleed_while_incoming_is_active() {
        let active_until = AtomicU64::new(0);
        let mut last_strong_audio = None;

        note_incoming_audio_activity("incoming", true, &[0.08; 160], &active_until);

        assert_eq!(
            should_drop_outgoing_audio(
                "outgoing",
                true,
                &[0.002; 160],
                &active_until,
                &mut last_strong_audio,
            ),
            Some(AudioDropReason::QuietOutgoing)
        );
    }

    #[test]
    fn outgoing_gate_keeps_close_mic_speech_while_incoming_is_active() {
        let active_until = AtomicU64::new(0);
        let mut last_strong_audio = None;

        note_incoming_audio_activity("incoming", true, &[0.08; 160], &active_until);

        assert_eq!(
            should_drop_outgoing_audio(
                "outgoing",
                true,
                &[0.08; 160],
                &active_until,
                &mut last_strong_audio,
            ),
            None
        );
    }

    #[test]
    fn gated_drop_requires_keepalive() {
        assert!(drop_requires_keepalive(AudioDropReason::EchoSuppressed));
        assert!(drop_requires_keepalive(AudioDropReason::IncomingActive));
        assert!(drop_requires_keepalive(AudioDropReason::QuietOutgoing));
        assert!(!drop_requires_keepalive(AudioDropReason::Muted));
    }

    #[test]
    fn windows_socket_abort_is_reconnectable_deepgram_error() {
        let error = anyhow::anyhow!(
            "Failed to send Deepgram keepalive: IO error: An established connection was aborted by the software in your host machine. (os error 10053)"
        );

        assert!(is_reconnectable_deepgram_error(&error));
    }

    #[test]
    fn windows_remote_host_close_is_reconnectable_deepgram_error() {
        let error = anyhow::anyhow!(
            "Deepgram WebSocket error: IO error: Удаленный хост принудительно разорвал существующее подключение. (os error 10054)"
        );

        assert!(is_reconnectable_deepgram_error(&error));
    }

    #[test]
    fn outgoing_gate_keeps_close_mic_speech_in_dual_channel_mode() {
        let active_until = AtomicU64::new(0);
        let mut last_strong_audio = None;

        assert_eq!(
            should_drop_outgoing_audio(
                "outgoing",
                true,
                &[0.08; 160],
                &active_until,
                &mut last_strong_audio,
            ),
            None
        );
    }

    #[test]
    fn outgoing_gate_keeps_tail_after_close_mic_speech() {
        let active_until = AtomicU64::new(0);
        let mut last_strong_audio = None;

        assert_eq!(
            should_drop_outgoing_audio(
                "outgoing",
                true,
                &[0.08; 160],
                &active_until,
                &mut last_strong_audio,
            ),
            None
        );
        assert_eq!(
            should_drop_outgoing_audio(
                "outgoing",
                true,
                &[0.002; 160],
                &active_until,
                &mut last_strong_audio,
            ),
            None
        );
    }

    #[test]
    fn outgoing_gate_ignores_incoming_direction() {
        let active_until = AtomicU64::new(0);
        let mut last_strong_audio = None;

        assert_eq!(
            should_drop_outgoing_audio(
                "incoming",
                true,
                &[0.002; 160],
                &active_until,
                &mut last_strong_audio,
            ),
            None
        );
    }

    #[test]
    fn incoming_activity_marks_shared_state() {
        let active_until = AtomicU64::new(0);

        note_incoming_audio_activity("incoming", true, &[0.08; 160], &active_until);

        assert!(active_until.load(Ordering::SeqCst) >= monotonic_wall_clock_ms());
    }

    #[test]
    fn incoming_activity_does_not_mark_shared_state_outside_dual_mode() {
        let active_until = AtomicU64::new(0);

        note_incoming_audio_activity("incoming", false, &[0.08; 160], &active_until);

        assert_eq!(active_until.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn incoming_activity_does_not_mark_shared_state_for_outgoing() {
        let active_until = AtomicU64::new(0);

        note_incoming_audio_activity("outgoing", true, &[0.08; 160], &active_until);

        assert_eq!(active_until.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn outgoing_gate_keeps_quiet_audio_after_tail_when_incoming_is_inactive() {
        let active_until = AtomicU64::new(0);
        let mut last_strong_audio =
            Some(Instant::now() - Duration::from_millis(OUTGOING_MIC_HANGOVER_MS + 1));

        assert_eq!(
            should_drop_outgoing_audio(
                "outgoing",
                true,
                &[0.002; 160],
                &active_until,
                &mut last_strong_audio,
            ),
            None
        );
    }

    #[test]
    fn incoming_activity_does_not_block_close_mic_after_hangover() {
        let active_until =
            AtomicU64::new(monotonic_wall_clock_ms() + INCOMING_ACTIVITY_HANGOVER_MS);
        let mut last_strong_audio =
            Some(Instant::now() - Duration::from_millis(OUTGOING_MIC_HANGOVER_MS + 1));

        assert_eq!(
            should_drop_outgoing_audio(
                "outgoing",
                true,
                &[0.08; 160],
                &active_until,
                &mut last_strong_audio,
            ),
            None
        );
    }

    #[test]
    fn incoming_activity_blocks_quiet_mic_after_hangover() {
        let active_until =
            AtomicU64::new(monotonic_wall_clock_ms() + INCOMING_ACTIVITY_HANGOVER_MS);
        let mut last_strong_audio =
            Some(Instant::now() - Duration::from_millis(OUTGOING_MIC_HANGOVER_MS + 1));

        assert_eq!(
            should_drop_outgoing_audio(
                "outgoing",
                true,
                &[0.002; 160],
                &active_until,
                &mut last_strong_audio,
            ),
            Some(AudioDropReason::QuietOutgoing)
        );
    }

    #[test]
    fn audio_gate_accepts_peak_without_high_rms() {
        let mut samples = vec![0.0; 160];
        samples[0] = OUTGOING_MIC_PEAK;
        let level = audio_level(&samples);

        assert!(above_audio_gate(level, OUTGOING_MIC_RMS, OUTGOING_MIC_PEAK));
    }

    #[test]
    fn audio_gate_rejects_low_rms_and_low_peak() {
        let level = audio_level(&[0.002; 160]);

        assert!(!above_audio_gate(
            level,
            OUTGOING_MIC_RMS,
            OUTGOING_MIC_PEAK
        ));
    }

    #[test]
    fn outgoing_gate_drops_quiet_bleed_with_incoming_activity() {
        let active_until =
            AtomicU64::new(monotonic_wall_clock_ms() + INCOMING_ACTIVITY_HANGOVER_MS);
        let mut last_strong_audio = None;

        assert_eq!(
            should_drop_outgoing_audio(
                "outgoing",
                true,
                &[0.002; 160],
                &active_until,
                &mut last_strong_audio,
            ),
            Some(AudioDropReason::QuietOutgoing)
        );
    }

    #[test]
    fn outgoing_gate_keeps_close_mic_speech_with_incoming_activity() {
        let active_until =
            AtomicU64::new(monotonic_wall_clock_ms() + INCOMING_ACTIVITY_HANGOVER_MS);
        let mut last_strong_audio = None;

        assert_eq!(
            should_drop_outgoing_audio(
                "outgoing",
                true,
                &[0.08; 160],
                &active_until,
                &mut last_strong_audio,
            ),
            None
        );
    }

    #[test]
    fn outgoing_gate_keeps_quiet_initial_audio_without_incoming_activity() {
        let active_until = AtomicU64::new(0);
        let mut last_strong_audio = None;

        assert_eq!(
            should_drop_outgoing_audio(
                "outgoing",
                true,
                &[0.002; 160],
                &active_until,
                &mut last_strong_audio,
            ),
            None
        );
    }

    #[test]
    fn outgoing_gate_keeps_strong_initial_audio() {
        let active_until = AtomicU64::new(0);
        let mut last_strong_audio = None;

        assert_eq!(
            should_drop_outgoing_audio(
                "outgoing",
                true,
                &[0.08; 160],
                &active_until,
                &mut last_strong_audio,
            ),
            None
        );
    }

    #[test]
    fn outgoing_gate_marks_strong_audio_for_tail_hangover() {
        let active_until = AtomicU64::new(0);
        let mut last_strong_audio = None;

        let _ = should_drop_outgoing_audio(
            "outgoing",
            true,
            &[0.08; 160],
            &active_until,
            &mut last_strong_audio,
        );

        assert!(last_strong_audio.is_some());
    }
}

fn record_recent_tts(direction: &str, text: &str, recent_tts: &Arc<Mutex<Vec<RecentTts>>>) {
    let normalized = normalize_text_for_match(text);
    if normalized.is_empty() {
        return;
    }

    if let Ok(mut items) = recent_tts.lock() {
        let now = Instant::now();
        items.retain(|item| now.duration_since(item.created_at) <= Duration::from_secs(8));
        items.push(RecentTts {
            direction: direction.to_string(),
            normalized_text: normalized,
            created_at: now,
        });
    }
}

fn should_suppress_recent_tts(
    direction: &str,
    transcript: &str,
    recent_tts: &Arc<Mutex<Vec<RecentTts>>>,
) -> bool {
    let normalized = normalize_text_for_match(transcript);
    if normalized.is_empty() {
        return false;
    }

    let now = Instant::now();
    let Ok(mut items) = recent_tts.lock() else {
        return false;
    };
    items.retain(|item| now.duration_since(item.created_at) <= Duration::from_secs(8));

    items.iter().any(|item| {
        let age = now.duration_since(item.created_at);

        let same_or_similar = item.normalized_text == normalized
            || (normalized.len() >= 8
                && (item.normalized_text.contains(&normalized)
                    || normalized.contains(&item.normalized_text)))
            || texts_are_similar(&item.normalized_text, &normalized);

        if same_or_similar {
            return true;
        }

        item.direction != direction && age <= Duration::from_millis(2_500)
    })
}

fn texts_are_similar(left: &str, right: &str) -> bool {
    let left_words: Vec<&str> = left.split_whitespace().collect();
    let right_words: Vec<&str> = right.split_whitespace().collect();

    if left_words.is_empty() || right_words.is_empty() {
        return false;
    }

    let overlap = right_words
        .iter()
        .filter(|word| left_words.contains(word))
        .count();
    let shorter = left_words.len().min(right_words.len());
    let longer = left_words.len().max(right_words.len());

    if longer >= 3 && overlap >= shorter.saturating_sub(1) {
        return true;
    }

    if left.len().min(right.len()) < 8 {
        return false;
    }

    let distance = levenshtein(left, right);
    let max_len = left.chars().count().max(right.chars().count());
    distance * 4 <= max_len
}

fn levenshtein(left: &str, right: &str) -> usize {
    let right_chars: Vec<char> = right.chars().collect();
    let mut costs: Vec<usize> = (0..=right_chars.len()).collect();

    for (i, left_char) in left.chars().enumerate() {
        let mut previous = costs[0];
        costs[0] = i + 1;

        for (j, right_char) in right_chars.iter().enumerate() {
            let temp = costs[j + 1];
            let substitution = if left_char == *right_char {
                previous
            } else {
                previous + 1
            };
            costs[j + 1] = (costs[j + 1] + 1).min(costs[j] + 1).min(substitution);
            previous = temp;
        }
    }

    *costs.last().unwrap_or(&0)
}

// ---------------------------------------------------------------------------
// Audio utility
// ---------------------------------------------------------------------------

/// Resample audio from `from_rate` to `to_rate` using linear interpolation.
/// Handles arbitrary rate ratios (e.g. 24000→16000, 48000→16000).
fn resample(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate || samples.is_empty() {
        return samples.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let output_len = (samples.len() as f64 / ratio) as usize;
    (0..output_len)
        .map(|i| {
            let src = i as f64 * ratio;
            let idx = src as usize;
            let frac = src - idx as f64;
            if idx + 1 < samples.len() {
                samples[idx] * (1.0 - frac as f32) + samples[idx + 1] * frac as f32
            } else {
                samples[idx.min(samples.len() - 1)]
            }
        })
        .collect()
}
