import unittest
from unittest.mock import patch

from web import app
from web.routes import _interview_guidance_for


INTERVIEW_QUESTIONS = """
How do you approach a security assessment of a new web application from scratch?
How do you test REST APIs for authentication and authorization vulnerabilities?
How would you test for Broken Object Level Authorization in an API?
How would you test for Broken Function Level Authorization?
What is the difference between BOLA and BFLA?
How do you test horizontal privilege escalation between two regular users?
How do you test vertical privilege escalation between a regular user and an admin?
How would you test whether UUID-based object references are still vulnerable to IDOR?
How do you find hidden or undocumented API endpoints?
How would you compare API behavior between mobile app traffic and web app traffic?
How do you test old API versions that are still exposed in production?
How do you test whether an API leaks sensitive fields in JSON responses?
How would you detect excessive data exposure in an API?
How do you test for mass assignment in JSON request bodies?
How would you test if a user can modify server-side fields like role, is_admin, status, or owner_id?
How do you test pagination, sorting, and filtering parameters for data leakage?
How do you test API rate limits properly?
How would you test for unrestricted resource consumption in an API?
How do you test batch endpoints for abuse or authorization bypass?
How would you test GraphQL APIs differently from REST APIs?
How would you review an authentication flow for security weaknesses?
How do you test login endpoints for brute force protection?
How do you test password reset functionality?
How do you test email change or phone number change flows?
How do you test MFA enrollment, MFA reset, and MFA bypass scenarios?
How do you test session invalidation after logout?
How do you test refresh token rotation?
How do you test token replay protection?
How do you validate JWT implementation security?
What JWT claims should never be blindly trusted by the backend?
How would you test whether a backend incorrectly trusts role, scope, or tenant_id from a JWT?
How do you test OAuth redirect URI validation?
How do you test OAuth authorization code flow for common implementation mistakes?
How do you test account linking flows for takeover risks?
How do you test session fixation?
How do you test cookie security attributes?
What is the difference between authentication and authorization?
How would you design secure session management for a high-risk application?
How do you test concurrent sessions and device management?
How do you test whether revoked tokens are still accepted by backend services?
How do you find business logic vulnerabilities that scanners usually miss?
How would you test a payment or transaction flow for logic bugs?
How do you test whether client-side validation is duplicated on the server side?
How would you test a multi-step workflow for step skipping?
How do you test race conditions in financial or wallet-related operations?
How would you test whether a user can replay a previously valid request?
How do you test idempotency issues in sensitive operations?
How do you test whether an attacker can manipulate price, currency, amount, chain ID, or recipient address?
How would you test authorization in shared resources, teams, organizations, or projects?
How do you test invite flows for privilege escalation?
How do you test approval workflows for bypasses?
How would you test whether deleted or disabled users can still access resources?
How do you test whether suspended accounts can still use API tokens?
How do you test access control in admin panels?
How would you prove business impact without damaging production data?
How do you test for stored, reflected, and DOM-based XSS?
How do you test whether an XSS is exploitable under a strict CSP?
How do you test SQL injection manually when automated scanners find nothing?
How do you test NoSQL injection?
How do you test SSRF safely?
How do you test file upload functionality?
How do you test path traversal and local file inclusion?
How do you test CORS misconfiguration and prove real impact?
How do you test CSRF in modern applications using SameSite cookies?
How do you test open redirect and when is it actually security-relevant?
How do you test template injection?
How do you test command injection in backend services?
How do you test cache poisoning?
How do you test sensitive data caching across users?
How do you test security headers and explain their real value?
How do you intercept mobile application traffic if certificate pinning is enabled?
How do you test whether sensitive data is stored insecurely on a mobile device?
How do you test Android applications for hardcoded secrets?
How do you test iOS applications for insecure keychain usage?
How do you reverse engineer a mobile app to discover hidden endpoints?
How do you test whether mobile app security checks are only client-side?
How do you test deep links and universal links for account takeover risks?
How do you test mobile API traffic for authorization flaws?
How do you test whether logs contain sensitive information on mobile devices?
How do you test jailbreak or root detection without overestimating its security value?
How would you tune a WAF rule that blocks legitimate mobile API traffic?
How do you decide whether a WAF rule should run in log mode, challenge mode, or block mode?
How would you investigate a production issue caused by WAF false positives?
How do you test whether a WAF can be bypassed through encoding, path normalization, or HTTP method tricks?
How do you test API gateway routing for double slash, encoded slash, or path confusion issues?
How would you configure API schema validation?
What risks does API schema validation reduce, and what does it not solve?
How would you use API discovery to find shadow or undocumented endpoints?
How would you use mTLS for service-to-service API protection?
What are the limitations of mTLS for public mobile APIs?
How would you integrate SAST into CI/CD without blocking every merge request?
How would you prioritize SAST findings with many false positives?
How would you integrate DAST into a release pipeline?
How would you use SCA to detect vulnerable dependencies and license risks?
How would you implement secret scanning in Git repositories and CI logs?
How would you add container image scanning to CI/CD?
How would you define security gates for critical and high vulnerabilities?
How would you work with developers who disagree with the severity of a finding?
How would you measure whether the AppSec program is improving?
How would you build a practical secure SDLC for a fast-moving engineering team?
""".strip().splitlines()


class AiInterviewGuidanceTests(unittest.TestCase):
    def test_attached_interview_questions_have_guidance(self) -> None:
        missing = [
            question
            for question in INTERVIEW_QUESTIONS
            if not _interview_guidance_for(question)
        ]

        self.assertEqual([], missing)

    def test_suggestions_prompt_includes_interview_guidance(self) -> None:
        captured = {}

        def fake_groq(messages, *_args, **_kwargs):
            captured["user"] = messages[1]["content"]
            return "1) I would test BOLA by replaying user A object IDs with user B and proving cross-account read or write impact."

        payload = {
            "ai_provider": "groq",
            "mode": "quick",
            "my_language": "en",
            "their_language": "en",
            "messages": [
                {
                    "direction": "incoming",
                    "transcript": "How would you test for Broken Object Level Authorization in an API?",
                    "translation": "How would you test for Broken Object Level Authorization in an API?",
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
        self.assertIn("Interview answer guidance for the latest topic", captured["user"])
        self.assertIn("For BOLA/IDOR", captured["user"])


if __name__ == "__main__":
    unittest.main()
