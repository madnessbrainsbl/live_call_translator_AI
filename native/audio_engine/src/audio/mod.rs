pub mod capture;
pub mod playback;

use anyhow::Result;
use cpal::traits::{DeviceTrait, HostTrait};
use log::info;

pub fn device_name_matches(candidate: &str, requested: &str) -> bool {
    if requested == "default" {
        return false;
    }

    let candidate = normalize_name(candidate);
    let requested = normalize_name(requested);

    !requested.is_empty()
        && !candidate.is_empty()
        && (candidate == requested
            || candidate.contains(&requested)
            || requested.contains(&candidate))
}

fn normalize_name(name: &str) -> String {
    translate_windows_device_words(name)
        .chars()
        .map(|ch| {
            if ch.is_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn translate_windows_device_words(name: &str) -> String {
    let mut translated = name.to_string();
    for (from, to) in [
        ("Микрофон", "Microphone"),
        ("микрофон", "microphone"),
        ("РњРёРєСЂРѕС„РѕРЅ", "Microphone"),
        ("Динамики", "Speakers"),
        ("динамики", "speakers"),
        ("Р”РёРЅР°РјРёРєРё", "Speakers"),
        ("Наушники", "Headphones"),
        ("наушники", "headphones"),
        ("РќР°СѓС€РЅРёРєРё", "Headphones"),
        ("Стерео микшер", "Stereo Mix"),
        ("стерео микшер", "stereo mix"),
    ] {
        translated = translated.replace(from, to);
    }
    translated
}

/// List all available audio devices (useful for debugging).
/// Returns (input_names, output_names).
pub fn list_devices() -> Result<(Vec<String>, Vec<String>)> {
    let mut input_names = Vec::new();
    let mut output_names = Vec::new();

    for host in candidate_hosts() {
        let host_id = format!("{:?}", host.id());

        if let Some(dev) = host.default_input_device() {
            let name = dev.name().unwrap_or_else(|_| "unknown".into());
            info!("Default input device on {}: {}", host_id, name);
        }

        if let Some(dev) = host.default_output_device() {
            let name = dev.name().unwrap_or_else(|_| "unknown".into());
            info!("Default output device on {}: {}", host_id, name);
        }

        if let Ok(inputs) = host.input_devices() {
            for device in inputs {
                let name = device.name().unwrap_or_else(|_| "unknown".into());
                if !input_names.contains(&name) {
                    info!("Input device on {}: {}", host_id, name);
                    input_names.push(name);
                }
            }
        }

        if let Ok(outputs) = host.output_devices() {
            for device in outputs {
                let name = device.name().unwrap_or_else(|_| "unknown".into());
                if !output_names.contains(&name) {
                    info!("Output device on {}: {}", host_id, name);
                    output_names.push(name);
                }
            }
        }
    }

    if input_names.is_empty() {
        info!("  (none) No input devices visible to CPAL. Microphone may be disconnected, disabled, or blocked by OS privacy settings.");
    }

    Ok((input_names, output_names))
}

pub fn candidate_hosts() -> Vec<cpal::Host> {
    let default_host = cpal::default_host();
    let default_id = default_host.id();
    let mut hosts = vec![default_host];

    for host_id in cpal::available_hosts() {
        if host_id == default_id {
            continue;
        }
        if let Ok(host) = cpal::host_from_id(host_id) {
            hosts.push(host);
        }
    }

    hosts
}

#[cfg(test)]
mod tests {
    use super::device_name_matches;

    #[test]
    fn localized_windows_device_names_match_english_aliases() {
        assert!(device_name_matches(
            "Микрофон (Realtek(R) Audio)",
            "Microphone (Realtek(R) Audio)"
        ));
        assert!(device_name_matches(
            "Наушники (Realtek(R) Audio)",
            "Headphones (Realtek(R) Audio)"
        ));
        assert!(device_name_matches(
            "Динамики (Realtek(R) Audio)",
            "Speakers (Realtek(R) Audio)"
        ));
    }
}
