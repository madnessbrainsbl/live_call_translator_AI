from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class SpeakerLabelTests(unittest.TestCase):
    def test_ui_labels_outgoing_and_incoming_as_s1_s2(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn("outgoing: 'S1'", app_js)
        self.assertIn("incoming: 'S2'", app_js)
        self.assertIn("outgoing: 'Mic Out / You'", app_js)
        self.assertIn("incoming: 'Mic In / Them'", app_js)
        self.assertIn("speaker + ' (' + myL + '", app_js)

    def test_sse_parser_accepts_speaker_prefixed_engine_logs(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn(r"\[(?:S[12]\s+)?(outgoing|incoming)\]", app_js)

    def test_engine_logs_speaker_ids(self) -> None:
        audio_engine = (PROJECT_ROOT / "lib/translator/audio_engine.ex").read_text(
            encoding="utf-8"
        )

        self.assertIn('"🎤 [#{speaker_label(direction)} #{direction}] #{text}"', audio_engine)
        self.assertIn('"🌐 [#{speaker_label(direction)} #{direction}] #{text}"', audio_engine)
        self.assertIn('defp speaker_label("outgoing"), do: "S1"', audio_engine)
        self.assertIn('defp speaker_label("incoming"), do: "S2"', audio_engine)


if __name__ == "__main__":
    unittest.main()
