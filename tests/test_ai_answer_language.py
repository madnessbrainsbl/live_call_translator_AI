import unittest
from unittest.mock import patch

from web import app
from web.routes import _add_focus_candidate, _answer_language_code


class AiAnswerLanguageTests(unittest.TestCase):
    def test_incoming_translated_candidate_keeps_speaker_language(self) -> None:
        candidates = []

        _add_focus_candidate(
            candidates,
            "So, what's the main function of an antivirus, anyway?",
            "en",
            "ru",
            "Them",
            "incoming",
            "ru",
        )

        self.assertEqual(candidates[0]["lang"], "en")
        self.assertEqual(candidates[0]["speaker_lang"], "ru")
        self.assertEqual(_answer_language_code(candidates[0], "ru", "ru", "en"), "ru")

    def test_answer_language_falls_back_to_latest_speaker_language(self) -> None:
        self.assertEqual(_answer_language_code(None, "ru", "en", "en"), "ru")

    def test_suggestions_prompt_uses_incoming_speaker_language(self) -> None:
        captured = {}

        def fake_groq(messages, *_args, **_kwargs):
            captured["system"] = messages[0]["content"]
            captured["user"] = messages[1]["content"]
            return "1) Основная функция антивируса - находить и блокировать вредоносное ПО."

        payload = {
            "ai_provider": "groq",
            "mode": "quick",
            "my_language": "en",
            "their_language": "ru",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "Что, главная функция антивируса в чём?",
                    "translation": "So, what's the main function of an antivirus, anyway?",
                    "at": 1,
                }
            ],
        }

        with (
            patch("web.routes.get_groq_key", return_value="test-groq-key"),
            patch("web.routes.call_groq", side_effect=fake_groq),
            patch("web.routes.load_settings", return_value={"ai_provider": "groq"}),
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertIn("Answer language: Russian", captured["system"])
        self.assertIn("Private answer language for Me: Russian", captured["user"])


if __name__ == "__main__":
    unittest.main()
