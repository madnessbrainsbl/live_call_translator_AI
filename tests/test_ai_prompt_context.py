import unittest

from web.routes import (
    AI_PROMPT_CONTEXT_ELLIPSIS,
    _format_ai_prompt_context,
    _normalize_ai_prompt_context,
)
from web.settings import AI_RESUME_PROMPT_MAX_CHARS


class AiPromptContextTests(unittest.TestCase):
    def test_normalize_ai_prompt_context_prefers_payload_values(self) -> None:
        settings = {
            "ai_resume_prompt": "saved resume",
            "ai_vacancy_prompt": "saved vacancy",
        }

        result = _normalize_ai_prompt_context({"res": "", "vac": "payload vacancy"}, settings)

        self.assertEqual(result, {"res": "", "vac": "payload vacancy"})

    def test_format_ai_prompt_context_uses_res_and_vac_labels(self) -> None:
        result = _format_ai_prompt_context({
            "res": "Python, Flask, Rust",
            "vac": "Backend engineer vacancy",
        })

        self.assertIn("res (Me resume, private assistant context):\nPython, Flask, Rust", result)
        self.assertIn("vac (target vacancy, private assistant context):\nBackend engineer vacancy", result)

    def test_normalize_ai_prompt_context_clips_resume(self) -> None:
        settings = {"ai_resume_prompt": "x" * (AI_RESUME_PROMPT_MAX_CHARS + 8)}

        result = _normalize_ai_prompt_context({}, settings)

        self.assertEqual(len(result["res"]), AI_RESUME_PROMPT_MAX_CHARS)
        self.assertTrue(result["res"].endswith(AI_PROMPT_CONTEXT_ELLIPSIS))


if __name__ == "__main__":
    unittest.main()
