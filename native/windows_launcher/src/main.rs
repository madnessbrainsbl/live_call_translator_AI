use std::collections::HashMap;
use std::env;
use std::ffi::OsString;
use std::fs;
use std::io::{self, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn main() {
    if let Err(err) = run() {
        eprintln!("Live Call Translator failed: {err}");
        eprintln!();
        eprintln!("Press Enter to close this window.");
        let _ = io::stdin().read_line(&mut String::new());
        std::process::exit(1);
    }
}

fn run() -> io::Result<()> {
    let no_window = env::args().any(|arg| arg == "--no-window" || arg == "--no-browser");
    let exe = env::current_exe()?;
    let app_root = exe
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::Other, "cannot resolve app root"))?
        .to_path_buf();

    env::set_current_dir(&app_root)?;
    let envs = build_env(&app_root)?;

    println!("Starting Live Call Translator...");
    stop_release(&app_root, &envs);
    kill_process("audio_engine.exe");

    let mut web = start_web_ui(&app_root, &envs)?;
    let mut translator = start_translator(&app_root, &envs)?;

    wait_for_port("127.0.0.1:5050", Duration::from_secs(45))?;
    if !no_window {
        open_app_window(&app_root)?;
    }

    println!();
    println!("Live Call Translator is running.");
    println!("UI: http://127.0.0.1:5050");
    if no_window {
        println!("Started without opening a browser window.");
    } else {
        println!("Close the app window, then press Enter here to stop the backend.");
    }
    let _ = io::stdout().flush();
    let _ = io::stdin().read_line(&mut String::new());

    println!("Stopping...");
    stop_release(&app_root, &envs);
    stop_child(&mut translator);
    stop_child(&mut web);
    kill_process("audio_engine.exe");
    Ok(())
}

fn build_env(app_root: &Path) -> io::Result<HashMap<String, OsString>> {
    let mut envs = HashMap::new();
    let local_temp = app_root.join(".tmp");
    fs::create_dir_all(&local_temp)?;

    let bin = app_root.join("bin");
    let ort_lib = app_root
        .join("vendor")
        .join("onnxruntime-win-x64")
        .join("lib");
    let espeak = app_root.join("espeak-ng");
    let path = prepend_path(&[bin.clone(), ort_lib.clone(), espeak.clone()]);

    envs.insert("PATH".to_string(), OsString::from(path));
    envs.insert("TEMP".to_string(), local_temp.clone().into_os_string());
    envs.insert("TMP".to_string(), local_temp.clone().into_os_string());
    envs.insert("TMPDIR".to_string(), local_temp.into_os_string());
    envs.insert(
        "TRANSLATOR_APP_ROOT".to_string(),
        app_root.as_os_str().to_os_string(),
    );
    envs.insert(
        "TRANSLATOR_MODELS_DIR".to_string(),
        app_root.join("models").into_os_string(),
    );
    envs.insert(
        "TRANSLATOR_AUDIO_ENGINE_PATH".to_string(),
        bin.join("audio_engine.exe").into_os_string(),
    );
    envs.insert(
        "ORT_DYLIB_PATH".to_string(),
        ort_lib.join("onnxruntime.dll").into_os_string(),
    );
    envs.insert(
        "ESPEAK_NG_PATH".to_string(),
        espeak.join("espeak-ng.exe").into_os_string(),
    );
    envs.insert("ESPEAK_BIN_PATH".to_string(), espeak.clone().into_os_string());
    envs.insert(
        "ESPEAK_DATA_PATH".to_string(),
        espeak.join("espeak-ng-data").into_os_string(),
    );
    envs.insert(
        "ESPEAKNG_DATA_PATH".to_string(),
        espeak.join("espeak-ng-data").into_os_string(),
    );

    import_dotenv(&app_root.join(".env"), &mut envs);
    Ok(envs)
}

fn prepend_path(paths: &[PathBuf]) -> OsString {
    let mut parts: Vec<PathBuf> = paths
        .iter()
        .filter(|path| path.exists())
        .cloned()
        .collect();

    if let Some(current) = env::var_os("PATH") {
        parts.extend(env::split_paths(&current));
    }

    env::join_paths(parts).unwrap_or_else(|_| env::var_os("PATH").unwrap_or_default())
}

fn import_dotenv(path: &Path, envs: &mut HashMap<String, OsString>) {
    let Ok(contents) = fs::read_to_string(path) else {
        return;
    };

    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        envs.insert(
            key.trim().to_string(),
            OsString::from(value.trim().trim_matches('"')),
        );
    }
}

fn start_web_ui(app_root: &Path, envs: &HashMap<String, OsString>) -> io::Result<Child> {
    let web = app_root.join("web-ui").join("web-ui.exe");
    if !web.exists() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("missing {}", web.display()),
        ));
    }

    hidden_command(web, Vec::<OsString>::new(), app_root, envs).spawn()
}

fn start_translator(app_root: &Path, envs: &HashMap<String, OsString>) -> io::Result<Child> {
    let release = app_root.join("elixir").join("bin").join("translator.bat");
    if !release.exists() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("missing {}", release.display()),
        ));
    }

    hidden_command(
        "cmd.exe",
        [
            "/C".into(),
            "call".into(),
            release.into_os_string(),
            "start".into(),
        ],
        app_root,
        envs,
    )
    .spawn()
}

fn stop_release(app_root: &Path, envs: &HashMap<String, OsString>) {
    let release = app_root.join("elixir").join("bin").join("translator.bat");
    if !release.exists() {
        return;
    }

    let _ = hidden_command(
        "cmd.exe",
        [
            "/C".into(),
            "call".into(),
            release.into_os_string(),
            "stop".into(),
        ],
        app_root,
        envs,
    )
    .status();
}

fn hidden_command<I, S>(
    program: impl Into<OsString>,
    args: I,
    cwd: &Path,
    envs: &HashMap<String, OsString>,
) -> Command
where
    I: IntoIterator<Item = S>,
    S: Into<OsString>,
{
    let mut command = Command::new(program.into());
    command.current_dir(cwd);
    command.args(args.into_iter().map(Into::into));
    command.envs(envs);
    command.stdin(Stdio::null());
    command.stdout(Stdio::null());
    command.stderr(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

fn wait_for_port(addr: &str, timeout: Duration) -> io::Result<()> {
    let deadline = Instant::now() + timeout;
    let mut addrs = addr.to_socket_addrs()?;
    let socket_addr = addrs
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "bad address"))?;

    while Instant::now() < deadline {
        if TcpStream::connect_timeout(&socket_addr, Duration::from_millis(500)).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(500));
    }

    Err(io::Error::new(
        io::ErrorKind::TimedOut,
        "web UI did not start on 127.0.0.1:5050",
    ))
}

fn open_app_window(app_root: &Path) -> io::Result<()> {
    let url = "http://127.0.0.1:5050";
    let user_data = app_root.join(".browser-profile");
    let mut candidates = Vec::new();

    if let Some(program_files) = env::var_os("ProgramFiles") {
        let base = PathBuf::from(program_files);
        candidates.push(
            base.join("Microsoft")
                .join("Edge")
                .join("Application")
                .join("msedge.exe"),
        );
        candidates.push(
            base.join("Google")
                .join("Chrome")
                .join("Application")
                .join("chrome.exe"),
        );
    }
    if let Some(program_files_x86) = env::var_os("ProgramFiles(x86)") {
        let base = PathBuf::from(program_files_x86);
        candidates.push(
            base.join("Microsoft")
                .join("Edge")
                .join("Application")
                .join("msedge.exe"),
        );
        candidates.push(
            base.join("Google")
                .join("Chrome")
                .join("Application")
                .join("chrome.exe"),
        );
    }

    for browser in candidates {
        if browser.exists() {
            Command::new(browser)
                .arg(format!("--app={url}"))
                .arg(format!("--user-data-dir={}", user_data.display()))
                .spawn()?;
            return Ok(());
        }
    }

    Command::new("cmd.exe")
        .args(["/C", "start", "", url])
        .spawn()?;
    Ok(())
}

fn stop_child(child: &mut Child) {
    match child.try_wait() {
        Ok(Some(_)) => {}
        _ => {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn kill_process(image_name: &str) {
    let _ = Command::new("taskkill.exe")
        .args(["/IM", image_name, "/F", "/T"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}
