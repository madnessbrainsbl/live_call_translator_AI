"""Constants and settings management."""

import os
import json
import sys

SOURCE_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_DIR = os.path.abspath(os.environ.get("TRANSLATOR_APP_ROOT") or SOURCE_BASE_DIR)
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
DEFAULT_GEMINI_MODEL = "gemini-3.5-flash"
DEFAULT_ANTIGRAVITY_CHAT_URL = "http://127.0.0.1:8045/v1/chat/completions"
DEFAULT_MY_LANGUAGE = "ru"
DEFAULT_THEIR_LANGUAGE = "en"
DEFAULT_AI_ANSWER_LANGUAGE = "their"
AI_ANSWER_LANGUAGE_MODES = {"their", "my", "auto"}
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", DEFAULT_OPENROUTER_MODEL)
OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEEPGRAM_API_URL = "https://api.deepgram.com/v1/projects"
PIPER_VOICES_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0"
USER_AGENT = "translator/1.0"

CALL_IDLE_TIMEOUT = 300  # 5 min silence -> auto-close call
AI_RESUME_PROMPT_MAX_CHARS = 20000
AI_VACANCY_PROMPT_MAX_CHARS = 20000

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
    "backup_groq_api_key": "",
    "ai_provider": "codex",
    "codex_enabled": True,
    "codex_model": DEFAULT_CODEX_MODEL,
    "openrouter_api_key": "",
    "openrouter_model": OPENROUTER_MODEL,
    "gemini_api_key": "",
    "gemini_model": DEFAULT_GEMINI_MODEL,
    "antigravity_chat_url": DEFAULT_ANTIGRAVITY_CHAT_URL,
    "ai_resume_prompt": "",
    "ai_vacancy_prompt": "",
    "text_only_mode": False,
    "transcript_only_mode": False,
    "transcript_hidden_mode": False,
    "translation_enabled": True,
    "tts_provider": "piper",
    "tts_outgoing_voice": "",
    "tts_incoming_voice": "",
    "mic_device": DEFAULT_MIC_DEVICE,
    "speaker_device": DEFAULT_SPEAKER_DEVICE,
    "meet_input_device": DEFAULT_MEET_INPUT_DEVICE,
    "meet_output_device": DEFAULT_MEET_OUTPUT_DEVICE,
    "endpointing_ms": 700,
    "my_language": DEFAULT_MY_LANGUAGE,
    "their_language": DEFAULT_THEIR_LANGUAGE,
    "ai_answer_language": DEFAULT_AI_ANSWER_LANGUAGE,
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


def _normalize_language_code(value: object, fallback: str) -> str:
    code = str(value or "").strip().lower().split("-", 1)[0]
    return code or fallback


def _normalize_ai_answer_language(value: object) -> str:
    mode = str(value or "").strip().lower()
    return mode if mode in AI_ANSWER_LANGUAGE_MODES else DEFAULT_AI_ANSWER_LANGUAGE


def _repair_translation_language_pair(settings: dict) -> dict:
    migrated = dict(settings)
    my_language = _normalize_language_code(migrated.get("my_language"), DEFAULT_MY_LANGUAGE)
    their_language = _normalize_language_code(
        migrated.get("their_language"), DEFAULT_THEIR_LANGUAGE
    )

    transcript_only = bool(migrated.get("transcript_only_mode", False))
    if not transcript_only and my_language == their_language:
        their_language = (
            DEFAULT_THEIR_LANGUAGE
            if my_language != DEFAULT_THEIR_LANGUAGE
            else DEFAULT_MY_LANGUAGE
        )

    migrated["my_language"] = my_language
    migrated["their_language"] = their_language
    migrated["ai_answer_language"] = _normalize_ai_answer_language(
        migrated.get("ai_answer_language")
    )
    return migrated


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

    transcript_only = bool(migrated.get("transcript_only_mode", False))
    if migrated.get("translation_enabled") is False:
        transcript_only = True
    migrated["transcript_only_mode"] = transcript_only
    migrated["translation_enabled"] = not transcript_only
    migrated = _repair_translation_language_pair(migrated)

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
    settings["backup_groq_api_key"] = (
        os.environ.get("GROQ_BACKUP_API_KEY", "")
        or os.environ.get("GROQ_API_KEY_BACKUP", "")
    )
    settings["openrouter_api_key"] = os.environ.get("OPENROUTER_API_KEY", "")
    settings["openrouter_model"] = os.environ.get("OPENROUTER_MODEL", DEFAULT_OPENROUTER_MODEL)
    settings["gemini_api_key"] = os.environ.get("GEMINI_API_KEY", "")
    settings["gemini_model"] = os.environ.get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
    settings["antigravity_chat_url"] = os.environ.get(
        "ANTIGRAVITY_CHAT_URL",
        DEFAULT_ANTIGRAVITY_CHAT_URL,
    )
    return _migrate_platform_audio_settings(settings)


def save_settings_to_file(settings):
    cleaned = _migrate_platform_audio_settings(settings)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, indent=2)
    return cleaned


def get_groq_key():
    settings = load_settings()
    return settings.get("groq_api_key") or os.environ.get("GROQ_API_KEY", "")


def get_backup_groq_key():
    settings = load_settings()
    return (
        settings.get("backup_groq_api_key")
        or os.environ.get("GROQ_BACKUP_API_KEY", "")
        or os.environ.get("GROQ_API_KEY_BACKUP", "")
    )


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


def get_gemini_key():
    settings = load_settings()
    return settings.get("gemini_api_key") or os.environ.get("GEMINI_API_KEY", "")


def get_gemini_model():
    settings = load_settings()
    return (
        settings.get("gemini_model")
        or os.environ.get("GEMINI_MODEL")
        or DEFAULT_GEMINI_MODEL
    )


def get_antigravity_chat_url():
    settings = load_settings()
    return (
        settings.get("antigravity_chat_url")
        or os.environ.get("ANTIGRAVITY_CHAT_URL")
        or DEFAULT_ANTIGRAVITY_CHAT_URL
    )
