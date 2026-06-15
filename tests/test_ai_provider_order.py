import unittest
import urllib.error
from unittest.mock import patch

from web import app
from web.routes import _PROVIDER_COOLDOWNS, _cooldown_provider, _suggestion_provider_order


class AiProviderOrderTests(unittest.TestCase):
    def tearDown(self) -> None:
        _PROVIDER_COOLDOWNS.clear()

    def test_codex_quick_uses_fast_provider_order(self) -> None:
        self.assertEqual(
            _suggestion_provider_order("codex", True),
            ["groq", "openrouter", "gemini", "codex"],
        )

    def test_codex_detail_stays_strict(self) -> None:
        self.assertEqual(
            _suggestion_provider_order("codex", False),
            ["codex", "openrouter", "gemini"],
        )

    def test_auto_quick_uses_fast_provider_order(self) -> None:
        self.assertEqual(
            _suggestion_provider_order("auto", True),
            ["groq", "openrouter", "gemini", "codex"],
        )

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
            patch("web.routes.call_gemini") as gemini,
            patch("web.routes.call_codex_cli") as codex,
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["provider"], "groq")
        groq.assert_called_once()
        openrouter.assert_not_called()
        gemini.assert_not_called()

    def test_rate_limited_quick_provider_falls_back_to_openrouter(self) -> None:
        payload = {
            "ai_provider": "codex",
            "mode": "quick",
            "my_language": "ru",
            "their_language": "en",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "What is OAuth?",
                    "translation": "Что такое OAuth?",
                    "at": 1,
                }
            ],
        }
        rate_limit = urllib.error.HTTPError(
            url="https://api.groq.com",
            code=429,
            msg="Too Many Requests",
            hdrs=None,
            fp=None,
        )

        with (
            patch("web.routes.load_settings", return_value={"ai_provider": "codex", "codex_enabled": True}),
            patch("web.routes.get_groq_key", return_value="test-groq-key"),
            patch("web.routes.get_openrouter_key", return_value="test-openrouter-key"),
            patch("web.routes.call_groq", side_effect=rate_limit) as groq,
            patch("web.routes.call_openrouter", return_value="1) OAuth protects delegated access when scopes and redirect flows are validated.") as openrouter,
            patch("web.routes.call_gemini") as gemini,
            patch("web.routes.call_codex_cli") as codex,
        ):
            first = app.test_client().post("/api/suggestions", json=payload)
            second = app.test_client().post("/api/suggestions", json=payload)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.get_json()["provider"], "openrouter")
        self.assertEqual(second.get_json()["provider"], "openrouter")
        groq.assert_called_once()
        self.assertEqual(openrouter.call_count, 2)
        gemini.assert_not_called()
        codex.assert_not_called()

    def test_rate_limited_quick_provider_falls_back_to_codex_when_openrouter_missing(self) -> None:
        payload = {
            "ai_provider": "codex",
            "mode": "quick",
            "my_language": "ru",
            "their_language": "en",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "What is OAuth?",
                    "translation": "Что такое OAuth?",
                    "at": 1,
                }
            ],
        }
        rate_limit = urllib.error.HTTPError(
            url="https://api.groq.com",
            code=429,
            msg="Too Many Requests",
            hdrs=None,
            fp=None,
        )

        with (
            patch("web.routes.load_settings", return_value={"ai_provider": "codex", "codex_enabled": True}),
            patch("web.routes.get_groq_key", return_value="test-groq-key"),
            patch("web.routes.get_openrouter_key", return_value=""),
            patch("web.routes.call_groq", side_effect=rate_limit) as groq,
            patch("web.routes.call_openrouter") as openrouter,
            patch("web.routes.call_codex_cli", return_value="1) OAuth protects delegated access when scopes and redirect flows are validated.") as codex,
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["provider"], "codex")
        groq.assert_called_once()
        openrouter.assert_not_called()
        codex.assert_called_once()

    def test_quick_request_falls_back_to_gemini_before_codex_when_openrouter_fails(self) -> None:
        settings = {
            "ai_provider": "codex",
            "codex_enabled": True,
            "gemini_api_key": "test-gemini-key",
            "gemini_model": "gemini-3.5-flash",
        }
        payload = {
            "ai_provider": "codex",
            "mode": "quick",
            "my_language": "ru",
            "their_language": "en",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "How do you test deep links for account takeover?",
                    "translation": "Как тестировать deep links на ATO?",
                    "at": 1,
                }
            ],
        }
        groq_limit = urllib.error.HTTPError(
            url="https://api.groq.com",
            code=429,
            msg="Too Many Requests",
            hdrs=None,
            fp=None,
        )
        openrouter_limit = urllib.error.HTTPError(
            url="https://openrouter.ai",
            code=429,
            msg="Too Many Requests",
            hdrs=None,
            fp=None,
        )

        with (
            patch("web.routes.load_settings", return_value=settings),
            patch("web.routes.get_groq_key", return_value="test-groq-key"),
            patch("web.routes.get_openrouter_key", return_value="test-openrouter-key"),
            patch("web.routes.call_groq", side_effect=groq_limit) as groq,
            patch("web.routes.call_openrouter", side_effect=openrouter_limit) as openrouter,
            patch(
                "web.routes.call_gemini",
                return_value="1) I test custom scheme hijack, token replay, session binding, TTL, and backend anti-replay before calling it ATO.",
            ) as gemini,
            patch("web.routes.call_codex_cli") as codex,
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["provider"], "gemini")
        self.assertIn("session binding", data["answer"])
        groq.assert_called_once()
        openrouter.assert_called_once()
        gemini.assert_called_once()
        codex.assert_not_called()

    def test_detail_request_falls_back_to_gemini_when_codex_and_openrouter_fail(self) -> None:
        settings = {
            "ai_provider": "codex",
            "codex_enabled": True,
            "gemini_api_key": "test-gemini-key",
            "gemini_model": "gemini-3.5-flash",
        }
        payload = {
            "ai_provider": "codex",
            "mode": "detail",
            "quick_answer": "1) I validate link ownership and backend binding before calling it ATO.",
            "my_language": "ru",
            "their_language": "en",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "How do you test deep links and universal links for account takeover risks?",
                    "translation": "Как тестировать deep links и universal links на риск ATO?",
                    "at": 1,
                }
            ],
        }
        openrouter_limit = urllib.error.HTTPError(
            url="https://openrouter.ai",
            code=429,
            msg="Too Many Requests",
            hdrs=None,
            fp=None,
        )
        gemini_answer = (
            "2) I enumerate custom schemes and universal links, validate association files, "
            "tamper parameters, replay magic-login tokens, and verify server-side binding."
        )

        with (
            patch("web.routes.load_settings", return_value=settings),
            patch("web.routes.get_groq_key", return_value="test-groq-key"),
            patch("web.routes.get_openrouter_key", return_value="test-openrouter-key"),
            patch("web.routes._should_web_search_for_ai", return_value=False),
            patch("web.routes.call_codex_cli", side_effect=TimeoutError("request timed out")) as codex,
            patch("web.routes.call_openrouter", side_effect=openrouter_limit) as openrouter,
            patch("web.routes.call_gemini", return_value=gemini_answer) as gemini,
            patch("web.routes.call_groq") as groq,
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["provider"], "gemini")
        self.assertIn("association files", data["answer"])
        codex.assert_called_once()
        openrouter.assert_called_once()
        gemini.assert_called_once()
        groq.assert_not_called()

    def test_gemini_test_key_uses_antigravity_for_sk_key(self) -> None:
        with (
            patch(
                "web.routes.load_settings",
                return_value={
                    "gemini_model": "gemini-3.5-flash",
                    "antigravity_chat_url": "http://127.0.0.1:8045/v1/chat/completions",
                },
            ),
            patch("web.routes.call_gemini") as gemini,
            patch("web.routes.call_antigravity", return_value="OK") as antigravity,
        ):
            response = app.test_client().post(
                "/api/test-key",
                json={"provider": "gemini", "key": "sk-antigravity-gemini-key"},
            )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["valid"])
        self.assertEqual(data["message"], "Antigravity Gemini request ok")
        gemini.assert_not_called()
        antigravity.assert_called_once()

    def test_sk_gemini_key_uses_antigravity_live_fallback(self) -> None:
        settings = {
            "ai_provider": "codex",
            "codex_enabled": True,
            "gemini_api_key": "sk-antigravity-gemini-key",
            "gemini_model": "gemini-3.5-flash",
            "antigravity_chat_url": "http://127.0.0.1:8045/v1/chat/completions",
        }
        payload = {
            "ai_provider": "codex",
            "mode": "quick",
            "my_language": "ru",
            "their_language": "en",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "How do you test API Shield schema validation?",
                    "translation": "Как тестировать API Shield schema validation?",
                    "at": 1,
                }
            ],
        }
        groq_limit = urllib.error.HTTPError(
            url="https://api.groq.com",
            code=429,
            msg="Too Many Requests",
            hdrs=None,
            fp=None,
        )
        openrouter_limit = urllib.error.HTTPError(
            url="https://openrouter.ai",
            code=429,
            msg="Too Many Requests",
            hdrs=None,
            fp=None,
        )

        with (
            patch("web.routes.load_settings", return_value=settings),
            patch("web.routes.get_groq_key", return_value="test-groq-key"),
            patch("web.routes.get_openrouter_key", return_value="test-openrouter-key"),
            patch("web.routes.call_groq", side_effect=groq_limit),
            patch("web.routes.call_openrouter", side_effect=openrouter_limit),
            patch("web.routes.call_gemini") as gemini,
            patch(
                "web.routes.call_antigravity",
                return_value="1) I would stage schema rules in log mode, review false positives, then block stable violations.",
            ) as antigravity,
            patch("web.routes.call_codex_cli") as codex,
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["provider"], "gemini")
        self.assertIn("log mode", data["answer"])
        gemini.assert_not_called()
        antigravity.assert_called_once()
        codex.assert_not_called()

    def test_quick_request_falls_back_to_backup_groq_key_after_primary_rate_limit(self) -> None:
        settings = {
            "ai_provider": "codex",
            "codex_enabled": True,
            "backup_groq_api_key": "backup-groq-key",
        }
        payload = {
            "ai_provider": "codex",
            "mode": "quick",
            "my_language": "ru",
            "their_language": "en",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "How do you decide bug bounty severity?",
                    "translation": "Как определить severity bug bounty?",
                    "at": 1,
                }
            ],
        }
        rate_limit = urllib.error.HTTPError(
            url="https://api.groq.com",
            code=429,
            msg="Too Many Requests",
            hdrs=None,
            fp=None,
        )

        with (
            patch("web.routes.load_settings", return_value=settings),
            patch("web.routes.get_groq_key", return_value="primary-groq-key"),
            patch("web.routes.get_openrouter_key", return_value=""),
            patch(
                "web.routes.call_groq",
                side_effect=[rate_limit, "1) I separate technical impact from urgency, then validate exploitability and affected trust boundaries."],
            ) as groq,
            patch("web.routes.call_openrouter") as openrouter,
            patch("web.routes.call_codex_cli") as codex,
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["provider"], "groq_backup")
        self.assertIn("technical impact", data["answer"])
        self.assertEqual(groq.call_count, 2)
        self.assertEqual(groq.call_args_list[0].args[1], "primary-groq-key")
        self.assertEqual(groq.call_args_list[1].args[1], "backup-groq-key")
        openrouter.assert_not_called()
        codex.assert_not_called()

    def test_quick_request_uses_backup_groq_when_primary_is_cooling_down(self) -> None:
        settings = {
            "ai_provider": "codex",
            "codex_enabled": True,
            "backup_groq_api_key": "backup-groq-key",
        }
        payload = {
            "ai_provider": "codex",
            "mode": "quick",
            "my_language": "ru",
            "their_language": "en",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "What is the risk of weak authorization?",
                    "translation": "Какой риск у слабой авторизации?",
                    "at": 1,
                }
            ],
        }
        _cooldown_provider("groq", settings, 60)

        with (
            patch("web.routes.load_settings", return_value=settings),
            patch("web.routes.get_groq_key", return_value="primary-groq-key"),
            patch("web.routes.get_openrouter_key", return_value=""),
            patch("web.routes.call_groq", return_value="1) Weak authorization is critical when it allows access across tenant, account, or payment boundaries.") as groq,
            patch("web.routes.call_openrouter") as openrouter,
            patch("web.routes.call_codex_cli") as codex,
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["provider"], "groq_backup")
        self.assertIn("Weak authorization", data["answer"])
        groq.assert_called_once()
        self.assertEqual(groq.call_args.args[1], "backup-groq-key")
        openrouter.assert_not_called()
        codex.assert_not_called()

    def test_quick_request_returns_soft_cooldown_when_all_providers_are_cooling_down(self) -> None:
        settings = {"ai_provider": "codex", "codex_enabled": True}
        payload = {
            "ai_provider": "codex",
            "mode": "quick",
            "my_language": "ru",
            "their_language": "en",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "What is WebAuthn action binding?",
                    "translation": "Что такое WebAuthn action binding?",
                    "at": 1,
                }
            ],
        }
        _cooldown_provider("groq", settings, 60)
        _cooldown_provider("openrouter", settings, 60)
        _cooldown_provider("codex", settings, 60)

        with (
            patch("web.routes.load_settings", return_value=settings),
            patch("web.routes.get_groq_key", return_value="test-groq-key"),
            patch("web.routes.get_openrouter_key", return_value="test-openrouter-key"),
            patch("web.routes.call_groq") as groq,
            patch("web.routes.call_openrouter") as openrouter,
            patch("web.routes.call_codex_cli") as codex,
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "cooldown")
        self.assertNotIn("error", data)
        self.assertGreater(data["retry_after"], 0)
        groq.assert_not_called()
        openrouter.assert_not_called()
        codex.assert_not_called()

    def test_rate_limit_plus_provider_cooldowns_uses_openrouter_when_available(self) -> None:
        settings = {"ai_provider": "codex", "codex_enabled": True}
        payload = {
            "ai_provider": "codex",
            "mode": "quick",
            "my_language": "ru",
            "their_language": "en",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "What is a signing origin?",
                    "translation": "Что такое signing origin?",
                    "at": 1,
                }
            ],
        }
        rate_limit = urllib.error.HTTPError(
            url="https://api.groq.com",
            code=429,
            msg="Too Many Requests",
            hdrs=None,
            fp=None,
        )

        with (
            patch("web.routes.load_settings", return_value=settings),
            patch("web.routes.get_groq_key", return_value="test-groq-key"),
            patch("web.routes.get_openrouter_key", return_value="test-openrouter-key"),
            patch("web.routes.call_groq", side_effect=rate_limit) as groq,
            patch("web.routes.call_openrouter", return_value="1) I validate whether the signing origin can be abused across trust boundaries.") as openrouter,
            patch("web.routes.call_codex_cli") as codex,
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["provider"], "openrouter")
        self.assertNotIn("error", data)
        groq.assert_called_once()
        openrouter.assert_called_once()
        codex.assert_not_called()

    def test_rate_limit_plus_all_quick_fallback_cooldowns_returns_soft_cooldown(self) -> None:
        settings = {"ai_provider": "codex", "codex_enabled": True}
        payload = {
            "ai_provider": "codex",
            "mode": "quick",
            "my_language": "ru",
            "their_language": "en",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "What is a signing origin?",
                    "translation": "Что такое signing origin?",
                    "at": 1,
                }
            ],
        }
        rate_limit = urllib.error.HTTPError(
            url="https://api.groq.com",
            code=429,
            msg="Too Many Requests",
            hdrs=None,
            fp=None,
        )
        _cooldown_provider("openrouter", settings, 69)
        _cooldown_provider("codex", settings, 16)

        with (
            patch("web.routes.load_settings", return_value=settings),
            patch("web.routes.get_groq_key", return_value="test-groq-key"),
            patch("web.routes.get_openrouter_key", return_value="test-openrouter-key"),
            patch("web.routes.call_groq", side_effect=rate_limit) as groq,
            patch("web.routes.call_openrouter") as openrouter,
            patch("web.routes.call_codex_cli") as codex,
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "cooldown")
        self.assertNotIn("error", data)
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

    def test_generic_quick_answer_is_rejected_and_falls_back(self) -> None:
        payload = {
            "ai_provider": "codex",
            "mode": "quick",
            "my_language": "ru",
            "their_language": "ru",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "TDX и HSM: как разделить runtime isolation и remote attestation?",
                    "translation": "TDX и HSM: как разделить runtime isolation и remote attestation?",
                    "at": 1,
                }
            ],
        }
        generic_answer = (
            "1) Чтобы обеспечить безопасность системы, необходимо реализовать строгий "
            "контроль доступа, шифрование данных и регулярные аудиты безопасности."
        )

        with (
            patch("web.routes.load_settings", return_value={"ai_provider": "codex", "codex_enabled": True}),
            patch("web.routes.get_groq_key", return_value="test-groq-key"),
            patch("web.routes.get_openrouter_key", return_value=""),
            patch("web.routes.call_groq", return_value=generic_answer) as groq,
            patch(
                "web.routes.call_codex_cli",
                return_value="1) Я бы разделил TDX isolation и remote attestation: runtime ограничивает выполнение, а quote доказывает состояние среды.",
            ) as codex,
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["provider"], "codex")
        self.assertIn("TDX", data["answer"])
        self.assertTrue(any("rejected" in error for error in data["errors"]))
        groq.assert_called_once()
        codex.assert_called_once()

    def test_cloudflare_api_shield_generic_quick_answer_falls_back(self) -> None:
        payload = {
            "ai_provider": "codex",
            "mode": "quick",
            "my_language": "en",
            "their_language": "en",
            "messages": [
                {
                    "direction": "outgoing",
                    "transcript": (
                        "How would you configure Cloudflare API Shield schema validation, "
                        "and what traffic would you put into log mode before blocking?"
                    ),
                    "translation": (
                        "How would you configure Cloudflare API Shield schema validation, "
                        "and what traffic would you put into log mode before blocking?"
                    ),
                    "at": 1,
                }
            ],
        }
        generic_answer = (
            "1) Ensure the API shield is properly validated to prevent potential security breaches."
        )
        specific_answer = (
            "1) I’d import the OpenAPI schema, run candidate endpoints in log mode on real traffic, "
            "fix false positives, then block only stable violations."
        )

        with (
            patch("web.routes.load_settings", return_value={"ai_provider": "codex", "codex_enabled": True}),
            patch("web.routes.get_groq_key", return_value="test-groq-key"),
            patch("web.routes.get_openrouter_key", return_value="test-openrouter-key"),
            patch("web.routes.call_groq", return_value=generic_answer) as groq,
            patch("web.routes.call_openrouter", return_value=specific_answer) as openrouter,
            patch("web.routes.call_codex_cli") as codex,
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["provider"], "openrouter")
        self.assertIn("OpenAPI schema", data["answer"])
        self.assertTrue(any("rejected" in error for error in data["errors"]))
        groq.assert_called_once()
        openrouter.assert_called_once()
        codex.assert_not_called()


if __name__ == "__main__":
    unittest.main()
