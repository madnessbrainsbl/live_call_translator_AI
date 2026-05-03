# Live Call Translator AI

[![Russian version](https://img.shields.io/badge/lang-russian-blue)](README.ru.md)
![Windows](https://img.shields.io/badge/platform-Windows_10%2F11-lightgrey)
![License](https://img.shields.io/badge/license-MIT-blue)
![GitHub stars](https://img.shields.io/github/stars/madnessbrainsbl/live_call_translator_AI)

Windows-first live call translator with an AI assistant. The app listens to both sides of a voice or video call, transcribes speech with Deepgram, translates it with Groq, speaks the translation back through a virtual audio cable, and can generate live AI reply suggestions from the current transcript.

The current project logic is centered on Windows, VB-CABLE A+B, a Rust audio engine, an Elixir supervisor, and a Flask control UI.

<img width="2559" height="1235" alt="32" src="https://github.com/user-attachments/assets/7d756610-c949-453d-8626-4ba5fe971e7c" />




## What It Does

- Two-way live call translation: your speech -> their language, their speech -> your language.
- AI Assistant: quick and detailed answer suggestions based on the live transcript.
- Assistant providers: local ChatGPT/Codex login, OpenRouter, Groq, or automatic fallback.
- Optional web context for the assistant when the latest question needs current factual context.
- Speech-to-text with Deepgram Nova-3 streaming.
- Translation with Groq `llama-3.3-70b-versatile`.
- TTS with local Piper voices or Microsoft Edge Neural voices.
- Windows audio routing through VB-CABLE A+B, plus browser/system audio capture helpers.
- Call history, transcript export, bookmarks, and AI-generated summaries.

## Architecture

```text
Microphone or system audio
        |
        v
Rust audio engine -> Deepgram STT -> Groq translation -> Piper/Edge TTS
        |                                             |
        v                                             v
Elixir supervisor and command port              VB-CABLE / speakers
        |
        v
Flask web UI: settings, transcript, AI Assistant, history
```

## Requirements

- Windows 10 or Windows 11.
- [VB-CABLE A+B](https://vb-audio.com/Cable/) installed and enabled.
- Python 3.
- Elixir/Erlang with `mix`.
- Rust with `cargo`.
- `espeak-ng`.
- Deepgram API key for speech recognition.
- Groq API key for translation.
- Optional: Codex CLI logged in with ChatGPT for the AI Assistant.
- Optional: OpenRouter API key for the AI Assistant.

`setup_windows.ps1` expects Python, Elixir, Rust, and `espeak-ng` to already be available in PATH. It will create the Python venv, install Python packages, download ONNX Runtime for Windows, download default Piper voices, prepare `.env`, fetch Mix dependencies, and compile the Rust audio engine.

## Install Prerequisites First

Before running `setup_windows.ps1`, install these system packages yourself:

| Required | Why it is needed |
|---|---|
| Git | Clones the repository. |
| Python 3.10+ | Runs the Flask UI and setup helper scripts. |
| Elixir + Erlang/OTP | Runs the supervisor app and provides `mix`. |
| Rust stable toolchain | Builds the native audio engine with `cargo`. |
| espeak-ng | Phonemizer required by Piper TTS. |
| VB-CABLE A+B | Virtual audio routing between this app and your call app. |

You can install them manually from their official installers, or with a Windows package manager such as Chocolatey/winget. If you use Chocolatey, this is the kind of setup you need before cloning:

```powershell
choco install git python elixir rust espeak-ng -y
```

After installing, open a new PowerShell window and verify that the tools are visible:

```powershell
git --version
python --version
elixir --version
mix --version
cargo --version
espeak-ng --version
```

Only continue when all commands work. `setup_windows.ps1` will then install project-local dependencies, download ONNX Runtime and voice models, and compile the app.

Optional for the AI Assistant:

- Install Codex CLI and run `codex login` if you want the ChatGPT / Codex provider.
- Add an OpenRouter key if you want OpenRouter as a fallback/provider.

## Quick Start

```powershell
git clone https://github.com/madnessbrainsbl/live_call_translator_AI.git
cd live_call_translator_AI
.\setup_windows.ps1
```

Edit `.env` after setup:

```env
DEEPGRAM_API_KEY=your_deepgram_api_key_here
GROQ_API_KEY=your_groq_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=openrouter/auto
CODEX_BIN=
ORT_DYLIB_PATH=
```

Then run:

```powershell
.\run_windows.ps1
```

Open:

```text
http://127.0.0.1:5050
```

`run_windows.ps1` starts the Flask UI in the background, loads `.env`, fixes the ONNX Runtime path for Windows, then starts the Elixir app and Rust audio engine.

See [Usage Guide](USAGE.md) for controls, voice management, audio setup, AI Assistant, and call history.

## What Setup Downloads And Builds

`setup_windows.ps1` does the project-specific work after the system packages are installed:

- creates `.venv`;
- installs Python packages from `requirements.txt`;
- downloads ONNX Runtime for Windows into `vendor/onnxruntime-win-x64`;
- downloads the default English and Russian Piper voices into `models/`;
- creates `.env` from `.env.example` if needed;
- writes Windows paths for ONNX Runtime and espeak-ng data;
- runs `mix deps.get`;
- compiles the Elixir app and Rust audio engine.

## Windows Audio Setup

For a normal call app setup with VB-CABLE A+B:

1. In the call app, set speakers/output to `CABLE-A Input (VB-Audio Cable A)`.
2. In the call app, set microphone/input to `CABLE-B Output (VB-Audio Cable B)`.
3. In Live Call Translator settings, set `Speaker/System Capture Source` to `CABLE-A Output (VB-Audio Cable A)`.
4. Set `Call Microphone Playback Target` to `CABLE-B Input (VB-Audio Cable B)`.
5. Set `Speakers` to your real headphones or speakers.
6. Set `Microphone` to your real microphone.

For browser calls, the `Monitor` button can capture browser audio and play translated audio in the browser. The Windows system loopback option can also capture speaker output when a dedicated cable capture source is not selected.

## AI Assistant

The AI Assistant button reads the recent live transcript and returns:

- a short answer you can say immediately;
- a fuller answer when more context is useful.

Provider options in Settings:

- `ChatGPT / Codex`: uses the local Codex CLI OAuth login. Run `codex login` in PowerShell before testing it.
- `OpenRouter`: uses `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`.
- `Groq`: uses the same Groq key as translation.
- `Auto fallback`: tries Codex, then OpenRouter, then Groq.

The assistant keeps the answer in your selected language, uses recent transcript context, avoids copying prompt text, and can add lightweight web context for detailed answers when the latest utterance looks like a factual or technical question.

## Voice And TTS

Piper mode uses local ONNX voice models. Setup downloads English and Russian defaults, and the UI can download more voices from the Piper catalog.

Edge mode uses Microsoft Edge Neural voices through `edge-tts`. It does not require local Piper voice files, but it needs network access.

`Text Only` disables spoken output while keeping transcription, translation, and assistant suggestions.

## Controls

- `Start`: starts the selected audio pipelines.
- `Mic Out`: captures your microphone and translates it for the other side.
- `Mic In`: captures the other side or system audio and translates it for you.
- `Monitor`: captures browser audio from the UI.
- `AI Assistant`: suggests replies from the current transcript.
- `Saved`: filters bookmarked transcript items.
- `History`: opens saved calls, utterances, and summaries.
- `Export`: downloads the current transcript as text.

## Web UI Features

- Live transcript with original speech and translated text.
- AI Assistant panel with quick and detailed answer generation.
- Provider testing for Deepgram, Groq, Codex, and OpenRouter.
- Voice selection, voice download, and preview playback.
- Piper local voices and Microsoft Edge Neural voice mode.
- Browser Monitor for browser audio capture and playback.
- Text Only mode when you need translation without spoken TTS.
- Independent outgoing/incoming mute controls.
- Bookmarks and saved-message filtering.
- Local call history with AI summaries.
- Transcript export.
- Dark/light theme.
- Per-message latency metrics for STT, translation, TTS, and total time.

## Supported Languages

The current Windows UI exposes these language choices for STT and translation:

| Language | STT | Translation | TTS |
|---|---|---|---|
| Arabic | Yes | Yes | Piper/Edge, if voice is available |
| Catalan | Yes | Yes | Piper/Edge, if voice is available |
| Chinese | Yes | Yes | Piper/Edge, if voice is available |
| Czech | Yes | Yes | Piper/Edge, if voice is available |
| Danish | Yes | Yes | Piper/Edge, if voice is available |
| Dutch | Yes | Yes | Piper/Edge, if voice is available |
| English | Yes | Yes | Piper/Edge |
| Finnish | Yes | Yes | Piper/Edge, if voice is available |
| French | Yes | Yes | Piper/Edge, if voice is available |
| German | Yes | Yes | Piper/Edge, if voice is available |
| Greek | Yes | Yes | Piper/Edge, if voice is available |
| Hindi | Yes | Yes | Edge, or Piper if a voice is available |
| Hungarian | Yes | Yes | Piper/Edge, if voice is available |
| Indonesian | Yes | Yes | Edge, or Piper if a voice is available |
| Italian | Yes | Yes | Piper/Edge, if voice is available |
| Latvian | Yes | Yes | Edge, or Piper if a voice is available |
| Norwegian | Yes | Yes | Piper/Edge, if voice is available |
| Persian | Yes | Yes | Piper/Edge, if voice is available |
| Polish | Yes | Yes | Piper/Edge, if voice is available |
| Portuguese | Yes | Yes | Piper/Edge, if voice is available |
| Romanian | Yes | Yes | Piper/Edge, if voice is available |
| Russian | Yes | Yes | Piper/Edge |
| Spanish | Yes | Yes | Piper/Edge, if voice is available |
| Swedish | Yes | Yes | Piper/Edge, if voice is available |
| Turkish | Yes | Yes | Piper/Edge, if voice is available |
| Ukrainian | Yes | Yes | Piper/Edge, if voice is available |
| Vietnamese | Yes | Yes | Piper/Edge, if voice is available |

Setup downloads English and Russian Piper voices by default. More Piper voices can be downloaded in Settings; Edge Neural voices are loaded online.

## Troubleshooting

If audio does not reach the call app, re-check the VB-CABLE directions: app microphone must be `CABLE-B Output`, while this app must play translated outgoing speech to `CABLE-B Input`.

If incoming audio is silent, use `CABLE-A Output` as the capture source when the call app speakers are set to `CABLE-A Input`, or use `Monitor` for browser audio.

If Codex Assistant fails, run `codex login` in PowerShell, then press `Test` next to ChatGPT / Codex in Settings.

If Piper TTS fails, download the selected voice in Settings or switch TTS Engine to Microsoft Edge Neural voices.

## License

MIT
