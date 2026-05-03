"""Helper functions: LLM APIs, engine commands, voice catalog, audio devices."""

import os
import json
import glob
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from collections import defaultdict

from .settings import (
    GROQ_MODEL, GROQ_CHAT_URL, OPENROUTER_CHAT_URL, PIPER_VOICES_URL,
    USER_AGENT, CMD_HOST, CMD_PORT, MODELS_DIR, DEFAULT_VOICES, VOICE_CATALOG_CACHE_FILE,
    DEFAULT_CODEX_MODEL, get_openrouter_model,
)


def _content_to_text(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)):
        return str(value).strip()
    if isinstance(value, list):
        parts = []
        for item in value:
            if isinstance(item, dict):
                text = (
                    item.get("text")
                    or item.get("content")
                    or item.get("value")
                    or item.get("output_text")
                )
                if text:
                    parts.append(str(text).strip())
            elif item is not None:
                parts.append(str(item).strip())
        return "\n".join(part for part in parts if part).strip()
    if isinstance(value, dict):
        for key in ("text", "content", "value", "output_text"):
            text = _content_to_text(value.get(key))
            if text:
                return text
    return str(value).strip()


def _extract_chat_response(result, provider):
    choices = result.get("choices") if isinstance(result, dict) else None
    if not choices:
        error = result.get("error") if isinstance(result, dict) else None
        if isinstance(error, dict):
            message = error.get("message") or error.get("code") or error
            raise RuntimeError(f"{provider} error: {message}")
        raise RuntimeError(f"{provider} returned no choices")

    choice = choices[0] or {}
    message = choice.get("message") or {}
    for value in (
        message.get("content"),
        message.get("refusal"),
        choice.get("text"),
        (choice.get("delta") or {}).get("content"),
    ):
        text = _content_to_text(value)
        if text:
            return text

    finish = choice.get("finish_reason") or choice.get("native_finish_reason")
    if _content_to_text(message.get("reasoning")):
        raise RuntimeError(f"{provider} returned reasoning but no final answer")
    if finish:
        raise RuntimeError(f"{provider} returned empty content (finish_reason={finish})")
    raise RuntimeError(f"{provider} returned empty content")


def call_groq(messages, api_key, temperature=0.1, max_tokens=None, timeout=10):
    body = {"model": GROQ_MODEL, "messages": messages, "temperature": temperature}
    if max_tokens:
        body["max_tokens"] = max_tokens
    req = urllib.request.Request(
        GROQ_CHAT_URL,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        result = json.loads(resp.read().decode())
    return _extract_chat_response(result, "Groq")


def call_openrouter(messages, api_key, temperature=0.3, max_tokens=None, timeout=15, model=None):
    body = {
        "model": (model or get_openrouter_model()).strip(),
        "messages": messages,
        "temperature": temperature,
        "reasoning": {
            "effort": "none",
            "exclude": True,
        },
    }
    if max_tokens:
        body["max_completion_tokens"] = max_tokens
    req = urllib.request.Request(
        OPENROUTER_CHAT_URL,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://127.0.0.1:5050",
            "X-Title": "Live Translator",
            "User-Agent": USER_AGENT,
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        result = json.loads(resp.read().decode())
    return _extract_chat_response(result, "OpenRouter")


def _codex_command_prefix():
    env_path = os.environ.get("CODEX_BIN", "").strip()
    appdata = os.environ.get("APPDATA", "")
    candidates = [
        env_path,
        shutil.which("codex.cmd"),
        shutil.which("codex.exe"),
        shutil.which("codex"),
    ]
    if appdata:
        candidates.extend([
            os.path.join(appdata, "npm", "codex.cmd"),
            os.path.join(appdata, "npm", "codex.ps1"),
        ])

    for candidate in candidates:
        if not candidate:
            continue
        path = os.path.abspath(candidate) if os.path.sep in candidate or "/" in candidate else candidate
        if path == candidate and not os.path.exists(path):
            return [candidate]
        if not os.path.exists(path):
            continue
        if path.lower().endswith(".ps1"):
            shell = shutil.which("pwsh.exe") or shutil.which("powershell.exe") or "powershell.exe"
            return [shell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path]
        return [path]

    return ["codex"]


def _codex_auth_file_status():
    codex_home = os.environ.get("CODEX_HOME") or os.path.join(os.path.expanduser("~"), ".codex")
    auth_path = os.path.join(codex_home, "auth.json")
    try:
        with open(auth_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        tokens = data.get("tokens") if isinstance(data, dict) else {}
        has_chatgpt_tokens = (
            data.get("auth_mode") == "chatgpt"
            and isinstance(tokens, dict)
            and bool(tokens.get("refresh_token"))
        )
        if has_chatgpt_tokens:
            return {"available": True, "logged_in": True, "message": "Codex ChatGPT auth found"}
    except Exception:
        pass
    return {"available": False, "logged_in": False, "message": "Codex auth not found"}


def codex_cli_status(timeout=8):
    cmd = _codex_command_prefix() + ["login", "status"]
    auth_file = _codex_auth_file_status()
    try:
        proc = subprocess.run(
            cmd,
            text=True,
            capture_output=True,
            timeout=timeout,
            stdin=subprocess.DEVNULL,
            env=_codex_subprocess_env(),
        )
    except FileNotFoundError:
        return {"available": False, "logged_in": False, "message": "codex CLI not found"}
    except subprocess.TimeoutExpired:
        if auth_file["logged_in"]:
            return auth_file
        return {"available": True, "logged_in": False, "message": "codex login status timed out"}

    output = (proc.stdout + "\n" + proc.stderr).strip()
    lower = output.lower()
    logged_in = proc.returncode == 0 and "not logged in" not in lower
    if not logged_in and auth_file["logged_in"]:
        return auth_file
    return {"available": True, "logged_in": logged_in, "message": output or "codex CLI is available"}


def _codex_subprocess_env():
    env = os.environ.copy()
    env.pop("CODEX_SANDBOX_NETWORK_DISABLED", None)
    env.pop("CODEX_INTERNAL_ORIGINATOR_OVERRIDE", None)
    user_home = os.environ.get("USERPROFILE") or os.path.expanduser("~")
    env["HOME"] = user_home
    env["USERPROFILE"] = user_home
    env.setdefault("CODEX_HOME", os.path.join(user_home, ".codex"))
    return env


def _sanitize_codex_error(output):
    text = (output or "").strip()
    lower = text.lower()
    if "not supported when using codex with a chatgpt account" in lower:
        return "This Codex model is not supported by ChatGPT login. Use gpt-5.4 or gpt-5.4-mini."
    if "requires a newer version of codex" in lower or "model requires a newer version" in lower:
        return f"Codex model is not supported by this CLI version. Using {DEFAULT_CODEX_MODEL} is recommended."
    if "input is not valid utf-8" in lower:
        return "Codex rejected the prompt encoding. Restart the app so the UTF-8 fix is active."
    if (
        "failed to clean up stale arg0" in lower
        or "failed to install system skills" in lower
        or "could not update path" in lower
        or "os error 5" in lower
    ):
        return "Codex CLI could not access its local cache. Close other Codex processes or restart PowerShell, then try again."
    if "not logged in" in lower or "login" in lower and "codex" in lower:
        return "Codex is not logged in. Run codex login in PowerShell."
    if "timed out" in lower:
        return "Codex CLI timed out."
    if "no last agent message" in lower or "wrote empty content" in lower:
        return "Codex returned no answer."
    if "http 400" in lower or "bad request" in lower:
        return f"Codex request failed. Check the selected model or use {DEFAULT_CODEX_MODEL}."

    lines = []
    blocked_markers = (
        "SYSTEM:",
        "USER:",
        "ASSISTANT:",
        "Me speaks",
        "Them speaks",
        "Latest (",
        "Recent transcript",
        "You are being used",
    )
    for line in text.splitlines():
        clean = line.strip()
        if not clean:
            continue
        if any(marker in clean for marker in blocked_markers):
            break
        lower_line = clean.lower()
        if (
            "error" in lower_line
            or "failed" in lower_line
            or "warning" in lower_line
            or "timed out" in lower_line
        ):
            lines.append(clean)
        if len(lines) >= 3:
            break
    if lines:
        return " ".join(lines)[:400]
    return "Codex CLI failed."


def _is_safe_codex_answer(text):
    clean = (text or "").strip()
    if not clean:
        return False
    blocked_markers = (
        "SYSTEM:",
        "USER:",
        "ASSISTANT:",
        "Recent transcript",
        "You are being used",
        "Me speaks",
        "Them speaks",
    )
    if any(marker in clean for marker in blocked_markers):
        return False
    lower = clean.lower()
    if lower.startswith(("warning:", "error:", "usage:", "thread/start failed")):
        return False
    if "codex_core::" in lower or "jsonrpcerror" in lower:
        return False
    return True


def _codex_json_text_candidates(value):
    candidates = []
    if isinstance(value, dict):
        message = value.get("message")
        role = str(
            value.get("role")
            or (message.get("role") if isinstance(message, dict) else "")
            or ""
        ).lower()
        event_type = str(
            value.get("type")
            or value.get("event")
            or value.get("method")
            or ""
        ).lower()
        is_answer_event = (
            role == "assistant"
            or "assistant" in event_type
            or "agent_message" in event_type
            or "final" in event_type
        )
        if is_answer_event:
            for key in ("content", "text", "message", "output_text", "last_message", "answer"):
                text = _content_to_text(value.get(key))
                if _is_safe_codex_answer(text):
                    candidates.append(text)
        for nested in value.values():
            candidates.extend(_codex_json_text_candidates(nested))
    elif isinstance(value, list):
        for item in value:
            candidates.extend(_codex_json_text_candidates(item))
    return candidates


def _extract_codex_stdout_answer(stdout):
    stdout = stdout or ""
    candidates = []
    plain_lines = []
    for line in stdout.splitlines():
        clean = line.strip()
        if not clean:
            continue
        try:
            parsed = json.loads(clean)
        except json.JSONDecodeError:
            if not clean.startswith("{") and _is_safe_codex_answer(clean):
                plain_lines.append(clean)
            continue
        candidates.extend(_codex_json_text_candidates(parsed))
    if candidates:
        return candidates[-1].strip()
    plain = "\n".join(plain_lines).strip()
    return plain if _is_safe_codex_answer(plain) else ""


def call_codex_cli(messages, model="", timeout=45):
    prompt_parts = [
        "You are being used as a text-only answer generator for a live interview assistant.",
        "Do not inspect files, run commands, edit files, or mention Codex.",
        "Follow the SYSTEM and USER messages exactly. Return only the final answer text.",
    ]
    for msg in messages:
        role = str(msg.get("role") or "user").upper()
        content = _content_to_text(msg.get("content"))
        if content:
            prompt_parts.append(f"{role}:\n{content}")
    prompt = "\n\n".join(prompt_parts).strip()

    with tempfile.TemporaryDirectory(prefix="speaker-codex-") as tmpdir:
        output_path = os.path.join(tmpdir, "answer.txt")
        cmd = _codex_command_prefix() + [
            "exec",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--json",
            "--cd",
            tmpdir,
            "--output-last-message",
            output_path,
            "--color",
            "never",
            "--config",
            'model_reasoning_effort="low"',
        ]
        model = (model or DEFAULT_CODEX_MODEL).strip() or DEFAULT_CODEX_MODEL
        cmd.extend(["--model", model])
        cmd.append("-")

        try:
            proc = subprocess.run(
                cmd,
                input=prompt,
                text=True,
                encoding="utf-8",
                errors="replace",
                capture_output=True,
                timeout=timeout,
                env=_codex_subprocess_env(),
            )
        except FileNotFoundError as exc:
            raise RuntimeError("codex CLI not found") from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(_sanitize_codex_error("codex CLI timed out")) from exc

        answer = ""
        if os.path.exists(output_path):
            with open(output_path, "r", encoding="utf-8", errors="replace") as f:
                answer = f.read().strip()
        if answer:
            return answer

        stdout_answer = _extract_codex_stdout_answer(proc.stdout)
        if stdout_answer:
            return stdout_answer

        output = "\n".join(part for part in (proc.stderr, proc.stdout) if part).strip()
        if proc.returncode != 0:
            raise RuntimeError(_sanitize_codex_error(output or f"codex CLI exited with {proc.returncode}"))
        raise RuntimeError("Codex request completed but returned no assistant text.")


def send_engine_command(cmd, timeout=10):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        s.connect((CMD_HOST, CMD_PORT))
        s.send((cmd + "\n").encode())
        # Read full response (may be large for audio data)
        chunks = []
        while True:
            try:
                chunk = s.recv(65536)
                if not chunk:
                    break
                chunks.append(chunk)
            except socket.timeout:
                break
        s.close()
        return b"".join(chunks).decode().strip()
    except Exception as e:
        return f"error:{e}"


# Piper voice catalog -- fetched once at startup, cached
_voice_catalog = None
_voice_catalog_loaded_at = 0.0
_voice_catalog_failed_at = 0.0
_VOICE_CATALOG_TTL_SEC = 3600
_VOICE_CATALOG_RETRY_SEC = 30


def _build_voice_catalog(data):
    catalog = defaultdict(list)
    for key, info in data.items():
        family = info["language"]["family"]
        files = info.get("files", {})
        total_size = sum(f.get("size_bytes", 0) for f in files.values())
        file_list = []
        for fpath in files:
            file_list.append({
                "url": f"{PIPER_VOICES_URL}/{fpath}",
                "path": fpath.split("/")[-1],
                "size": files[fpath].get("size_bytes", 0),
            })
        catalog[family].append({
            "name": key,
            "quality": info.get("quality", ""),
            "size": total_size,
            "files": file_list,
        })
    return dict(catalog)


def _load_cached_voice_catalog():
    try:
        if not os.path.exists(VOICE_CATALOG_CACHE_FILE):
            return None, 0.0
        with open(VOICE_CATALOG_CACHE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        loaded_at = os.path.getmtime(VOICE_CATALOG_CACHE_FILE)
        return _build_voice_catalog(data), loaded_at
    except Exception:
        return None, 0.0


def _write_voice_catalog_cache(data):
    try:
        with open(VOICE_CATALOG_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception:
        pass


def _fallback_voice_catalog():
    catalog = defaultdict(list)
    for family, voice_key in DEFAULT_VOICES.items():
        parts = voice_key.split("-")
        if len(parts) < 3:
            continue
        code = parts[0]
        quality = parts[-1]
        voice_name = "-".join(parts[1:-1])
        base = f"{family}/{code}/{voice_name}/{quality}"
        catalog[family].append({
            "name": voice_key,
            "quality": quality,
            "size": 0,
            "files": [
                {
                    "url": f"{PIPER_VOICES_URL}/{base}/{voice_key}.onnx",
                    "path": f"{voice_key}.onnx",
                    "size": 0,
                },
                {
                    "url": f"{PIPER_VOICES_URL}/{base}/{voice_key}.onnx.json",
                    "path": f"{voice_key}.onnx.json",
                    "size": 0,
                },
            ],
        })
    return dict(catalog)


def get_voice_catalog():
    """Fetch and cache the full Piper voices.json from HuggingFace."""
    global _voice_catalog, _voice_catalog_loaded_at, _voice_catalog_failed_at

    now = time.time()
    if _voice_catalog is not None and (now - _voice_catalog_loaded_at) < _VOICE_CATALOG_TTL_SEC:
        return _voice_catalog

    cached_catalog, cached_loaded_at = _load_cached_voice_catalog()
    if cached_catalog is not None and (now - cached_loaded_at) < _VOICE_CATALOG_TTL_SEC:
        _voice_catalog = cached_catalog
        _voice_catalog_loaded_at = cached_loaded_at
        return _voice_catalog

    if _voice_catalog_failed_at and (now - _voice_catalog_failed_at) < _VOICE_CATALOG_RETRY_SEC:
        return _voice_catalog or cached_catalog or _fallback_voice_catalog()

    try:
        req = urllib.request.Request(
            f"{PIPER_VOICES_URL}/voices.json",
            headers={"User-Agent": USER_AGENT},
        )
        data = json.loads(urllib.request.urlopen(req, timeout=60).read())
        _voice_catalog = _build_voice_catalog(data)
        _write_voice_catalog_cache(data)
        _voice_catalog_loaded_at = now
        _voice_catalog_failed_at = 0.0
        return _voice_catalog
    except Exception:
        _voice_catalog_failed_at = now
        return _voice_catalog or cached_catalog or _fallback_voice_catalog()


def scan_voices():
    voices = {}
    for d in sorted(glob.glob(os.path.join(MODELS_DIR, "piper-*"))):
        lang = os.path.basename(d).replace("piper-", "")
        voice_list = []
        for onnx in sorted(glob.glob(os.path.join(d, "*.onnx"))):
            voice_list.append(os.path.basename(onnx).replace(".onnx", ""))
        if voice_list:
            voices[lang] = voice_list
    return voices


def _required_voice_files(voice):
    return [
        f for f in voice.get("files", [])
        if f.get("path", "").endswith(".onnx") or f.get("path", "").endswith(".onnx.json")
    ]


def voice_files_complete(target_dir, voice):
    for fi in _required_voice_files(voice):
        dest = os.path.join(target_dir, fi["path"])
        if not os.path.exists(dest):
            return False

        expected_size = fi.get("size", 0)
        if expected_size and os.path.getsize(dest) != expected_size:
            return False

    return True


def invalid_voice_files(target_dir, voice):
    invalid = []
    for fi in _required_voice_files(voice):
        dest = os.path.join(target_dir, fi["path"])
        expected_size = fi.get("size", 0)
        if not os.path.exists(dest):
            invalid.append(fi)
            continue
        if expected_size and os.path.getsize(dest) != expected_size:
            invalid.append(fi)
    return invalid


def list_audio_devices():
    if sys.platform.startswith("linux"):
        return _list_linux_alsa_devices()

    if sys.platform.startswith("win"):
        return _list_windows_audio_devices()

    if sys.platform == "darwin":
        devices = _list_macos_audio_devices()
        return {"input": devices, "output": devices}

    return {"input": [], "output": []}


def _list_macos_audio_devices():
    try:
        r = subprocess.run(
            ["system_profiler", "SPAudioDataType", "-json"],
            capture_output=True, text=True, timeout=5,
        )
        data = json.loads(r.stdout)
        devices = set()
        for section in data.get("SPAudioDataType", []):
            for item in section.get("_items", []):
                name = item.get("_name", "")
                if name:
                    devices.add(name)
        return sorted(devices)
    except Exception:
        return []


def _list_linux_alsa_devices():
    try:
        inputs = _alsa_device_names(["arecord", "-L"])
        outputs = _alsa_device_names(["aplay", "-L"])
        return {"input": inputs, "output": outputs}
    except Exception:
        return {"input": [], "output": []}


def _list_windows_audio_devices():
    try:
        script = (
            "$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
            "$ErrorActionPreference='Stop'; "
            "Get-PnpDevice -Class AudioEndpoint | "
            "Where-Object { $_.Status -eq 'OK' -and $_.FriendlyName } | "
            "Sort-Object -Property FriendlyName | "
            "Select-Object -ExpandProperty FriendlyName"
        )
        r = subprocess.run(
            ["powershell", "-NoProfile", "-Command", script],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            check=True,
        )
        names = []
        seen = set()
        for line in r.stdout.splitlines():
            name = line.strip().replace("\x00", "")
            if name and name not in seen:
                names.append(name)
                seen.add(name)
    except Exception:
        names = []

    def is_input_name(name):
        lower = name.lower()
        return (
            "microphone" in lower
            or "mic" in lower
            or "микрофон" in lower
            or "line in" in lower
            or "linein" in lower
            or "cable-a output" in lower
            or "cable-b output" in lower
            or "cable output" in lower
        )

    def is_output_name(name):
        lower = name.lower()
        return (
            "speaker" in lower
            or "headphone" in lower
            or "динам" in lower
            or "науш" in lower
            or "cable-a input" in lower
            or "cable-b input" in lower
            or "cable input" in lower
        )

    ordered_inputs = []
    ordered_outputs = []
    seen_inputs = set()
    seen_outputs = set()

    for name in [n for n in names if is_input_name(n)]:
        if name not in seen_inputs:
            ordered_inputs.append(name)
            seen_inputs.add(name)

    for name in [n for n in names if is_output_name(n)]:
        if name not in seen_outputs:
            ordered_outputs.append(name)
            seen_outputs.add(name)

    return {"input": ordered_inputs, "output": ordered_outputs}


def _alsa_device_names(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=5, check=True)
    names = []
    for line in r.stdout.splitlines():
        if not line or line[:1].isspace():
            continue
        names.append(line.strip())

    preferred = [
        "translator_mic_in",
        "translator_speaker_out",
        "translator_call_in",
        "translator_call_out",
        "pipewire",
    ]

    seen = set()
    ordered = []
    for name in preferred + names:
        if name in names and name not in seen:
            ordered.append(name)
            seen.add(name)

    return ordered
