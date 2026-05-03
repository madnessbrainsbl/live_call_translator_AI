Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([Environment]::OSVersion.Platform -ne 'Win32NT') {
  throw 'setup_windows.ps1 must be run on Windows.'
}

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectDir

function Add-PathIfExists {
  param([string]$Path)

  if ($Path -and (Test-Path $Path)) {
    $env:PATH = "$Path;$env:PATH"
  }
}

Add-PathIfExists (Join-Path $env:ProgramData 'chocolatey\lib\elixir\tools\bin')
Add-PathIfExists (Join-Path $env:ProgramData 'chocolatey\bin')

$localTemp = Join-Path $ProjectDir '.tmp'
New-Item -ItemType Directory -Path $localTemp -Force | Out-Null
$env:TEMP = $localTemp
$env:TMP = $localTemp
$env:TMPDIR = $localTemp

function Get-RequiredCommand {
  param(
    [string[]]$Names,
    [string]$Label
  )

  foreach ($name in $Names) {
    $cmd = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) {
      return $cmd.Source
    }
  }

  throw "$Label is required but was not found in PATH."
}

$pythonCmd = Get-RequiredCommand -Names @('python.exe', 'py.exe', 'python', 'py') -Label 'Python 3'
$cargoCmd = Get-RequiredCommand -Names @('cargo.exe', 'cargo') -Label 'Rust / cargo'
$mixCmd = Get-RequiredCommand -Names @('mix.bat', 'mix.cmd', 'mix.exe', 'mix') -Label 'Elixir / mix'
$null = Get-RequiredCommand -Names @('elixir.bat', 'elixir.cmd', 'elixir.exe', 'elixir') -Label 'Elixir runtime'
$null = Get-RequiredCommand -Names @('espeak-ng') -Label 'espeak-ng'

$pythonArgs = @()
if ([System.IO.Path]::GetFileName($pythonCmd).ToLowerInvariant() -eq 'py.exe') {
  $pythonArgs = @('-3')
}

function Invoke-Python {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  & $pythonCmd @pythonArgs @Args
}

Write-Host '=== Realtime Call Translator - Windows Setup ==='
Write-Host ''

$venvDir = Join-Path $ProjectDir '.venv'
if (-not (Test-Path $venvDir)) {
  Invoke-Python -m venv $venvDir
}

$venvPython = Join-Path $venvDir 'Scripts/python.exe'
& $venvPython -m pip install --quiet -r (Join-Path $ProjectDir 'requirements.txt')

$ortVersion = '1.24.4'
$ortRoot = Join-Path $ProjectDir 'vendor/onnxruntime-win-x64'
$ortDll = Join-Path $ortRoot 'lib/onnxruntime.dll'
if (-not (Test-Path $ortDll)) {
  $zipUrl = "https://github.com/microsoft/onnxruntime/releases/download/v$ortVersion/onnxruntime-win-x64-$ortVersion.zip"
  $zipPath = Join-Path $env:TEMP "onnxruntime-win-x64-$ortVersion.zip"
  $extractDir = Join-Path $env:TEMP "onnxruntime-win-x64-$ortVersion"

  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }

  Write-Host "Downloading ONNX Runtime $ortVersion..."
  Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force

  $expandedRoot = Get-ChildItem $extractDir | Select-Object -First 1
  if (-not $expandedRoot) {
    throw 'Failed to unpack ONNX Runtime archive.'
  }

  if (Test-Path $ortRoot) { Remove-Item $ortRoot -Recurse -Force }
  New-Item -ItemType Directory -Path $ortRoot | Out-Null
  Copy-Item -Path (Join-Path $expandedRoot.FullName '*') -Destination $ortRoot -Recurse -Force
}

$voiceScript = @'
import json
import os
import sys
import urllib.request

project_dir = os.getcwd()
models_dir = os.path.join(project_dir, "models")
hf_base = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0"
defaults = {
    "en": "en_US-ryan-medium",
    "ru": "ru_RU-denis-medium",
}

req = urllib.request.Request(
    f"{hf_base}/voices.json",
    headers={"User-Agent": "translator/1.0"},
)
catalog = json.loads(urllib.request.urlopen(req, timeout=60).read())
with open(os.path.join(project_dir, "voices-catalog.json"), "w", encoding="utf-8") as cache_file:
    json.dump(catalog, cache_file)

for lang, voice_name in defaults.items():
    lang_dir = os.path.join(models_dir, f"piper-{lang}")
    os.makedirs(lang_dir, exist_ok=True)
    info = catalog.get(voice_name)
    if not info:
        print(f"[WARN] {voice_name} not found in Piper catalog")
        continue

    for rel_path, file_info in info.get("files", {}).items():
        dest = os.path.join(lang_dir, os.path.basename(rel_path))
        if os.path.exists(dest):
            continue
        req = urllib.request.Request(
            f"{hf_base}/{rel_path}",
            headers={"User-Agent": "translator/1.0"},
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            with open(dest, "wb") as handle:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    handle.write(chunk)
    print(f"[OK] {voice_name}")
'@

$voiceScript | & $venvPython -

$envFile = Join-Path $ProjectDir '.env'
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $ProjectDir '.env.example') $envFile
}

$envLines = Get-Content $envFile
$ortLine = "ORT_DYLIB_PATH=$ortDll"
if ($envLines -match '^ORT_DYLIB_PATH=') {
  $envLines = $envLines | ForEach-Object {
    if ($_ -match '^ORT_DYLIB_PATH=') { $ortLine } else { $_ }
  }
} else {
  $envLines += $ortLine
}

$espeakDataCandidates = @(
  'C:\Program Files\eSpeak NG\espeak-data',
  'C:\Program Files (x86)\eSpeak NG\espeak-data',
  'C:\ProgramData\chocolatey\lib\espeak-ng\tools\eSpeak NG\espeak-data',
  'C:\ProgramData\chocolatey\lib\espeak-ng\tools\espeak-data'
)

$espeakDataDir = $espeakDataCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($espeakDataDir) {
  $espeakDataLine = "ESPEAK_DATA_PATH=$espeakDataDir"
  $espeakNgDataLine = "ESPEAKNG_DATA_PATH=$espeakDataDir"
  if ($envLines -match '^ESPEAK_DATA_PATH=') {
    $envLines = $envLines | ForEach-Object {
      if ($_ -match '^ESPEAK_DATA_PATH=') { $espeakDataLine } else { $_ }
    }
  } else {
    $envLines += $espeakDataLine
  }
  if ($envLines -match '^ESPEAKNG_DATA_PATH=') {
    $envLines = $envLines | ForEach-Object {
      if ($_ -match '^ESPEAKNG_DATA_PATH=') { $espeakNgDataLine } else { $_ }
    }
  } else {
    $envLines += $espeakNgDataLine
  }
}

Set-Content -Path $envFile -Value $envLines

& $mixCmd local.hex --force | Out-Null
& $mixCmd local.rebar --force | Out-Null
& $mixCmd deps.get
& $mixCmd compile

Write-Host ''
Write-Host '=== Windows setup complete ==='
Write-Host 'Next steps:'
Write-Host '  1. Install VB-CABLE A+B and keep both cable pairs enabled.'
Write-Host '  2. Put Deepgram and Groq keys into .env.'
Write-Host '  3. Run .\run_windows.ps1'
Write-Host '  4. In your call app set Speakers = CABLE-A Input, Microphone = CABLE-B Output.'
