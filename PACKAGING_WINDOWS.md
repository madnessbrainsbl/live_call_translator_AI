# Windows Packaging

This project can be packaged as a portable Windows folder/ZIP and, when Inno
Setup is installed, as an installer EXE.

## Prerequisites

- Windows 10/11 x64.
- Python 3, Rust, Elixir/Erlang, and espeak-ng available on the build machine.
- Project setup already completed with `.\setup_windows.ps1`.
- Optional: Inno Setup with `iscc.exe` in PATH for the installer.

PyInstaller is a build-time Python dependency. The packaging script can install
it into `.venv`:

```powershell
.\scripts\package_windows.ps1 -InstallBuildDeps
```

## Build

```powershell
.\scripts\package_windows.ps1 -InstallBuildDeps
```

Outputs:

- `dist\LiveCallTranslator-portable\`
- `dist\LiveCallTranslator-portable.zip`
- `dist\LiveCallTranslator-Setup.exe` when Inno Setup is available

Use `-SkipInstaller` to build only the portable folder and ZIP.

## Runtime Notes

The package bundles Python/Flask as a PyInstaller `web-ui\web-ui.exe` bundle,
an Elixir release with Erlang runtime, `audio_engine.exe`, ONNX Runtime DLLs,
espeak-ng, and the basic English/Russian Piper voices.

The package does not bundle VB-CABLE A+B, API keys, Codex CLI, or internet
access for cloud providers. Users can launch `LiveCallTranslator.exe` for a
desktop-app style window, or `Start-Translator.cmd` for the script launcher.
Then configure keys and audio devices in the UI.
