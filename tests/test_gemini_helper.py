import json
import unittest
from unittest.mock import patch

from web.helpers import call_gemini


class _FakeResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _traceback):
        return False

    def read(self) -> bytes:
        return json.dumps(self._payload).encode()


class GeminiHelperTests(unittest.TestCase):
    def test_call_gemini_uses_generate_content_payload_and_extracts_text(self) -> None:
        captured = {}

        def fake_urlopen(request, timeout):
            captured["url"] = request.full_url
            captured["timeout"] = timeout
            captured["body"] = json.loads(request.data.decode())
            return _FakeResponse(
                {
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {"text": "1) Check universal link ownership and backend token binding."}
                                ]
                            }
                        }
                    ]
                }
            )

        with patch("urllib.request.urlopen", side_effect=fake_urlopen):
            answer = call_gemini(
                [
                    {"role": "system", "content": "Return one interview answer."},
                    {"role": "user", "content": "How do you test universal links?"},
                ],
                "test-key",
                temperature=0.2,
                max_tokens=64,
                timeout=7,
                model="models/gemini-3.5-flash",
            )

        self.assertEqual(answer, "1) Check universal link ownership and backend token binding.")
        self.assertIn("models/gemini-3.5-flash:generateContent", captured["url"])
        self.assertIn("key=test-key", captured["url"])
        self.assertEqual(captured["timeout"], 7)
        self.assertEqual(
            captured["body"]["systemInstruction"]["parts"][0]["text"],
            "Return one interview answer.",
        )
        self.assertEqual(captured["body"]["contents"][0]["role"], "user")
        self.assertEqual(captured["body"]["generationConfig"]["maxOutputTokens"], 64)

    def test_call_gemini_raises_clear_error_on_blocked_prompt(self) -> None:
        with patch(
            "urllib.request.urlopen",
            return_value=_FakeResponse({"promptFeedback": {"blockReason": "SAFETY"}}),
        ):
            with self.assertRaisesRegex(RuntimeError, "Gemini blocked response: SAFETY"):
                call_gemini(
                    [{"role": "user", "content": "hi"}],
                    "test-key",
                    model="gemini-3.5-flash",
                )


if __name__ == "__main__":
    unittest.main()
