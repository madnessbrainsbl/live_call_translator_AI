import unittest
from unittest.mock import patch

from web import app
from web.routes import _extract_answer


class AiAnswerFormatTests(unittest.TestCase):
    def test_extract_answer_normalizes_numbered_prefixes(self) -> None:
        raw = "1. First concrete answer.\n\n2. Second concrete answer."

        self.assertEqual(
            _extract_answer(raw),
            "1) First concrete answer.\n\n2) Second concrete answer.",
        )

    def test_suggestions_normalizes_codex_numbered_prefixes(self) -> None:
        payload = {
            "ai_provider": "codex",
            "mode": "full",
            "my_language": "en",
            "their_language": "en",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "How would you test for Broken Object Level Authorization in an API?",
                    "translation": "How would you test for Broken Object Level Authorization in an API?",
                    "at": 1,
                }
            ],
        }

        with (
            patch("web.routes.load_settings", return_value={"ai_provider": "codex", "codex_enabled": True}),
            patch("web.routes.get_openrouter_key", return_value=""),
            patch("web.routes.get_groq_key", return_value=""),
            patch(
                "web.routes.call_codex_cli",
                return_value=(
                    "1. I test BOLA with two same-role users and swapped object IDs.\n\n"
                    "2. I also test UUID-backed references because UUIDs are not authorization."
                ),
            ),
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["provider"], "codex")
        self.assertTrue(data["answer"].startswith("1) "))
        self.assertIn("\n\n2) ", data["answer"])


if __name__ == "__main__":
    unittest.main()
