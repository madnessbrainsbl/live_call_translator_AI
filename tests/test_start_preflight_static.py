from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class StartPreflightStaticTests(unittest.TestCase):
    def test_start_preflight_does_not_block_on_provider_network_tests(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")
        match = re.search(
            r"async function preflightStartChecks\(\) \{(?P<body>.*?)\n\}",
            app_js,
            re.S,
        )

        self.assertIsNotNone(match)
        body = match.group("body")
        self.assertIn("cfg-deepgram", body)
        self.assertIn("Set Deepgram API key first", body)
        self.assertNotIn("checkProviderKey", body)
        self.assertNotIn("cfg-groq", body)
        self.assertNotIn("Set Groq API key first", body)

    def test_start_button_shows_starting_before_async_preparation(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        start_text_index = app_js.index("text.textContent = 'Starting...';")
        monitor_prepare_index = app_js.index("await prepareMonitorEngineStart(startCmd);")
        self.assertLess(start_text_index, monitor_prepare_index)

    def test_start_button_cannot_immediately_stop_starting_engine(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn("const ENGINE_STOP_GRACE_MS = 8000", app_js)
        self.assertIn("let engineStartedAt = 0;", app_js)
        self.assertIn("if (btn) btn.disabled = true;", app_js)
        self.assertIn("if (Date.now() - engineStartedAt < ENGINE_STOP_GRACE_MS)", app_js)
        self.assertIn("Engine is starting. Wait a few seconds before stopping.", app_js)
        self.assertIn("engineStartedAt = Date.now();", app_js)
        self.assertIn("if (btn) btn.disabled = false;", app_js)

    def test_index_cache_busts_app_js_after_start_fix(self) -> None:
        index_html = (PROJECT_ROOT / "web/templates/index.html").read_text(encoding="utf-8")

        self.assertIn("filename='js/app.js', v='20260611-7'", index_html)
        self.assertNotIn("filename='js/app.js', v='20260510-2'", index_html)


if __name__ == "__main__":
    unittest.main()
