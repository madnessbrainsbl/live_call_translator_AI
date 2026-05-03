/// Speech-to-text via Deepgram Nova-3 streaming WebSocket API.
///
/// Sends raw PCM audio over a persistent WebSocket connection.
/// Deepgram handles VAD/endpointing internally and returns `speech_final`
/// events when an utterance is complete.
use std::io::ErrorKind;
use std::time::Instant;

use anyhow::{bail, Context, Result};
use log::{debug, info, warn};
use serde::Deserialize;
use tungstenite::client::IntoClientRequest;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{connect, Message, WebSocket};

// ---------------------------------------------------------------------------
// DeepgramStt — config holder, creates sessions
// ---------------------------------------------------------------------------

pub struct DeepgramStt {
    api_key: String,
    language: String,
    /// Milliseconds of silence before Deepgram fires speech_final (endpointing).
    endpointing_ms: u32,
}

impl DeepgramStt {
    pub fn new(api_key: String, language: String, endpointing_ms: u32) -> Self {
        let requested_language = deepgram_language_code(&language);
        let language_mode = std::env::var("TRANSLATOR_DEEPGRAM_LANGUAGE_MODE")
            .unwrap_or_else(|_| "configured".into());
        let language = if language_mode.eq_ignore_ascii_case("multi")
            && nova3_multilingual_supports(&requested_language)
        {
            "multi".to_string()
        } else {
            requested_language
        };
        Self {
            api_key,
            language,
            endpointing_ms,
        }
    }

    /// Open a WebSocket session to Deepgram.
    /// `sample_rate` is the rate of audio you'll send (after downsampling).
    pub fn create_session(&self, sample_rate: u32) -> Result<DeepgramSession> {
        let url = format!(
            "wss://api.deepgram.com/v1/listen\
             ?model=nova-3\
             &language={}\
             &encoding=linear16\
             &sample_rate={}\
             &channels=1\
             &interim_results=true\
             &smart_format=true\
             &endpointing={}",
            self.language, sample_rate, self.endpointing_ms
        );
        let url = format!("{}{}", url, deepgram_keyterm_query());

        // Build request via into_client_request() so tungstenite adds proper
        // WebSocket handshake headers, then inject the Authorization header on top.
        let mut request = url
            .into_client_request()
            .context("Failed to build Deepgram request")?;
        request.headers_mut().insert(
            "Authorization",
            format!("Token {}", self.api_key)
                .parse()
                .context("Invalid API key header value")?,
        );

        info!(
            "Connecting to Deepgram (lang={}, {}Hz, endpointing={}ms)...",
            self.language, sample_rate, self.endpointing_ms
        );

        let (mut ws, _) = connect(request).context("Failed to connect to Deepgram WebSocket")?;

        // Non-blocking so we can poll without blocking the audio loop.
        set_nonblocking(&mut ws)?;

        info!("Deepgram session connected");
        Ok(DeepgramSession {
            ws,
            audio_sent_secs: 0.0,
            last_send_time: Instant::now(),
            last_keepalive_time: Instant::now(),
            sample_rate,
            final_transcript: String::new(),
            latest_interim: String::new(),
        })
    }
}

fn deepgram_language_code(language: &str) -> String {
    match language {
        "pt" => "pt-BR",
        "no" => "nb",
        code => code,
    }
    .to_string()
}

fn nova3_multilingual_supports(language: &str) -> bool {
    let base = language.split('-').next().unwrap_or(language);
    matches!(
        base,
        "en" | "es" | "fr" | "de" | "hi" | "ru" | "pt" | "ja" | "it" | "nl"
    )
}

fn deepgram_keyterm_query() -> String {
    const KEYTERMS: &[&str] = &[
        "Kubernetes",
        "kubectl",
        "Docker",
        "container",
        "microservices",
        "API",
        "REST API",
        "SQL",
        "SQL injection",
        "PostgreSQL",
        "MySQL",
        "Redis",
        "Kafka",
        "Terraform",
        "Ansible",
        "CI/CD",
        "DevOps",
        "Linux",
        "Git",
        "GitHub",
        "GitLab",
        "OpenAI",
        "ChatGPT",
        "Deepgram",
        "OpenRouter",
        "Groq",
        "cybersecurity",
        "OWASP",
        "XSS",
        "CSRF",
        "JWT",
        "OAuth",
        "TLS",
        "VPN",
        "DNS",
        "HTTP",
        "HTTPS",
    ];

    KEYTERMS
        .iter()
        .map(|term| format!("&keyterm={}", encode_query_value(term)))
        .collect::<Vec<_>>()
        .join("")
}

fn encode_query_value(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            b' ' => vec!['+'],
            _ => {
                let hex = format!("%{:02X}", byte);
                hex.chars().collect::<Vec<_>>()
            }
        })
        .collect()
}

fn merge_transcripts(current: &str, next: &str) -> String {
    let current_trimmed = current.trim();
    let next_trimmed = next.trim();

    if current_trimmed.is_empty() {
        return next_trimmed.to_string();
    }
    if next_trimmed.is_empty() {
        return current_trimmed.to_string();
    }

    let current_norm = normalize_transcript(current_trimmed);
    let next_norm = normalize_transcript(next_trimmed);

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

    cleanup_repeated_word_spans(&format!("{} {}", current_trimmed, next_trimmed))
}

fn cleanup_repeated_word_spans(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let original_words: Vec<&str> = trimmed.split_whitespace().collect();
    let normalized_words: Vec<String> = original_words
        .iter()
        .map(|word| normalize_transcript(word))
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

fn final_candidate_from_interim(latest_interim: &str, final_text: &str) -> String {
    let interim_trimmed = latest_interim.trim();
    let final_trimmed = final_text.trim();

    if interim_trimmed.is_empty() {
        return final_trimmed.to_string();
    }
    if final_trimmed.is_empty() {
        return interim_trimmed.to_string();
    }

    let interim_word_count = transcript_word_count(interim_trimmed);
    let final_word_count = transcript_word_count(final_trimmed);

    // Deepgram sometimes emits a full interim hypothesis, then a very short
    // speech_final tail. Keep the longer context in that case.
    if final_word_count <= 2 && interim_word_count >= final_word_count + 3 {
        return merge_transcripts(interim_trimmed, final_trimmed);
    }

    if transcripts_overlap(interim_trimmed, final_trimmed) && interim_word_count > final_word_count
    {
        return merge_transcripts(interim_trimmed, final_trimmed);
    }

    final_trimmed.to_string()
}

fn transcript_word_count(value: &str) -> usize {
    normalize_transcript(value)
        .split_whitespace()
        .filter(|word| !word.is_empty())
        .count()
}

fn transcripts_overlap(left: &str, right: &str) -> bool {
    let left_norm = normalize_transcript(left);
    let right_norm = normalize_transcript(right);

    if left_norm.is_empty() || right_norm.is_empty() {
        return false;
    }
    if left_norm.contains(&right_norm) || right_norm.contains(&left_norm) {
        return true;
    }

    let left_words: Vec<&str> = left_norm.split_whitespace().collect();
    let right_words: Vec<&str> = right_norm.split_whitespace().collect();
    let max_overlap = left_words.len().min(right_words.len());
    for overlap in (2..=max_overlap).rev() {
        if left_words[left_words.len() - overlap..] == right_words[..overlap] {
            return true;
        }
        if right_words[right_words.len() - overlap..] == left_words[..overlap] {
            return true;
        }
    }

    false
}

fn normalize_transcript(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_alphanumeric() {
                ch.to_lowercase().collect::<String>()
            } else {
                " ".to_string()
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

// ---------------------------------------------------------------------------
// DeepgramSession — active WebSocket connection
// ---------------------------------------------------------------------------

pub struct DeepgramSession {
    ws: WebSocket<MaybeTlsStream<std::net::TcpStream>>,
    /// Total seconds of audio sent to Deepgram (accumulated from sample count + rate).
    audio_sent_secs: f64,
    /// Instant when the latest audio chunk was sent.
    last_send_time: Instant,
    /// Instant when the latest keepalive was sent during silence.
    last_keepalive_time: Instant,
    /// Sample rate of audio being sent.
    sample_rate: u32,
    /// Finalized transcript fragments for the current utterance.
    final_transcript: String,
    /// Latest non-final hypothesis for the current utterance.
    latest_interim: String,
}

/// Transcript with STT latency info.
pub struct SttResult {
    pub text: String,
    /// Real STT latency: wall-clock time from utterance end to result received.
    pub stt_latency_ms: u64,
}

impl DeepgramSession {
    /// Send audio samples (f32 mono). Converts to i16 PCM internally.
    pub fn send_audio(&mut self, samples: &[f32]) -> Result<()> {
        let bytes: Vec<u8> = samples
            .iter()
            .flat_map(|&s| {
                let i = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
                i.to_le_bytes()
            })
            .collect();

        match self.ws.send(Message::Binary(bytes)) {
            Ok(()) => {
                self.audio_sent_secs += samples.len() as f64 / self.sample_rate as f64;
                self.last_send_time = Instant::now();
                self.last_keepalive_time = Instant::now();
                Ok(())
            }
            Err(tungstenite::Error::Io(e)) if e.kind() == ErrorKind::WouldBlock => {
                // Non-blocking socket buffer full — drop this chunk silently
                Ok(())
            }
            Err(e) => Err(anyhow::anyhow!("Failed to send audio to Deepgram: {}", e)),
        }
    }

    /// Keep idle sessions alive so Deepgram does not drop the websocket before speech starts.
    pub fn send_keepalive_if_idle(&mut self) -> Result<()> {
        const KEEPALIVE_AFTER_MS: u128 = 3_000;

        if self.last_send_time.elapsed().as_millis() < KEEPALIVE_AFTER_MS
            || self.last_keepalive_time.elapsed().as_millis() < KEEPALIVE_AFTER_MS
        {
            return Ok(());
        }

        match self
            .ws
            .send(Message::Text(r#"{"type":"KeepAlive"}"#.into()))
        {
            Ok(()) => {
                self.last_keepalive_time = Instant::now();
                debug!("Deepgram keepalive sent");
                Ok(())
            }
            Err(tungstenite::Error::Io(e)) if e.kind() == ErrorKind::WouldBlock => Ok(()),
            Err(e) => Err(anyhow::anyhow!("Failed to send Deepgram keepalive: {}", e)),
        }
    }

    /// Poll for a finalized segment.
    /// Non-blocking — returns None immediately if no data is available.
    /// Prefer speech_final to avoid splitting one spoken thought into multiple fragments.
    /// Fall back to is_final only if speech_final is absent.
    pub fn poll_transcript(&mut self) -> Result<Option<SttResult>> {
        loop {
            match self.ws.read() {
                Ok(Message::Text(text)) => {
                    debug!("Deepgram: {}", &text[..text.len().min(200)]);
                    match serde_json::from_str::<DgResponse>(&text) {
                        Ok(resp) => {
                            let is_complete = resp.speech_final == Some(true)
                                || (resp.speech_final.is_none() && resp.is_final == Some(true));
                            let transcript = resp
                                .channel
                                .and_then(|c| c.alternatives.into_iter().next())
                                .map(|a| a.transcript)
                                .unwrap_or_default();

                            let is_final = resp.is_final == Some(true);
                            let is_speech_final = resp.speech_final == Some(true);

                            if !transcript.trim().is_empty() {
                                if is_final || is_speech_final {
                                    let final_candidate = final_candidate_from_interim(
                                        &self.latest_interim,
                                        &transcript,
                                    );
                                    self.final_transcript =
                                        merge_transcripts(&self.final_transcript, &final_candidate);
                                    self.latest_interim.clear();
                                } else {
                                    self.latest_interim = transcript.trim().to_string();
                                }
                            }

                            if is_complete {
                                let completed_transcript =
                                    cleanup_repeated_word_spans(&merge_transcripts(
                                        &self.final_transcript,
                                        &self.latest_interim,
                                    ));
                                self.final_transcript.clear();
                                self.latest_interim.clear();

                                if completed_transcript.trim().is_empty() {
                                    continue;
                                }

                                // STT latency: how far behind real-time is Deepgram?
                                // audio_sent_secs = total audio duration sent
                                // utterance_end = start + duration (Deepgram's clock)
                                // The gap = (audio_sent - utterance_end) seconds of audio
                                //   that Deepgram still had buffered when it returned this result.
                                // Plus the network RTT from last send to now.
                                // Simplified: time since last audio send + processing backlog
                                let utterance_end_secs =
                                    resp.start.unwrap_or(0.0) + resp.duration.unwrap_or(0.0);
                                let backlog_secs = self.audio_sent_secs - utterance_end_secs;
                                let since_last_send_ms =
                                    self.last_send_time.elapsed().as_millis() as u64;
                                let stt_latency_ms =
                                    (backlog_secs * 1000.0).max(0.0) as u64 + since_last_send_ms;

                                info!(
                                    "Deepgram final: '{}' (stt={}ms, speech_final={:?}, is_final={:?})",
                                    completed_transcript,
                                    stt_latency_ms,
                                    resp.speech_final,
                                    resp.is_final
                                );
                                return Ok(Some(SttResult {
                                    text: completed_transcript,
                                    stt_latency_ms,
                                }));
                            }
                        }
                        Err(e) => debug!("Deepgram parse error: {}", e),
                    }
                }
                Ok(_) => {}
                Err(tungstenite::Error::Io(e)) if e.kind() == ErrorKind::WouldBlock => {
                    return Ok(None);
                }
                Err(e) => bail!("Deepgram WebSocket error: {}", e),
            }
        }
    }

    pub fn close(&mut self) {
        let _ = self.ws.send(Message::Binary(vec![]));
        let _ = self.ws.close(None);
    }
}

// ---------------------------------------------------------------------------
// Deepgram response types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct DgResponse {
    is_final: Option<bool>,
    speech_final: Option<bool>,
    start: Option<f64>,
    duration: Option<f64>,
    channel: Option<DgChannel>,
}

#[derive(Deserialize)]
struct DgChannel {
    alternatives: Vec<DgAlternative>,
}

#[derive(Deserialize)]
struct DgAlternative {
    transcript: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_final_tail_keeps_long_interim_context() {
        let candidate = final_candidate_from_interim(
            "Это длинная фраза, которая закончилась словом тебя",
            "тебя.",
        );

        assert_eq!(
            candidate,
            "Это длинная фраза, которая закончилась словом тебя"
        );
    }

    #[test]
    fn substantial_final_correction_beats_unrelated_interim() {
        let candidate = final_candidate_from_interim("Che ti abbia avuto?", "What's your name?");

        assert_eq!(candidate, "What's your name?");
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn set_nonblocking(ws: &mut WebSocket<MaybeTlsStream<std::net::TcpStream>>) -> Result<()> {
    match ws.get_mut() {
        MaybeTlsStream::Plain(s) => s.set_nonblocking(true).context("set_nonblocking (plain)")?,
        MaybeTlsStream::NativeTls(s) => s
            .get_ref()
            .set_nonblocking(true)
            .context("set_nonblocking (tls)")?,
        _ => warn!("Unknown stream type, non-blocking not set"),
    }
    Ok(())
}
