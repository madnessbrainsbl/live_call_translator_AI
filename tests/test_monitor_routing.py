from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class MonitorRoutingTests(unittest.TestCase):
    def test_web_ui_never_routes_missing_microphone_to_outgoing_loopback(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn("return canCaptureIncoming ? 'start_incoming' : '';", app_js)
        self.assertIn("function defaultMonitorCaptureDirection() {\n  return 'incoming';\n}", app_js)
        self.assertNotIn("canCaptureOutgoingViaLoopback", app_js)

    def test_monitor_does_not_suppress_microphone_pipeline(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertNotIn(
            "if (monitorEnabled && !tabCaptureActive) {\n    return getMonitorEngineStartCommand();\n  }",
            app_js,
        )
        self.assertIn(
            "const canCaptureMonitorIncoming = monitorEnabled && isUsableLoopbackDevice(SYSTEM_LOOPBACK_DEVICE);",
            app_js,
        )
        self.assertIn("monitorStartCommandOverride = engineStartCmd;", app_js)
        self.assertIn("if (startCmd === 'start_incoming' || startCmd === 'start')", app_js)

    def test_monitor_button_tracks_capture_state_not_rust_playback_flag(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn("function updateMonitorButton()", app_js)
        self.assertIn("const nativeCaptureActive = isNativeMonitorCaptureActive();", app_js)
        self.assertIn("const active = monitorEnabled || tabCaptureStarting || captureActive;", app_js)
        self.assertIn("function isNativeMonitorCaptureActive()", app_js)
        self.assertIn("setMonitorEnabled(false);", app_js)
        self.assertIn("setTabCaptureActive(true);", app_js)
        self.assertIn("setTabCaptureStarting(false);", app_js)

    def test_monitor_audio_routing_keeps_browser_capture_separate(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn(
            "const browserPlaybackActive = monitorEnabled && !textOnlyMode && !transcriptOnlyMode && !tabCaptureActive;",
            app_js,
        )
        self.assertIn("if (browserMonitorPlaybackSynced === browserPlaybackActive) return;", app_js)
        self.assertIn("browserMonitorPlaybackSynced = browserPlaybackActive;", app_js)
        self.assertIn("browserMonitorPlaybackSynced = null;", app_js)

    def test_legacy_monitor_command_routes_to_incoming_loopback(self) -> None:
        command_server = (PROJECT_ROOT / "lib/translator/command_server.ex").read_text(
            encoding="utf-8"
        )

        self.assertIn('Translator.AudioEngine.start_pipelines(["incoming"]', command_server)
        self.assertIn('"meet_input_device" => "__system_output_loopback__"', command_server)
        self.assertNotIn('"mic_device" => "__system_output_loopback__"', command_server)

    def test_audio_engine_rejects_outgoing_without_microphone(self) -> None:
        engine_rs = (PROJECT_ROOT / "native/audio_engine/src/engine.rs").read_text(
            encoding="utf-8"
        )

        self.assertIn(
            'bail!("No microphone input. Turn on Monitor or connect a microphone.");',
            engine_rs,
        )
        self.assertNotIn("using system output loopback for outgoing capture", engine_rs)


if __name__ == "__main__":
    unittest.main()
