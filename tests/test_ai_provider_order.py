import unittest
from unittest.mock import patch

from web import app
from web.routes import _suggestion_provider_order


class AiProviderOrderTests(unittest.TestCase):
    def test_codex_quick_uses_fast_provider_order(self) -> None:
        self.assertEqual(_suggestion_provider_order("codex", True), ["groq", "openrouter", "codex"])

    def test_codex_detail_stays_strict(self) -> None:
        self.assertEqual(_suggestion_provider_order("codex", False), ["codex"])

    def test_auto_quick_uses_fast_provider_order(self) -> None:
        self.assertEqual(_suggestion_provider_order("auto", True), ["groq", "openrouter", "codex"])

    def test_quick_request_uses_groq_before_codex_when_codex_selected(self) -> None:
        payload = {
            "ai_provider": "codex",
            "mode": "quick",
            "my_language": "ru",
            "their_language": "en",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "What is Kubernetes?",
                    "translation": "Что такое Kubernetes?",
                    "at": 1,
                }
            ],
        }

        with (
            patch("web.routes.load_settings", return_value={"ai_provider": "codex", "codex_enabled": True}),
            patch("web.routes.get_groq_key", return_value="test-groq-key"),
            patch("web.routes.get_openrouter_key", return_value="test-openrouter-key"),
            patch("web.routes.call_groq", return_value="1) Kubernetes is a container orchestration platform.") as groq,
            patch("web.routes.call_openrouter") as openrouter,
            patch("web.routes.call_codex_cli") as codex,
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["provider"], "groq")
        groq.assert_called_once()
        openrouter.assert_not_called()
        codex.assert_not_called()

    def test_detail_request_uses_codex_when_codex_selected(self) -> None:
        payload = {
            "ai_provider": "codex",
            "mode": "detail",
            "quick_answer": "1) Short answer.",
            "my_language": "ru",
            "their_language": "en",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "Tell me about Linux hardening.",
                    "translation": "Расскажи про Linux hardening.",
                    "at": 1,
                }
            ],
        }

        with (
            patch("web.routes.load_settings", return_value={"ai_provider": "codex", "codex_enabled": True}),
            patch("web.routes.get_groq_key", return_value="test-groq-key"),
            patch("web.routes.get_openrouter_key", return_value="test-openrouter-key"),
            patch("web.routes._should_web_search_for_ai", return_value=False),
            patch("web.routes.call_codex_cli", return_value="2) Linux hardening reduces attack surface.") as codex,
            patch("web.routes.call_groq") as groq,
            patch("web.routes.call_openrouter") as openrouter,
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["provider"], "codex")
        codex.assert_called_once()
        groq.assert_not_called()
        openrouter.assert_not_called()


if __name__ == "__main__":
    unittest.main()
