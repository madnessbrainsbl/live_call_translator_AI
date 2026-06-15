import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from web.settings import (
    DEFAULT_AI_ANSWER_LANGUAGE,
    DEFAULT_ANTIGRAVITY_CHAT_URL,
    DEFAULT_GEMINI_MODEL,
    _migrate_platform_audio_settings,
    DEFAULT_SETTINGS,
    save_settings_to_file,
)


class SettingsMigrationTests(unittest.TestCase):
    def test_translation_mode_repairs_same_language_pair(self) -> None:
        migrated = _migrate_platform_audio_settings(
            {
                "my_language": "ru",
                "their_language": "ru",
                "transcript_only_mode": False,
                "translation_enabled": True,
            }
        )

        self.assertEqual(migrated["my_language"], "ru")
        self.assertEqual(migrated["their_language"], "en")

    def test_transcript_only_mode_keeps_same_language_pair(self) -> None:
        migrated = _migrate_platform_audio_settings(
            {
                "my_language": "ru",
                "their_language": "ru",
                "transcript_only_mode": True,
                "translation_enabled": False,
            }
        )

        self.assertEqual(migrated["my_language"], "ru")
        self.assertEqual(migrated["their_language"], "ru")
        self.assertTrue(migrated["transcript_only_mode"])

    def test_save_settings_returns_migrated_settings(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings_file = Path(tmp_dir) / "settings.json"

            with patch("web.settings.SETTINGS_FILE", str(settings_file)):
                saved = save_settings_to_file(
                    {
                        "my_language": "en",
                        "their_language": "en",
                        "transcript_only_mode": False,
                        "translation_enabled": True,
                    }
                )

        self.assertEqual(saved["my_language"], "en")
        self.assertEqual(saved["their_language"], "ru")
        self.assertFalse(saved["transcript_only_mode"])
        self.assertTrue(saved["translation_enabled"])

    def test_ai_answer_language_defaults_and_rejects_invalid_values(self) -> None:
        migrated_missing = _migrate_platform_audio_settings({})
        migrated_invalid = _migrate_platform_audio_settings({"ai_answer_language": "speaker"})
        migrated_auto = _migrate_platform_audio_settings({"ai_answer_language": "auto"})

        self.assertEqual(migrated_missing["ai_answer_language"], DEFAULT_AI_ANSWER_LANGUAGE)
        self.assertEqual(migrated_invalid["ai_answer_language"], DEFAULT_AI_ANSWER_LANGUAGE)
        self.assertEqual(migrated_auto["ai_answer_language"], "auto")

    def test_gemini_defaults_are_present_for_old_settings(self) -> None:
        self.assertEqual(DEFAULT_SETTINGS["gemini_api_key"], "")
        self.assertEqual(DEFAULT_SETTINGS["gemini_model"], DEFAULT_GEMINI_MODEL)
        self.assertEqual(
            DEFAULT_SETTINGS["antigravity_chat_url"],
            DEFAULT_ANTIGRAVITY_CHAT_URL,
        )


if __name__ == "__main__":
    unittest.main()
