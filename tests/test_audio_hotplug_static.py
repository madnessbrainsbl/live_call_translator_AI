from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class AudioHotplugStaticTests(unittest.TestCase):
    def test_frontend_watches_devices_and_recovers_loopback_route(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn("const AUDIO_DEVICE_WATCH_INTERVAL_MS = 30000", app_js)
        self.assertIn("function startAudioDeviceWatcher()", app_js)
        self.assertIn("navigator.mediaDevices.addEventListener('devicechange'", app_js)
        self.assertIn("async function checkAudioDeviceHotplug(reason = 'poll')", app_js)
        self.assertIn("if (reason === 'poll' && !engineRunning && !tabCaptureActive) return;", app_js)
        self.assertIn("async function recoverAudioRouteAfterHotplug(reason)", app_js)
        self.assertIn("await restartPipelinesForCurrentSettings(startCmd);", app_js)
        self.assertIn("Audio output device lost. Connect headphones/speakers or use Monitor.", app_js)
        self.assertIn("Audio device lost", app_js)

    def test_native_surfaces_audio_device_loss_event(self) -> None:
        protocol_rs = (PROJECT_ROOT / "native/audio_engine/src/protocol.rs").read_text(
            encoding="utf-8"
        )
        engine_rs = (PROJECT_ROOT / "native/audio_engine/src/engine.rs").read_text(
            encoding="utf-8"
        )
        audio_engine_ex = (PROJECT_ROOT / "lib/translator/audio_engine.ex").read_text(
            encoding="utf-8"
        )

        self.assertIn("AudioDeviceLost", protocol_rs)
        self.assertIn("Event::AudioDeviceLost", engine_rs)
        self.assertIn('"event" => "audio_device_lost"', audio_engine_ex)
        self.assertIn("⚠ Audio device lost", audio_engine_ex)

    def test_elixir_deduplicates_unchanged_device_list_logs(self) -> None:
        audio_engine_ex = (PROJECT_ROOT / "lib/translator/audio_engine.ex").read_text(
            encoding="utf-8"
        )

        self.assertIn('next_devices = %{"input" => input, "output" => output}', audio_engine_ex)
        self.assertIn("if next_devices != state.devices do", audio_engine_ex)
        self.assertNotIn("Received unchanged device list", audio_engine_ex)
        self.assertIn("%{state | devices: next_devices}", audio_engine_ex)


if __name__ == "__main__":
    unittest.main()
