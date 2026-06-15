from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class TranscriptOnlyModeTests(unittest.TestCase):
    def test_toolbar_has_translation_toggle(self) -> None:
        index_html = (PROJECT_ROOT / "web/templates/index.html").read_text(encoding="utf-8")

        self.assertIn('id="btn-transcript-only"', index_html)
        self.assertIn("toggleTranscriptOnly()", index_html)
        self.assertRegex(index_html, r'id="btn-transcript-only"[\s\S]*>\s*T\s*</button>')

    def test_web_ui_displays_transcript_without_translation(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn("let transcriptOnlyMode = false;", app_js)
        self.assertIn("translation_enabled: !transcriptOnlyMode", app_js)
        self.assertIn("const enablingTranslation = !transcriptOnlyMode;", app_js)
        self.assertIn("await persistTranscriptOnlyMode();", app_js)
        self.assertIn("await restartPipelinesForCurrentSettings(startCmd);", app_js)
        self.assertIn("saveSettingsPayload(settings)", app_js)
        self.assertIn("const TRANSLATION_OFF_HINT = 'Translation OFF: original speech only';", app_js)
        self.assertIn("btn.classList.toggle('translation-off', transcriptOnlyMode);", app_js)
        self.assertIn("pending.translation = pending.transcript;", app_js)
        self.assertIn("(pending.transcript || pending.translation || '')", app_js)
        self.assertIn("const SAME_LANGUAGE_TRANSLATION_HINT", app_js)
        self.assertIn("function isSameLanguageTranslationPair()", app_js)
        self.assertIn("showToast(SAME_LANGUAGE_TRANSLATION_HINT);", app_js)
        self.assertIn("if (!transcriptOnlyMode && isSameLanguageTranslationPair())", app_js)
        self.assertIn("function applySavedSettings(settings)", app_js)
        self.assertIn("const savedSettings = data.settings || settings;", app_js)

    def test_save_restart_resumes_active_pipelines(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn("const shouldResumePipelines = backendState === 'running' || backendState === 'starting';", app_js)
        self.assertIn("restartStartCmd = shouldResumePipelines ? getEngineStartCommand() : '';", app_js)
        self.assertIn("await startPipelinesForCurrentSettings(restartStartCmd);", app_js)
        self.assertIn("'Engine restarted and capture resumed'", app_js)

    def test_engine_can_disable_translation_without_groq(self) -> None:
        engine_rs = (PROJECT_ROOT / "native/audio_engine/src/engine.rs").read_text(
            encoding="utf-8"
        )
        translation_rs = (
            PROJECT_ROOT / "native/audio_engine/src/translation/mod.rs"
        ).read_text(encoding="utf-8")
        command_server = (PROJECT_ROOT / "lib/translator/command_server.ex").read_text(
            encoding="utf-8"
        )

        self.assertIn('const CONFIG_TRANSLATION_ENABLED: &str = "translation_enabled";', engine_rs)
        self.assertIn("TranslationEngine::disabled()", engine_rs)
        self.assertIn("translation_is_disabled || same_language", engine_rs)
        self.assertIn("CONFIG_MY_LANGUAGE =>", engine_rs)
        self.assertIn("CONFIG_THEIR_LANGUAGE =>", engine_rs)
        self.assertIn("CONFIG_TRANSCRIPT_ONLY_MODE =>", engine_rs)
        self.assertIn("pub fn disabled() -> Self", translation_rs)
        self.assertIn('defp handle_command("translation_off")', command_server)
        self.assertIn('defp handle_command("translation_on")', command_server)


if __name__ == "__main__":
    unittest.main()
