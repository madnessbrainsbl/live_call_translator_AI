import json
import unittest
from unittest.mock import patch

from web.helpers import call_antigravity


class _FakeResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _traceback):
        return False

    def read(self) -> bytes:
        return json.dumps(self._payload).encode()


class AntigravityHelperTests(unittest.TestCase):
    def test_call_antigravity_uses_local_openai_compatible_chat_payload(self) -> None:
        captured = {}

        def fake_urlopen(request, timeout):
            captured["url"] = request.full_url
            captured["headers"] = dict(request.header_items())
            captured["timeout"] = timeout
            captured["body"] = json.loads(request.data.decode())
            return _FakeResponse(
                {
                    "choices": [
                        {
                            "message": {
                                "content": "1) Validate the schema in log mode before blocking."
                            }
                        }
                    ]
                }
            )

        with patch("urllib.request.urlopen", side_effect=fake_urlopen):
            answer = call_antigravity(
                [{"role": "user", "content": "How do you configure API Shield?"}],
                "sk-antigravity-key",
                temperature=0.2,
                max_tokens=64,
                timeout=7,
                model="gemini-3.5-flash",
                chat_url="http://127.0.0.1:8045/v1/chat/completions",
            )

        self.assertEqual(answer, "1) Validate the schema in log mode before blocking.")
        self.assertEqual(captured["url"], "http://127.0.0.1:8045/v1/chat/completions")
        self.assertEqual(captured["headers"]["Authorization"], "Bearer sk-antigravity-key")
        self.assertEqual(captured["timeout"], 7)
        self.assertEqual(captured["body"]["model"], "gemini-3.5-flash")
        self.assertEqual(captured["body"]["max_tokens"], 64)

    def test_call_antigravity_rejects_non_local_urls(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "must point to localhost"):
            call_antigravity(
                [{"role": "user", "content": "hi"}],
                "sk-antigravity-key",
                chat_url="https://example.com/v1/chat/completions",
            )


if __name__ == "__main__":
    unittest.main()
