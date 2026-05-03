"""Constants and settings management."""

import os
import json
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETTINGS_FILE = os.path.join(BASE_DIR, "settings.json")
MODELS_DIR = os.path.join(BASE_DIR, "models")
DB_FILE = os.path.join(BASE_DIR, "calls.db")
LOG_FILE = os.path.join(BASE_DIR, "test-log.txt")
VOICE_CATALOG_CACHE_FILE = os.path.join(BASE_DIR, "voices-catalog.json")

CMD_HOST = "127.0.0.1"
CMD_PORT = 5051

GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_CODEX_MODEL = "gpt-5.4"
DEFAULT_OPENROUTER_MODEL = "openrouter/auto"
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", DEFAULT_OPENROUTER_MODEL)
OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
DEEPGRAM_API_URL = "https://api.deepgram.com/v1/projects"
PIPER_VOICES_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0"
USER_AGENT = "translator/1.0"

CALL_IDLE_TIMEOUT = 300  # 5 min silence -> auto-close call

IS_LINUX = sys.platform.startswith("linux")
IS_WINDOWS = sys.platform.startswith("win")

WINDOWS_CALL_CAPTURE_DEVICE = "CABLE-A Output (VB-Audio Cable A)"
WINDOWS_CALL_PLAYBACK_DEVICE = "CABLE-B Input (VB-Audio Cable B)"
SYSTEM_LOOPBACK_DEVICE = "__system_output_loopback__"

if IS_LINUX:
    DEFAULT_MIC_DEVICE = "translator_mic_in"
    DEFAULT_SPEAKER_DEVICE = "translator_speaker_out"
    DEFAULT_MEET_INPUT_DEVICE = "translator_call_in"
    DEFAULT_MEET_OUTPUT_DEVICE = "translator_call_out"
elif IS_WINDOWS:
    DEFAULT_MIC_DEVICE = "default"
    DEFAULT_SPEAKER_DEVICE = "default"
    DEFAULT_MEET_INPUT_DEVICE = SYSTEM_LOOPBACK_DEVICE
    DEFAULT_MEET_OUTPUT_DEVICE = "default"
else:
    DEFAULT_MIC_DEVICE = "default"
    DEFAULT_SPEAKER_DEVICE = "default"
    DEFAULT_MEET_INPUT_DEVICE = "BlackHole 16ch"
    DEFAULT_MEET_OUTPUT_DEVICE = "BlackHole 2ch"

# Preferred default voice per language (first medium-quality picked for unlisted)
DEFAULT_VOICES = {
    "ar": "ar_JO-kareem-medium",
    "ca": "ca_ES-upc_ona-medium",
    "cs": "cs_CZ-jirka-medium",
    "da": "da_DK-talesyntese-medium",
    "de": "de_DE-thorsten-medium",
    "el": "el_GR-rapunzelina-low",
    "en": "en_US-ryan-medium",
    "es": "es_ES-sharvard-medium",
    "fa": "fa_IR-amir-medium",
    "fi": "fi_FI-harri-medium",
    "fr": "fr_FR-siwis-medium",
    "hu": "hu_HU-anna-medium",
    "it": "it_IT-riccardo-x_low",
    "ka": "ka_GE-natia-medium",
    "ko": "ko_KR-kss-low",
    "nl": "nl_NL-mls-medium",
    "no": "no_NO-talesyntese-medium",
    "pl": "pl_PL-darkman-medium",
    "pt": "pt_BR-faber-medium",
    "ro": "ro_RO-mihai-medium",
    "ru": "ru_RU-denis-medium",
    "sv": "sv_SE-nst-medium",
    "tr": "tr_TR-dfki-medium",
    "uk": "uk_UA-ukrainian_tts-medium",
    "vi": "vi_VN-vais1000-medium",
    "zh": "zh_CN-huayan-medium",
}

DEFAULT_SETTINGS = {
    "deepgram_api_key": "",
    "groq_api_key": "",
    "ai_provider": "codex",
    "codex_enabled": True,
    "codex_model": DEFAULT_CODEX_MODEL,
    "openrouter_api_key": "",
    "openrouter_model": OPENROUTER_MODEL,
    "text_only_mode": False,
    "tts_provider": "piper",
    "tts_outgoing_voice": "",
    "tts_incoming_voice": "",
    "mic_device": DEFAULT_MIC_DEVICE,
    "speaker_device": DEFAULT_SPEAKER_DEVICE,
    "meet_input_device": DEFAULT_MEET_INPUT_DEVICE,
    "meet_output_device": DEFAULT_MEET_OUTPUT_DEVICE,
    "endpointing_ms": 700,
    "my_language": "en",
    "their_language": "en",
}


def repair_mojibake(value):
    if not isinstance(value, str) or not value:
        return value
    try:
        repaired = value.encode("cp1251").decode("utf-8")
    except UnicodeError:
        return value
    return repaired if repaired else value


def english_device_label(value):
    if not isinstance(value, str) or not value:
        return value

    label = repair_mojibake(value)
    replacements = (
        ("Микрофон", "Microphone"),
        ("микрофон", "microphone"),
        ("Динамики", "Speakers"),
        ("динамики", "speakers"),
        ("Наушники", "Headphones"),
        ("наушники", "headphones"),
        ("Стерео микшер", "Stereo Mix"),
        ("стерео микшер", "stereo mix"),
    )
    for src, dst in replacements:
        label = label.replace(src, dst)
    return label


def _migrate_platform_audio_settings(settings):
    migrated = dict(settings)

    if migrated.get("codex_model") == "gpt-5.2-codex":
        migrated["codex_model"] = DEFAULT_CODEX_MODEL

    try:
        endpointing_ms = int(migrated.get("endpointing_ms", 700))
    except (TypeError, ValueError):
        endpointing_ms = 700
    migrated["endpointing_ms"] = max(500, endpointing_ms)
    migrated.pop("translation_max_tokens", None)

    tts_provider = str(migrated.get("tts_provider") or "piper").strip().lower()
    if tts_provider == "browser":
        tts_provider = "edge"
    migrated["tts_provider"] = tts_provider if tts_provider in {"piper", "edge"} else "piper"

    if IS_WINDOWS:
        for key in ("mic_device", "speaker_device", "meet_input_device", "meet_output_device"):
            migrated[key] = english_device_label(migrated.get(key, "default")) or "default"

        legacy_mic_values = {"translator_mic_in", "BlackHole 16ch"}
        legacy_speaker_values = {"translator_speaker_out", "BlackHole 2ch"}
        legacy_call_input_values = {"translator_call_in", "BlackHole 16ch"}
        legacy_call_output_values = {"translator_call_out", "BlackHole 2ch"}

        if migrated.get("mic_device") in legacy_mic_values:
            migrated["mic_device"] = DEFAULT_MIC_DEVICE
        if migrated.get("speaker_device") in legacy_speaker_values:
            migrated["speaker_device"] = DEFAULT_SPEAKER_DEVICE
        if migrated.get("meet_input_device") in legacy_call_input_values:
            migrated["meet_input_device"] = DEFAULT_MEET_INPUT_DEVICE
        if migrated.get("meet_output_device") in legacy_call_output_values:
            migrated["meet_output_device"] = DEFAULT_MEET_OUTPUT_DEVICE
        if migrated.get("meet_input_device") in ("", "default"):
            migrated["meet_input_device"] = DEFAULT_MEET_INPUT_DEVICE
        if migrated.get("meet_output_device") == "":
            migrated["meet_output_device"] = DEFAULT_MEET_OUTPUT_DEVICE

        # Earlier Windows builds accidentally swapped capture/playback cable roles.
        if (
            migrated.get("meet_input_device") == "CABLE-B Input (VB-Audio Cable B)"
            and migrated.get("meet_output_device") == "CABLE-A Output (VB-Audio Cable A)"
        ):
            migrated["meet_input_device"] = DEFAULT_MEET_INPUT_DEVICE
            migrated["meet_output_device"] = DEFAULT_MEET_OUTPUT_DEVICE

    return migrated


def load_settings():
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, encoding="utf-8") as f:
            saved = json.load(f)
        saved.pop("cerebras_api_key", None)
        merged = {**DEFAULT_SETTINGS, **saved}
        migrated = _migrate_platform_audio_settings(merged)
        if migrated != merged:
            save_settings_to_file(migrated)
        return migrated
    # First launch -- pre-populate from env vars
    settings = dict(DEFAULT_SETTINGS)
    settings["deepgram_api_key"] = os.environ.get("DEEPGRAM_API_KEY", "")
    settings["groq_api_key"] = os.environ.get("GROQ_API_KEY", "")
    settings["openrouter_api_key"] = os.environ.get("OPENROUTER_API_KEY", "")
    settings["openrouter_model"] = os.environ.get("OPENROUTER_MODEL", DEFAULT_OPENROUTER_MODEL)
    return _migrate_platform_audio_settings(settings)


def save_settings_to_file(settings):
    cleaned = _migrate_platform_audio_settings(settings)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, indent=2)


def get_groq_key():
    settings = load_settings()
    return settings.get("groq_api_key") or os.environ.get("GROQ_API_KEY", "")


def get_openrouter_key():
    settings = load_settings()
    return settings.get("openrouter_api_key") or os.environ.get("OPENROUTER_API_KEY", "")


def get_openrouter_model():
    settings = load_settings()
    return (
        settings.get("openrouter_model")
        or os.environ.get("OPENROUTER_MODEL")
        or DEFAULT_OPENROUTER_MODEL
    )
