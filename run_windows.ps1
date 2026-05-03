param(
  [switch]$Background
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([Environment]::OSVersion.Platform -ne 'Win32NT') {
  throw 'run_windows.ps1 must be run on Windows.'
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

$envFile = Join-Path $ProjectDir '.env'
if (-not (Test-Path $envFile)) {
  throw '.env not found. Run .\setup_windows.ps1 first.'
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

$pythonExe = Join-Path $ProjectDir '.venv/Scripts/python.exe'
if (-not (Test-Path $pythonExe)) {
  $pythonExe = Get-RequiredCommand -Names @('python', 'py') -Label 'Python 3'
}

$elixirCmd = Get-RequiredCommand -Names @('elixir.bat', 'elixir.cmd', 'elixir.exe', 'elixir') -Label 'elixir'
$iexCmd = Get-RequiredCommand -Names @('iex.bat', 'iex.cmd', 'iex.exe') -Label 'iex'
$mixCmd = Get-RequiredCommand -Names @('mix.bat', 'mix.cmd', 'mix.exe', 'mix') -Label 'mix'

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) {
    return
  }

  $parts = $line.Split('=', 2)
  $key = $parts[0].Trim()
  $value = $parts[1].Trim().Trim('"')
  [System.Environment]::SetEnvironmentVariable($key, $value, 'Process')
}

$ortDefault = Join-Path $ProjectDir 'vendor/onnxruntime-win-x64/lib/onnxruntime.dll'
if ((-not $env:ORT_DYLIB_PATH -or $env:ORT_DYLIB_PATH -like '*.so' -or $env:ORT_DYLIB_PATH -like '*.dylib') -and (Test-Path $ortDefault)) {
  $env:ORT_DYLIB_PATH = $ortDefault
}

$espeakDataCandidates = @(
  'C:\Program Files\eSpeak NG\espeak-data',
  'C:\Program Files (x86)\eSpeak NG\espeak-data',
  'C:\ProgramData\chocolatey\lib\espeak-ng\tools\eSpeak NG\espeak-data',
  'C:\ProgramData\chocolatey\lib\espeak-ng\tools\espeak-data'
)

if (-not $env:ESPEAK_DATA_PATH -or -not (Test-Path $env:ESPEAK_DATA_PATH)) {
  $espeakDataDir = $espeakDataCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($espeakDataDir) {
    $env:ESPEAK_DATA_PATH = $espeakDataDir
    $env:ESPEAKNG_DATA_PATH = $espeakDataDir
  }
}

$flask = Start-Process -FilePath $pythonExe -ArgumentList 'web.py' -WorkingDirectory $ProjectDir -WindowStyle Hidden -PassThru

try {
  if ($Background) {
    Write-Host 'Starting translator in background mode...'
    & $elixirCmd -S mix run --no-halt
  }
  else {
    Write-Host 'Starting translator...'
    & $iexCmd -S mix
  }
}
finally {
  if ($flask -and -not $flask.HasExited) {
    Stop-Process -Id $flask.Id -Force
  }

  Get-Process audio_engine -ErrorAction SilentlyContinue | Stop-Process -Force
  Get-Process audio_engine.exe -ErrorAction SilentlyContinue | Stop-Process -Force
}
