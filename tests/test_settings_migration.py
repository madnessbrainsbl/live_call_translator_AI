import unittest

from web.settings import _migrate_platform_audio_settings


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


if __name__ == "__main__":
    unittest.main()
