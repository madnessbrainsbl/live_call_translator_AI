mod audio;
mod engine;
mod protocol;
mod stt;
mod translation;
mod tts;

use std::fs::OpenOptions;
use std::io::{BufReader, BufWriter, Write};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Result;
use crossbeam_channel::bounded;
use log::{debug, error, info};

use crate::engine::{Engine, EngineConfig};
use crate::protocol::{read_command, write_event, Event};

fn main() -> Result<()> {
    // Logger writes to stderr — stdout is reserved for the protocol channel.
    env_logger::Builder::from_default_env()
        .target(env_logger::Target::Stderr)
        .init();

    set_stdio_binary_mode();
    debug_log("audio_engine boot");

    info!("audio_engine starting");

    // Initialize ONNX Runtime (required for load-dynamic feature).
    // Must be called before any ort::Session creation (TTS Piper).
    let ort_dylib = std::env::var("ORT_DYLIB_PATH").unwrap_or_else(|_| default_ort_path());
    debug_log(&format!("ORT init start path={}", ort_dylib));
    ort::init_from(&ort_dylib)
        .expect("Failed to load ONNX Runtime shared library")
        .commit();
    info!("ONNX Runtime loaded from {}", ort_dylib);
    debug_log(&format!("ORT init done path={}", ort_dylib));

    // Channel for events from pipeline threads -> stdout writer
    let (event_tx, event_rx) = bounded::<Event>(256);

    // Event writer thread: reads events from the channel, writes to stdout.
    // This is the only thread that writes to stdout, avoiding lock contention.
    let writer_handle = thread::Builder::new()
        .name("event-writer".into())
        .spawn(move || {
            let stdout = std::io::stdout().lock();
            let mut writer = BufWriter::new(stdout);

            while let Ok(event) = event_rx.recv() {
                debug!("Sending event: {:?}", event);
                if let Err(e) = write_event(&mut writer, &event) {
                    error!("Failed to write event: {:#}", e);
                    break;
                }
                if let Err(e) = writer.flush() {
                    error!("Failed to flush stdout: {:#}", e);
                    break;
                }
            }
            debug!("Event writer thread exiting");
        })?;

    let config = EngineConfig::from_env();
    let mut engine = Engine::new(config, event_tx.clone());

    // Command reader: reads from stdin
    let stdin = std::io::stdin().lock();
    let mut reader = BufReader::new(stdin);
    debug_log("Command loop ready");

    loop {
        let cmd = match read_command(&mut reader) {
            Ok(Some(cmd)) => cmd,
            Ok(None) => {
                info!("EOF on stdin, shutting down");
                debug_log("EOF on stdin");
                break;
            }
            Err(e) => {
                error!("Failed to read command: {:#}", e);
                debug_log(&format!("Failed to read command: {:#}", e));
                let err_event = Event::Error {
                    message: format!("{:#}", e),
                };
                let _ = event_tx.send(err_event);
                continue;
            }
        };

        debug!("Received command: {:?}", cmd);
        debug_log(&format!("Received command: {:?}", cmd));

        // handle_command returns immediate events (Pong, Started, etc.)
        let immediate_events = engine.handle_command(cmd);

        // Send immediate events through the same channel
        for event in immediate_events {
            debug_log(&format!("Immediate event: {:?}", event));
            if let Err(e) = event_tx.send(event) {
                error!("Failed to send immediate event: {:#}", e);
                debug_log(&format!("Failed to send immediate event: {:#}", e));
            }
        }

        if engine.is_shutting_down() {
            info!("Shutdown requested, exiting");
            break;
        }
    }

    // Drop the sender so the writer thread can finish
    drop(event_tx);

    // Wait for the writer thread
    if let Err(e) = writer_handle.join() {
        error!("Event writer thread panicked: {:?}", e);
    }

    info!("audio_engine stopped");
    Ok(())
}

fn debug_log(message: &str) {
    let path = match std::env::var("TRANSLATOR_DEBUG_LOG") {
        Ok(v) if !v.trim().is_empty() => v,
        _ => return,
    };

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(file, "[{}] {}", ts, message);
    }
}

#[cfg(windows)]
fn set_stdio_binary_mode() {
    const STDIN_FILENO: i32 = 0;
    const STDOUT_FILENO: i32 = 1;
    const O_BINARY: i32 = 0x8000;

    unsafe {
        let _ = win_setmode(STDIN_FILENO, O_BINARY);
        let _ = win_setmode(STDOUT_FILENO, O_BINARY);
    }
}

#[cfg(windows)]
#[link(name = "msvcrt")]
unsafe extern "C" {
    #[link_name = "_setmode"]
    fn win_setmode(fd: i32, mode: i32) -> i32;
}

#[cfg(not(windows))]
fn set_stdio_binary_mode() {}

fn default_ort_path() -> String {
    match std::env::consts::OS {
        "linux" => "./vendor/onnxruntime/lib/libonnxruntime.so".into(),
        "windows" => ".\\vendor\\onnxruntime-win-x64\\lib\\onnxruntime.dll".into(),
        _ => "/opt/homebrew/lib/libonnxruntime.dylib".into(),
    }
}
