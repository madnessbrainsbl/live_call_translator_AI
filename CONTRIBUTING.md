# Contributing

Thanks for your interest in contributing to Live Call Translator AI.

## Bug Reports

Open an [issue](../../issues/new?template=bug_report.md) with:

- what you expected vs what happened;
- steps to reproduce;
- Windows version;
- call app and browser, if any;
- audio routing mode: VB-CABLE A+B, Monitor, system loopback, or other;
- AI provider, if the issue involves AI Assistant.

## Feature Requests

Open an [issue](../../issues/new?template=feature_request.md) describing the use case, expected workflow, and why it matters.

## Pull Requests

1. Fork the repo.
2. Create a branch: `git checkout -b feature/your-feature`.
3. Make focused changes.
4. Test locally on Windows with a real call or a reproducible audio source.
5. Update `README.md` or `USAGE.md` if setup, audio routing, AI Assistant, or TTS behavior changed.
6. Submit a PR with a clear description and testing notes.

## Windows Development Setup

```powershell
git clone https://github.com/madnessbrainsbl/live_call_translator_AI.git
cd live_call_translator_AI
.\setup_windows.ps1
```

Edit `.env` with your API keys, then run:

```powershell
.\run_windows.ps1
```

For call routing, use VB-CABLE A+B:

- call app speakers: `CABLE-A Input (VB-Audio Cable A)`;
- call app microphone: `CABLE-B Output (VB-Audio Cable B)`;
- app capture source: `CABLE-A Output (VB-Audio Cable A)`;
- app microphone playback target: `CABLE-B Input (VB-Audio Cable B)`.

## Code Style

- Python: follow existing Flask module patterns under `web/`.
- Rust: run `cargo fmt` and `cargo clippy` in `native/audio_engine`.
- Elixir: run `mix format`.
- Keep generated files, local models, databases, logs, and secrets out of commits.

## Useful Areas

- Windows audio routing reliability.
- AI Assistant provider behavior and prompt quality.
- TTS provider switching and voice management.
- Latency and echo suppression.
- Documentation that matches the actual app flow.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
