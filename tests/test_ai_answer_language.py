import unittest
from unittest.mock import patch

from web import app
from web.routes import (
    AI_ANSWER_LANGUAGE_AUTO,
    AI_ANSWER_LANGUAGE_MY,
    AI_ANSWER_LANGUAGE_THEIR,
    _add_focus_candidate,
    _answer_language_code,
    _normalize_ai_transcript_terms,
    _should_reject_ai_answer,
)


class AiAnswerLanguageTests(unittest.TestCase):
    def test_auto_answer_language_uses_focused_text_language(self) -> None:
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
        self.assertEqual(_answer_language_code(candidates[0], "ru", "ru", "en"), "en")

    def test_auto_answer_language_uses_cyrillic_text_even_when_candidate_lang_is_english(self) -> None:
        candidates = []

        _add_focus_candidate(
            candidates,
            "Что такое ска?",
            "en",
            "ru",
            "Me",
            "outgoing",
            "ru",
        )

        self.assertEqual(candidates[0]["lang"], "en")
        self.assertEqual(candidates[0]["speaker_lang"], "ru")
        self.assertEqual(_answer_language_code(candidates[0], "ru", "ru", "en"), "ru")

    def test_answer_language_falls_back_to_latest_speaker_language(self) -> None:
        self.assertEqual(_answer_language_code(None, "ru", "en", "en"), "ru")

    def test_answer_language_setting_can_force_their_language(self) -> None:
        self.assertEqual(
            _answer_language_code(
                None,
                "ru",
                "ru",
                "ru",
                AI_ANSWER_LANGUAGE_THEIR,
                "ru",
                "en",
            ),
            "en",
        )

    def test_answer_language_setting_can_force_my_language(self) -> None:
        self.assertEqual(
            _answer_language_code(
                None,
                "en",
                "en",
                "ru",
                AI_ANSWER_LANGUAGE_MY,
                "ru",
                "en",
            ),
            "ru",
        )

    def test_answer_language_auto_uses_latest_speaker_language(self) -> None:
        self.assertEqual(
            _answer_language_code(
                None,
                "en",
                "en",
                "ru",
                AI_ANSWER_LANGUAGE_AUTO,
                "ru",
                "en",
            ),
            "en",
        )

    def test_suggestions_prompt_uses_configured_their_language_by_default(self) -> None:
        captured = {}

        def fake_groq(messages, *_args, **_kwargs):
            captured["system"] = messages[0]["content"]
            captured["user"] = messages[1]["content"]
            return "1) The main function of antivirus is to detect and block malware."

        payload = {
            "ai_provider": "groq",
            "mode": "quick",
            "my_language": "ru",
            "their_language": "en",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "So, what's the main function of an antivirus, anyway?",
                    "translation": "Что, главная функция антивируса в чём?",
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
        self.assertIn("Answer language: English", captured["system"])
        self.assertIn("Private answer language for Me: English", captured["user"])

    def test_suggestions_prompt_can_use_auto_speaker_language(self) -> None:
        captured = {}

        def fake_groq(messages, *_args, **_kwargs):
            captured["system"] = messages[0]["content"]
            captured["user"] = messages[1]["content"]
            return "1) Основная функция антивируса - находить и блокировать вредоносное ПО."

        payload = {
            "ai_provider": "groq",
            "mode": "quick",
            "ai_answer_language": "auto",
            "my_language": "ru",
            "their_language": "en",
            "messages": [
                {
                    "direction": "outgoing",
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

    def test_suggestions_prompt_auto_switches_to_english_for_english_outgoing_text(self) -> None:
        captured = {}

        def fake_groq(messages, *_args, **_kwargs):
            captured["system"] = messages[0]["content"]
            captured["user"] = messages[1]["content"]
            return "1) I would clarify the question and answer in English."

        payload = {
            "ai_provider": "groq",
            "mode": "quick",
            "ai_answer_language": "auto",
            "my_language": "ru",
            "their_language": "en",
            "messages": [
                {
                    "direction": "outgoing",
                    "transcript": "What is SCA?",
                    "translation": "What is SCA?",
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
        self.assertIn("Answer language: English", captured["system"])
        self.assertIn("Private answer language for Me: English", captured["user"])

    def test_suggestions_prompt_rejects_ungrounded_live_essays(self) -> None:
        captured = {}

        def fake_groq(messages, *_args, **_kwargs):
            captured["system"] = messages[0]["content"]
            return "1) Я бы разделил текущий deliverable и отдельный discovery-трек."

        payload = {
            "ai_provider": "groq",
            "mode": "quick",
            "my_language": "ru",
            "their_language": "ru",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "TDX сейчас первый шаг, а CryptoPro отдельно?",
                    "translation": "TDX сейчас первый шаг, а CryptoPro отдельно?",
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
        self.assertIn("Do not invent implementation details", captured["system"])
        self.assertIn("If a point is uncertain", captured["system"])
        self.assertIn("Prefer a reply Me can say aloud immediately; no essays.", captured["system"])
        self.assertIn("no more than 55 words", captured["system"])
        self.assertIn("1-2 short sentences", captured["system"])
        self.assertIn("Make it specific to the current topic, not a reusable process template", captured["system"])
        self.assertIn("Name at least two concrete checks, artifacts, or decision criteria", captured["system"])
        self.assertIn("For API Shield, WAF, schema validation, log mode, or block mode questions", captured["system"])
        self.assertIn("Never answer with only 'review the current flow'", captured["system"])

    def test_generic_quick_auth_flow_answer_is_rejected(self) -> None:
        answer = (
            "1) Review the current authentication flow to identify potential vulnerabilities "
            "and ensure it aligns with the recommended measures outlined in the provided text."
        )

        self.assertTrue(
            _should_reject_ai_answer(
                answer,
                "quick",
                "How do you test deep links and universal links for account takeover risks?",
            )
        )

    def test_russian_appsec_acronym_questions_are_normalized(self) -> None:
        self.assertEqual(
            _normalize_ai_transcript_terms("Привет, что такое даст?"),
            "Привет, что такое DAST?",
        )
        self.assertEqual(
            _normalize_ai_transcript_terms("Объясни саст и ска."),
            "Объясни SAST и ска.",
        )
        self.assertEqual(
            _normalize_ai_transcript_terms("Расскажи про ска."),
            "Расскажи про SCA.",
        )
        self.assertEqual(
            _normalize_ai_transcript_terms("Что это даст?"),
            "Что это даст?",
        )
        self.assertEqual(
            _normalize_ai_transcript_terms("Расскажи, кто такие танджи?"),
            "Расскажи, кто такие Tangem?",
        )

    def test_wrong_dast_data_quick_answer_is_rejected(self) -> None:
        self.assertTrue(
            _should_reject_ai_answer(
                '1) Даст, вероятно, означает "data" или "данные".',
                "quick",
                "Привет, что такое DAST?",
            )
        )
        self.assertFalse(
            _should_reject_ai_answer(
                "1) DAST — это Dynamic Application Security Testing запущенного приложения.",
                "quick",
                "Привет, что такое DAST?",
            )
        )

    def test_generic_company_pitch_quick_answer_is_rejected(self) -> None:
        self.assertTrue(
            _should_reject_ai_answer(
                "1) Я могу рассказать о своем опыте как Application Security Engineer "
                "и как я могу применить свои навыки для обеспечения безопасности продуктов Tangem.",
                "quick",
                "Расскажи, кто такие Tangem и какая картинка сложилась.",
            )
        )
        self.assertTrue(
            _should_reject_ai_answer(
                "1) Я знаком с Tangem, но хотел бы узнать больше о вашем опыте "
                "и о том, как я могу внести свой вклад.",
                "quick",
                "Расскажи, кто такие Tangem и какая картинка сложилась.",
            )
        )
        self.assertFalse(
            _should_reject_ai_answer(
                "1) Я понял Tangem как crypto-wallet продукт: холодный кошелек, "
                "добавленный hot wallet и fintech/DeFi сервисы вокруг управления активами.",
                "quick",
                "Расскажи, кто такие Tangem и какая картинка сложилась.",
            )
        )

    def test_tangem_company_pitch_falls_back_to_specific_provider(self) -> None:
        def fake_groq(_messages, *_args, **_kwargs):
            return (
                "1) Я могу рассказать о своем опыте как Application Security Engineer "
                "и как я могу применить свои навыки для обеспечения безопасности продуктов Tangem."
            )

        def fake_openrouter(_messages, *_args, **_kwargs):
            return (
                "1) Я понял Tangem как crypto-wallet продукт: холодный кошелек, "
                "hot wallet и fintech/DeFi сервисы, где AppSec нужен прямо в release cycle."
            )

        payload = {
            "ai_provider": "auto",
            "mode": "quick",
            "my_language": "ru",
            "their_language": "ru",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "Расскажи, кто такие танджи и какая картинка сложилась.",
                    "translation": "Расскажи, кто такие танджи и какая картинка сложилась.",
                    "at": 1,
                }
            ],
        }

        with (
            patch("web.routes.load_settings", return_value={"ai_provider": "auto", "codex_enabled": True}),
            patch("web.routes.get_groq_key", return_value="test-groq-key"),
            patch("web.routes.get_openrouter_key", return_value="test-openrouter-key"),
            patch("web.routes.call_groq", side_effect=fake_groq),
            patch("web.routes.call_openrouter", side_effect=fake_openrouter),
            patch("web.routes._provider_cooldown_remaining", return_value=0),
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["provider"], "openrouter")
        self.assertIn("crypto-wallet", data["answer"])
        self.assertTrue(any("rejected" in error for error in data["errors"]))

    def test_bad_dast_quick_answer_falls_back_to_next_provider(self) -> None:
        captured = {}

        def fake_groq(_messages, *_args, **_kwargs):
            return '1) Даст, вероятно, означает "data" или "данные".'

        def fake_openrouter(messages, *_args, **_kwargs):
            captured["user"] = messages[1]["content"]
            return (
                "1) DAST — это Dynamic Application Security Testing: проверка "
                "запущенного веб-приложения или API реальными HTTP-запросами."
            )

        payload = {
            "ai_provider": "auto",
            "mode": "quick",
            "my_language": "ru",
            "their_language": "ru",
            "messages": [
                {
                    "direction": "outgoing",
                    "transcript": "Привет, что такое даст?",
                    "translation": "Привет, что такое даст?",
                    "at": 1,
                }
            ],
        }

        with (
            patch("web.routes.get_groq_key", return_value="test-groq-key"),
            patch("web.routes.get_openrouter_key", return_value="test-openrouter-key"),
            patch("web.routes.call_groq", side_effect=fake_groq),
            patch("web.routes.call_openrouter", side_effect=fake_openrouter),
            patch("web.routes._provider_cooldown_remaining", return_value=0),
            patch("web.routes.load_settings", return_value={"ai_provider": "auto"}),
        ):
            response = app.test_client().post("/api/suggestions", json=payload)

        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["provider"], "openrouter")
        self.assertIn("DAST", data["answer"])
        self.assertIn("groq rejected: generic or ungrounded answer", data["errors"])
        self.assertIn("Привет, что такое DAST?", captured["user"])

    def test_noisy_transcript_is_normalized_before_ai_prompt(self) -> None:
        captured = {}

        def fake_groq(messages, *_args, **_kwargs):
            captured["user"] = messages[1]["content"]
            return (
                "1) I test deep links and universal links by checking scheme hijack, "
                "token replay, and server-side binding to the intended session."
            )

        payload = {
            "ai_provider": "groq",
            "mode": "quick",
            "my_language": "en",
            "their_language": "en",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "How do you taste my mobile IP traffic for after two authorization and for And follow flows.",
                    "translation": "How do you taste my mobile IP traffic for after two authorization and for And follow flows.",
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
        self.assertIn(
            "How do you test deep links and universal links for account takeover risks",
            captured["user"],
        )
        self.assertNotIn("taste my mobile IP traffic", captured["user"])

    def test_detail_prompt_must_not_repeat_quick_answer(self) -> None:
        captured = {}

        def fake_groq(messages, *_args, **_kwargs):
            captured["system"] = messages[0]["content"]
            captured["user"] = messages[1]["content"]
            return "2) Уточнил бы только владельца задачи и критерий проверки фикса."

        payload = {
            "ai_provider": "groq",
            "mode": "detail",
            "quick_answer": "1) Да, давайте сверим по задаче, что конкретно закрыто и чем это проверено.",
            "my_language": "ru",
            "their_language": "ru",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "Давайте посмотрим эти пять задач и поймём, что реально закрыто.",
                    "translation": "Давайте посмотрим эти пять задач и поймём, что реально закрыто.",
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
        self.assertIn("Do not restate, paraphrase, or expand option 1", captured["system"])
        self.assertIn("Answer the topic fully enough for a broad interview question", captured["system"])
        self.assertIn("Do not use a fixed word limit", captured["system"])
        self.assertNotIn("no more than 120 words", captured["system"])
        self.assertIn("Do not repeat or paraphrase the quick option", captured["user"])
        self.assertIn("Answer fully enough for a broad interview question", captured["user"])
        self.assertIn("Do not use a fixed word limit", captured["user"])


if __name__ == "__main__":
    unittest.main()
