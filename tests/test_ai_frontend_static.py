from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class AiFrontendStaticTests(unittest.TestCase):
    def test_suggestions_use_sequence_guard_and_fetch_timeouts(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn("const AI_SUGGESTION_DEBOUNCE_MS = 900", app_js)
        self.assertIn("let aiSuggestionRequestSeq = 0;", app_js)
        self.assertIn("async function fetchJsonWithTimeout(url, options, timeoutMs)", app_js)
        self.assertIn("function isCurrentSuggestionRequest(requestSeq)", app_js)
        self.assertIn("const requestSeq = ++aiSuggestionRequestSeq;", app_js)
        self.assertIn("if (!isCurrentSuggestionRequest(requestSeq)) return;", app_js)
        self.assertIn("AI_DETAIL_REQUEST_TIMEOUT_MS", app_js)
        self.assertIn("AI_SUGGESTION_RETRY_DELAY_MS", app_js)
        self.assertIn("const AI_QUICK_PROVIDER = 'groq';", app_js)
        self.assertIn("const AI_DETAIL_PROVIDER = 'codex';", app_js)
        self.assertIn("mode: 'quick', ai_provider: AI_QUICK_PROVIDER", app_js)
        self.assertIn("mode: 'detail',", app_js)
        self.assertIn("ai_provider: AI_DETAIL_PROVIDER,", app_js)
        self.assertIn("const AI_REQUEST_TIMEOUT_MESSAGE = 'AI request timed out'", app_js)
        self.assertIn("function isAiCooldownResponse(data)", app_js)
        self.assertIn("function isAiTransientError(error)", app_js)
        self.assertIn("function discardActiveAssistantCard()", app_js)
        self.assertIn("if (isAiCooldownResponse(quickData))", app_js)
        self.assertIn("if (isAiCooldownResponse(detailData))", app_js)
        self.assertIn("function renderAiOnlyStatus(data, fallback)", app_js)
        self.assertIn("quickAnswer = aiStatusAnswer(quickData, AI_ONLY_EMPTY_STATUS);", app_js)
        self.assertIn("quick_answer: quickProvider ? quickAnswer : ''", app_js)
        self.assertIn("renderAssistantAnswer(quickAnswer, quickProvider, quickData.status || AI_COOLDOWN_STATUS);", app_js)
        self.assertIn("function latestReusableAssistantStatusCard()", app_js)
        self.assertIn("activeAssistantEntry = latestReusableAssistantStatusCard() || createAssistantCard(state);", app_js)
        self.assertIn("scheduleAiCooldownRetry(quickData);", app_js)
        self.assertIn("return;", app_js)

    def test_ai_toggle_off_preserves_completed_answer_cards(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")
        match = re.search(
            r"function closeSuggestions\(\) \{(?P<body>.*?)\n\}",
            app_js,
            re.S,
        )

        self.assertIsNotNone(match)
        body = match.group("body")
        self.assertIn("discardActiveAssistantCard();", body)
        self.assertNotIn("querySelectorAll('.assistant-msg')", body)
        self.assertIn("const AI_VISIBLE_CARD_MAX = 80;", app_js)
        self.assertIn("while (cards.length > AI_VISIBLE_CARD_MAX)", app_js)
        self.assertIn("const AI_CALL_HISTORY_MAX = 80;", app_js)

    def test_ai_only_shows_status_instead_of_blank_when_ai_unavailable(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn("const AI_ONLY_EMPTY_STATUS", app_js)
        self.assertIn("function aiStatusAnswer(data, fallback)", app_js)
        self.assertIn("function renderAiOnlyStatus(data, fallback)", app_js)
        self.assertIn("renderAssistantAnswer(aiStatusAnswer(data, fallback)", app_js)
        self.assertIn("renderAiOnlyStatus({ status: AI_COOLDOWN_STATUS }, e.message || AI_REQUEST_TIMEOUT_MESSAGE);", app_js)
        self.assertIn("if (transcriptHiddenMode && aiSuggestionsOpen && allMessages.length)", app_js)
        self.assertIn("void fetchAiSuggestions(true);", app_js)
        self.assertIn("function scheduleAiCooldownRetry(data)", app_js)
        self.assertIn("scheduleAiCooldownRetry(quickData);", app_js)
        self.assertIn("Math.min(retrySeconds + 1, 60) * 1000", app_js)
        self.assertNotIn("Transcript is hidden, capture continues.", app_js)

    def test_backup_groq_key_is_wired_to_settings_form(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")
        index_html = (PROJECT_ROOT / "web/templates/index.html").read_text(encoding="utf-8")

        self.assertIn('id="cfg-groq-backup"', index_html)
        self.assertIn("onclick=\"testKey('groq_backup')\"", index_html)
        self.assertIn("const grBackup = document.getElementById('cfg-groq-backup');", app_js)
        self.assertIn("backup_groq_api_key: (document.getElementById('cfg-groq-backup')._getRealValue", app_js)
        self.assertIn("groq_backup: 'cfg-groq-backup'", app_js)
        self.assertIn("groq_backup: 'test-groq-backup'", app_js)
        self.assertIn("if (normalized === 'groq_backup') return 'Groq backup';", app_js)

    def test_gemini_fallback_is_wired_to_settings_form(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")
        index_html = (PROJECT_ROOT / "web/templates/index.html").read_text(encoding="utf-8")
        tooltips_js = (PROJECT_ROOT / "web/static/js/tooltips.js").read_text(encoding="utf-8")

        self.assertIn('id="cfg-gemini"', index_html)
        self.assertIn('id="cfg-gemini-model"', index_html)
        self.assertIn('id="cfg-antigravity-url"', index_html)
        self.assertIn("onclick=\"testKey('gemini')\"", index_html)
        self.assertIn("const gemini = document.getElementById('cfg-gemini');", app_js)
        self.assertIn("gemini_api_key: (document.getElementById('cfg-gemini')._getRealValue", app_js)
        self.assertIn("gemini_model: (document.getElementById('cfg-gemini-model')?.value || 'gemini-3.5-flash').trim()", app_js)
        self.assertIn("antigravity_chat_url: (document.getElementById('cfg-antigravity-url')?.value", app_js)
        self.assertIn("gemini: 'cfg-gemini'", app_js)
        self.assertIn("gemini: 'test-gemini'", app_js)
        self.assertIn("if (normalized === 'gemini') return 'Gemini';", app_js)
        self.assertIn("t('test-gemini', 'test-key');", tooltips_js)

    def test_ai_answer_language_setting_is_wired_to_form_and_requests(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")
        index_html = (PROJECT_ROOT / "web/templates/index.html").read_text(encoding="utf-8")
        tooltips_js = (PROJECT_ROOT / "web/static/js/tooltips.js").read_text(encoding="utf-8")

        self.assertIn('id="cfg-ai-answer-language"', index_html)
        self.assertIn('<option value="their">Their language</option>', index_html)
        self.assertIn('<option value="my">My language</option>', index_html)
        self.assertIn('<option value="auto">Auto</option>', index_html)
        self.assertIn("ai_answer_language: currentSettings.ai_answer_language || 'their'", app_js)
        self.assertIn("settings.ai_answer_language || 'their'", app_js)
        self.assertIn("s.ai_answer_language || 'their'", app_js)
        self.assertIn("ai_answer_language: document.getElementById('cfg-ai-answer-language')?.value || 'their'", app_js)
        self.assertIn("'ai-answer-language': 'Language used by AI Assistant replies'", tooltips_js)
        self.assertIn("t('cfg-ai-answer-language', 'ai-answer-language');", tooltips_js)

    def test_start_button_does_not_open_browser_screen_share_picker(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertNotIn("shouldOfferSystemAudioCapture", app_js)
        self.assertIn("showToast(tabCaptureActive ? 'Monitor is already capturing browser sound' : getEngineStartBlockedMessage());", app_js)
        self.assertIn("const started = await startTabCapture(defaultMonitorCaptureDirection());", app_js)


if __name__ == "__main__":
    unittest.main()
