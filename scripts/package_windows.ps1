param(
  [string]$AppVersion = "0.1.0",
  [switch]$InstallBuildDeps,
  [switch]$SkipInstaller
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([Environment]::OSVersion.Platform -ne 'Win32NT') {
  throw 'scripts/package_windows.ps1 must be run on Windows.'
}

$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $ProjectDir

function Add-PathIfExists {
  param([string]$Path)

  if ($Path -and (Test-Path -LiteralPath $Path)) {
    $env:PATH = "$Path;$env:PATH"
  }
}

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

function Invoke-Native {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$Label
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE."
  }
}

function Remove-DirectoryIfSafe {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $separator = [System.IO.Path]::DirectorySeparatorChar
  $distRoot = [System.IO.Path]::GetFullPath((Join-Path $ProjectDir 'dist') + $separator)
  $tmpRoot = [System.IO.Path]::GetFullPath((Join-Path $ProjectDir '.tmp') + $separator)
  $comparison = [System.StringComparison]::OrdinalIgnoreCase

  if (
    -not $fullPath.StartsWith($distRoot, $comparison) -and
    -not $fullPath.StartsWith($tmpRoot, $comparison)
  ) {
    throw "Refusing to remove directory outside dist/.tmp: $fullPath"
  }

  Remove-Item -LiteralPath $fullPath -Recurse -Force
}

function Test-PythonModule {
  param(
    [string]$PythonExe,
    [string]$ModuleName
  )

  & $PythonExe -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('$ModuleName') else 1)" *> $null
  return $LASTEXITCODE -eq 0
}

function Copy-RequiredFile {
  param(
    [string]$Source,
    [string]$Destination
  )

  if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
    throw "Required file is missing: $Source"
  }

  $destDir = Split-Path -Parent $Destination
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Copy-Voice {
  param(
    [string]$Lang,
    [string]$VoiceName,
    [string]$DestinationModels
  )

  $sourceDir = Join-Path $ProjectDir "models\piper-$Lang"
  $destDir = Join-Path $DestinationModels "piper-$Lang"
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null

  Copy-RequiredFile -Source (Join-Path $sourceDir "$VoiceName.onnx") -Destination (Join-Path $destDir "$VoiceName.onnx")
  Copy-RequiredFile -Source (Join-Path $sourceDir "$VoiceName.onnx.json") -Destination (Join-Path $destDir "$VoiceName.onnx.json")
}

function Resolve-EspeakRoot {
  $candidates = @(
    $env:ESPEAK_ROOT,
    'C:\Program Files\eSpeak NG',
    'C:\Program Files (x86)\eSpeak NG',
    'C:\ProgramData\chocolatey\lib\espeak-ng\tools\eSpeak NG',
    'C:\ProgramData\chocolatey\lib\espeak-ng\tools'
  )

  foreach ($candidate in $candidates) {
    if (-not $candidate) {
      continue
    }
    if (Test-Path -LiteralPath (Join-Path $candidate 'espeak-ng.exe') -PathType Leaf) {
      return $candidate
    }
  }

  throw 'Bundled espeak-ng source was not found. Install espeak-ng or set ESPEAK_ROOT.'
}

function Write-LauncherFiles {
  param([string]$PortableDir)

  $ps1 = @'
param(
  [switch]$NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([Environment]::OSVersion.Platform -ne 'Win32NT') {
  throw 'This portable build is for Windows 10/11 x64.'
}

$AppRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $AppRoot

$localTemp = Join-Path $AppRoot '.tmp'
New-Item -ItemType Directory -Path $localTemp -Force | Out-Null
$env:TEMP = $localTemp
$env:TMP = $localTemp
$env:TMPDIR = $localTemp

function Add-PathIfExists {
  param([string]$Path)
  if ($Path -and (Test-Path -LiteralPath $Path)) {
    $env:PATH = "$Path;$env:PATH"
  }
}

function Import-DotEnv {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) {
      return
    }

    $parts = $line.Split('=', 2)
    $key = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"')
    [System.Environment]::SetEnvironmentVariable($key, $value, 'Process')
  }
}

$env:TRANSLATOR_APP_ROOT = $AppRoot
$env:TRANSLATOR_MODELS_DIR = Join-Path $AppRoot 'models'
$env:TRANSLATOR_AUDIO_ENGINE_PATH = Join-Path $AppRoot 'bin\audio_engine.exe'

$ortDll = Join-Path $AppRoot 'vendor\onnxruntime-win-x64\lib\onnxruntime.dll'
$espeakDir = Join-Path $AppRoot 'espeak-ng'
$espeakExe = Join-Path $espeakDir 'espeak-ng.exe'
$espeakData = Join-Path $espeakDir 'espeak-ng-data'

Add-PathIfExists (Join-Path $AppRoot 'bin')
Add-PathIfExists (Join-Path $AppRoot 'vendor\onnxruntime-win-x64\lib')
Add-PathIfExists $espeakDir

Import-DotEnv (Join-Path $AppRoot '.env')

if (-not $env:ORT_DYLIB_PATH -or -not (Test-Path -LiteralPath $env:ORT_DYLIB_PATH)) {
  $env:ORT_DYLIB_PATH = $ortDll
}
if (-not $env:ESPEAK_NG_PATH -or -not (Test-Path -LiteralPath $env:ESPEAK_NG_PATH)) {
  $env:ESPEAK_NG_PATH = $espeakExe
}
if (-not $env:ESPEAK_BIN_PATH -or -not (Test-Path -LiteralPath $env:ESPEAK_BIN_PATH)) {
  $env:ESPEAK_BIN_PATH = $espeakDir
}
if (-not $env:ESPEAK_DATA_PATH -or -not (Test-Path -LiteralPath $env:ESPEAK_DATA_PATH)) {
  $env:ESPEAK_DATA_PATH = $espeakData
}
if (-not $env:ESPEAKNG_DATA_PATH -or -not (Test-Path -LiteralPath $env:ESPEAKNG_DATA_PATH)) {
  $env:ESPEAKNG_DATA_PATH = $espeakData
}

$webExe = Join-Path $AppRoot 'web-ui\web-ui.exe'
$releaseCmd = Join-Path $AppRoot 'elixir\bin\translator.bat'

if (-not (Test-Path -LiteralPath $webExe -PathType Leaf)) {
  throw "web-ui.exe not found at $webExe"
}
if (-not (Test-Path -LiteralPath $releaseCmd -PathType Leaf)) {
  throw "Elixir release launcher not found at $releaseCmd"
}
if (-not (Test-Path -LiteralPath $env:TRANSLATOR_AUDIO_ENGINE_PATH -PathType Leaf)) {
  throw "audio_engine.exe not found at $env:TRANSLATOR_AUDIO_ENGINE_PATH"
}

$web = $null
$translator = $null

try {
  & $releaseCmd stop *> $null
} catch {
}
Get-Process audio_engine -ErrorAction SilentlyContinue | Stop-Process -Force

try {
  $web = Start-Process -FilePath $webExe -WorkingDirectory $AppRoot -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 1

  $translator = Start-Process -FilePath $releaseCmd -ArgumentList 'start' -WorkingDirectory $AppRoot -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 2

  if (-not $NoBrowser) {
    try {
      Start-Process 'http://127.0.0.1:5050'
    } catch {
      Write-Warning 'Could not open the browser automatically. Open http://127.0.0.1:5050 manually.'
    }
  }

  Write-Host 'Live Call Translator is running at http://127.0.0.1:5050'
  Write-Host 'Close this window or press Ctrl+C to stop it.'

  Wait-Process -Id $translator.Id
}
finally {
  try {
    & $releaseCmd stop *> $null
  } catch {
  }

  if ($web -and -not $web.HasExited) {
    Stop-Process -Id $web.Id -Force
  }

  Get-Process audio_engine -ErrorAction SilentlyContinue | Stop-Process -Force
}
'@

  $cmd = @'
@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Translator.ps1" %*
exit /b %ERRORLEVEL%
'@

  $readme = @'
Live Call Translator AI - Windows Portable Build

How to run:
1. Install VB-CABLE A+B separately if you want call audio routing.
2. Run LiveCallTranslator.exe for the app-window launcher.
3. You can also run Start-Translator.cmd for the script launcher.
4. Enter Deepgram/Groq/OpenRouter keys in Settings, or create a local .env from .env.example.

Notes:
- Python, Elixir/Erlang, the Rust audio engine, ONNX Runtime, espeak-ng, and the basic en/ru Piper voices are bundled here.
- VB-CABLE A+B is a Windows audio driver and is not bundled.
- Codex CLI is optional and is not bundled.
- Cloud STT/LLM providers and Edge TTS still need internet access.
'@

  Set-Content -Path (Join-Path $PortableDir 'Start-Translator.ps1') -Value $ps1 -Encoding UTF8
  Set-Content -Path (Join-Path $PortableDir 'Start-Translator.cmd') -Value $cmd -Encoding ASCII
  Set-Content -Path (Join-Path $PortableDir 'README-FIRST.txt') -Value $readme -Encoding ASCII
}

Write-Host '=== Live Call Translator Windows package build ==='

Add-PathIfExists (Join-Path $env:ProgramData 'chocolatey\lib\elixir\tools\bin')
Add-PathIfExists (Join-Path $env:ProgramData 'chocolatey\bin')
Add-PathIfExists 'C:\Program Files\Erlang OTP\bin'

$BuildDir = Join-Path $ProjectDir '.tmp\package-windows'
$TempDir = Join-Path $BuildDir 'temp'
$ReleaseDir = Join-Path $BuildDir 'translator-release'
$PyInstallerDist = Join-Path $BuildDir 'pyinstaller-dist'
$PyInstallerWork = Join-Path $BuildDir 'pyinstaller-work'
$PyInstallerSpec = Join-Path $BuildDir 'pyinstaller-spec'
$DistDir = Join-Path $ProjectDir 'dist'
$PortableDir = Join-Path $DistDir 'LiveCallTranslator-portable'
$ZipPath = Join-Path $DistDir 'LiveCallTranslator-portable.zip'

Remove-DirectoryIfSafe $BuildDir
Remove-DirectoryIfSafe $PortableDir
if (Test-Path -LiteralPath $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}

New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
New-Item -ItemType Directory -Path $PortableDir -Force | Out-Null

$env:TEMP = $TempDir
$env:TMP = $TempDir
$env:TMPDIR = $TempDir

$pythonCmd = Get-RequiredCommand -Names @('python.exe', 'py.exe', 'python', 'py') -Label 'Python 3'
$cargoCmd = Get-RequiredCommand -Names @('cargo.exe', 'cargo') -Label 'Rust / cargo'
$mixCmd = Get-RequiredCommand -Names @('mix.bat', 'mix.cmd', 'mix.exe', 'mix') -Label 'Elixir / mix'
$null = Get-RequiredCommand -Names @('elixir.bat', 'elixir.cmd', 'elixir.exe', 'elixir') -Label 'Elixir runtime'

$pythonArgs = @()
if ([System.IO.Path]::GetFileName($pythonCmd).ToLowerInvariant() -eq 'py.exe') {
  $pythonArgs = @('-3')
}

$venvDir = Join-Path $ProjectDir '.venv'
if (-not (Test-Path -LiteralPath $venvDir)) {
  Invoke-Native -FilePath $pythonCmd -Arguments ($pythonArgs + @('-m', 'venv', $venvDir)) -Label 'Python venv creation'
}
$venvPython = Join-Path $venvDir 'Scripts\python.exe'
Invoke-Native -FilePath $venvPython -Arguments @('-m', 'pip', 'install', '--quiet', '-r', (Join-Path $ProjectDir 'requirements.txt')) -Label 'Python dependency installation'

if (-not (Test-PythonModule -PythonExe $venvPython -ModuleName 'PyInstaller')) {
  if ($InstallBuildDeps) {
    Invoke-Native -FilePath $venvPython -Arguments @('-m', 'pip', 'install', '--quiet', 'pyinstaller') -Label 'PyInstaller installation'
  } else {
    throw 'PyInstaller is required. Re-run with -InstallBuildDeps or install it into .venv first.'
  }
}

Write-Host 'Building Rust audio_engine.exe...'
Invoke-Native -FilePath $cargoCmd -Arguments @('build', '--release', '--manifest-path', (Join-Path $ProjectDir 'native\audio_engine\Cargo.toml')) -Label 'Rust release build'

Write-Host 'Building Windows launcher LiveCallTranslator.exe...'
$launcherTarget = Join-Path $BuildDir 'launcher-target'
Invoke-Native -FilePath $cargoCmd -Arguments @('build', '--release', '--manifest-path', (Join-Path $ProjectDir 'native\windows_launcher\Cargo.toml'), '--target-dir', $launcherTarget) -Label 'Windows launcher build'

Write-Host 'Building Elixir release...'
$env:MIX_ENV = 'prod'
if (Test-Path -LiteralPath (Join-Path $ProjectDir 'deps\jason\mix.exs')) {
  Write-Host 'Mix dependencies are already present; skipping deps.get.'
} else {
  Invoke-Native -FilePath $mixCmd -Arguments @('deps.get') -Label 'Mix deps.get'
}
Invoke-Native -FilePath $mixCmd -Arguments @('release', '--overwrite', '--path', $ReleaseDir) -Label 'Mix release'

Write-Host 'Building Flask web-ui.exe with PyInstaller...'
$templatesData = "$(Join-Path $ProjectDir 'web\templates');web\templates"
$staticData = "$(Join-Path $ProjectDir 'web\static');web\static"
$pyInstallerArgs = @(
  '--noconfirm',
  '--clean',
  '--onedir',
  '--name',
  'web-ui',
  '--distpath',
  $PyInstallerDist,
  '--workpath',
  $PyInstallerWork,
  '--specpath',
  $PyInstallerSpec,
  '--add-data',
  $templatesData,
  '--add-data',
  $staticData,
  '--hidden-import',
  'edge_tts',
  'web.py'
)
Invoke-Native -FilePath $venvPython -Arguments (@('-m', 'PyInstaller') + $pyInstallerArgs) -Label 'PyInstaller web UI build'

Write-Host 'Staging portable folder...'
Copy-Item -LiteralPath $ReleaseDir -Destination (Join-Path $PortableDir 'elixir') -Recurse -Force

New-Item -ItemType Directory -Path (Join-Path $PortableDir 'bin') -Force | Out-Null
Copy-RequiredFile -Source (Join-Path $ProjectDir 'native\audio_engine\target\release\audio_engine.exe') -Destination (Join-Path $PortableDir 'bin\audio_engine.exe')
Copy-RequiredFile -Source (Join-Path $launcherTarget 'release\live_call_translator_launcher.exe') -Destination (Join-Path $PortableDir 'LiveCallTranslator.exe')
$webBundleSource = Join-Path $PyInstallerDist 'web-ui'
if (-not (Test-Path -LiteralPath (Join-Path $webBundleSource 'web-ui.exe') -PathType Leaf)) {
  throw "PyInstaller web UI bundle is missing: $webBundleSource"
}
Copy-Item -LiteralPath $webBundleSource -Destination (Join-Path $PortableDir 'web-ui') -Recurse -Force

$ortSource = Join-Path $ProjectDir 'vendor\onnxruntime-win-x64'
if (-not (Test-Path -LiteralPath (Join-Path $ortSource 'lib\onnxruntime.dll'))) {
  throw 'ONNX Runtime for Windows was not found. Run setup_windows.ps1 first.'
}
$ortDest = Join-Path $PortableDir 'vendor\onnxruntime-win-x64'
New-Item -ItemType Directory -Path (Join-Path $ortDest 'lib') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $ortSource 'lib\onnxruntime.dll') -Destination (Join-Path $ortDest 'lib\onnxruntime.dll') -Force
Copy-Item -LiteralPath (Join-Path $ortSource 'lib\onnxruntime_providers_shared.dll') -Destination (Join-Path $ortDest 'lib\onnxruntime_providers_shared.dll') -Force
foreach ($name in @('LICENSE', 'Privacy.md', 'README.md', 'ThirdPartyNotices.txt', 'VERSION_NUMBER')) {
  $source = Join-Path $ortSource $name
  if (Test-Path -LiteralPath $source) {
    Copy-Item -LiteralPath $source -Destination (Join-Path $ortDest $name) -Force
  }
}

$espeakSource = Resolve-EspeakRoot
$espeakDest = Join-Path $PortableDir 'espeak-ng'
New-Item -ItemType Directory -Path $espeakDest -Force | Out-Null
Copy-RequiredFile -Source (Join-Path $espeakSource 'espeak-ng.exe') -Destination (Join-Path $espeakDest 'espeak-ng.exe')
Get-ChildItem -LiteralPath $espeakSource -Filter '*.dll' -File | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $espeakDest $_.Name) -Force
}
$espeakDataSource = @(
  (Join-Path $espeakSource 'espeak-ng-data'),
  (Join-Path $espeakSource 'espeak-data')
) | Where-Object { Test-Path -LiteralPath $_ -PathType Container } | Select-Object -First 1
if (-not $espeakDataSource) {
  throw "espeak-ng data directory was not found under $espeakSource."
}
Copy-Item -LiteralPath $espeakDataSource -Destination (Join-Path $espeakDest 'espeak-ng-data') -Recurse -Force

$modelsDest = Join-Path $PortableDir 'models'
Copy-Voice -Lang 'en' -VoiceName 'en_US-ryan-medium' -DestinationModels $modelsDest
Copy-Voice -Lang 'ru' -VoiceName 'ru_RU-denis-medium' -DestinationModels $modelsDest

foreach ($name in @('LICENSE', 'README.md', 'README.ru.md', 'USAGE.md', '.env.example')) {
  $source = Join-Path $ProjectDir $name
  if (Test-Path -LiteralPath $source) {
    Copy-Item -LiteralPath $source -Destination (Join-Path $PortableDir $name) -Force
  }
}
if (Test-Path -LiteralPath (Join-Path $ProjectDir 'voices-catalog.json')) {
  Copy-Item -LiteralPath (Join-Path $ProjectDir 'voices-catalog.json') -Destination (Join-Path $PortableDir 'voices-catalog.json') -Force
}

Write-LauncherFiles -PortableDir $PortableDir

Write-Host 'Creating portable ZIP...'
Compress-Archive -LiteralPath $PortableDir -DestinationPath $ZipPath -Force

if (-not $SkipInstaller) {
  $iscc = Get-Command iscc.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($iscc) {
    Write-Host 'Building Inno Setup installer...'
    $iss = Join-Path $ProjectDir 'packaging\windows\LiveCallTranslator.iss'
    Invoke-Native -FilePath $iscc.Source -Arguments @("/DSourceDir=$PortableDir", "/DOutputDir=$DistDir", "/DAppVersion=$AppVersion", $iss) -Label 'Inno Setup build'
  } else {
    Write-Warning 'Inno Setup is not installed or iscc.exe is not in PATH. Portable ZIP was created; installer was skipped.'
  }
}

Write-Host ''
Write-Host 'Package outputs:'
Write-Host "  $PortableDir"
Write-Host "  $ZipPath"
if (Test-Path -LiteralPath (Join-Path $DistDir 'LiveCallTranslator-Setup.exe')) {
  Write-Host "  $(Join-Path $DistDir 'LiveCallTranslator-Setup.exe')"
}
