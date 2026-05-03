# Usage Guide

Open **http://127.0.0.1:5050** after running:

```powershell
.\run_windows.ps1
```

## First Launch

Open **Settings** and configure:

1. **API Keys**: Deepgram for STT, Groq for translation, optional OpenRouter for AI Assistant.
2. **AI Assistant Provider**: ChatGPT / Codex, OpenRouter, Groq, or Auto fallback.
3. **Languages**: `My Language` and `Their Language`.
4. **Voice**: choose Piper local voices or Microsoft Edge Neural voices.
5. **Audio Devices**: choose your microphone, speakers, call capture source, and call microphone playback target.
6. Click **Save & Restart Engine**.

If you use ChatGPT / Codex, run `codex login` in PowerShell first, then press **Test** next to ChatGPT / Codex.

## Controls

| Button | What it does |
|--------|-------------|
| **Start / Stop** | Start or stop the translation engine. A call session is recorded between Start and Stop. |
| **Mic Out** | Mute/unmute your microphone and outgoing translation. |
| **Mic In** | Mute/unmute incoming/system audio translation. |
| **Monitor** | Capture browser audio and play translated audio in the browser. |
| **Text Only** | Disable spoken TTS output while keeping transcript, translation, and AI Assistant. |
| **AI Assistant** | Generate quick and detailed reply suggestions from the live transcript. |
| **Saved** | Filter to bookmarked transcript messages. |
| **History** | Open past sessions and AI summaries. |
| **Export** | Download the current transcript as a text file. |
| **Clear** | Clear the current view. |
| **Settings** | Open the settings panel. |

## Live Transcript

The main area shows a real-time chat with translations:

- Right-side bubbles are your speech translated to their language.
- Left-side bubbles are their speech translated to your language.
- The original transcript appears under the translated text.
- Timing metadata shows STT, translation, TTS, and total latency.
- Click a bubble to copy text.
- Use the bookmark control to save important lines.

## AI Assistant

The AI Assistant reads recent transcript context and returns one or two answer options:

- a short answer for immediate use;
- a fuller answer when the situation needs more context.

Provider behavior:

- **ChatGPT / Codex** uses the local Codex CLI OAuth login.
- **OpenRouter** uses `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`.
- **Groq** uses the configured Groq key.
- **Auto fallback** tries Codex, then OpenRouter, then Groq.

Detailed answers may use lightweight web context when the latest utterance looks like a current factual or technical question.

## Voice Management

In Settings > Voice:

- **Piper local voices** use downloaded ONNX voice models from the Piper catalog.
- **Microsoft Edge Neural voices** use `edge-tts` online voices.
- Download buttons appear for Piper voices that are available but not installed.
- The preview button plays a voice sample.
- Switching languages updates the incoming and outgoing voice lists.

## Windows Audio Setup

For Google Meet, Zoom, Discord, Teams, or another call app with VB-CABLE A+B:

1. Install VB-CABLE A+B before first launch.
2. Run `.\setup_windows.ps1`, then `.\run_windows.ps1`.
3. In the call app, set **Microphone** to `CABLE-B Output (VB-Audio Cable B)`.
4. In the call app, set **Speakers** to `CABLE-A Input (VB-Audio Cable A)`.
5. In Settings > Audio Devices, set **Call Microphone Playback Target** to `CABLE-B Input (VB-Audio Cable B)`.
6. In Settings > Audio Devices, set **Speaker/System Capture Source** to `CABLE-A Output (VB-Audio Cable A)`.
7. Set **Speakers** to your real headphones or speakers.
8. Set **Microphone** to your real microphone.

For browser calls, you can use **Monitor** to capture browser audio instead of relying only on virtual cable capture. System output loopback can also capture the selected speaker output on Windows.

## Call History

Click **History** to see past call sessions:

- Each session shows start/end time, languages, and message count.
- Click a session to see the full transcript.
- **Summary** generates an AI-powered summary using Groq.
- Delete permanently removes a call from local history.

## Troubleshooting

If outgoing translated speech does not reach the call, verify that the call app microphone is `CABLE-B Output` and this app's playback target is `CABLE-B Input`.

If incoming translation is silent, verify that the call app speakers are `CABLE-A Input` and this app captures `CABLE-A Output`, or use **Monitor** for browser audio.

If Codex Assistant fails, run `codex login` in PowerShell and test ChatGPT / Codex in Settings.

If Piper voice preview or TTS fails, download the selected Piper voice or switch TTS Engine to Microsoft Edge Neural voices.
