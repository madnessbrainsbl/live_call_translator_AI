defmodule Translator.MixProject do
  use Mix.Project

  @native_dir Path.join([__DIR__, "native", "audio_engine"])
  @windows_binary_release_attempts 20
  @windows_binary_release_sleep_ms 250

  def project do
    [
      app: :translator,
      version: "0.1.0",
      elixir: "~> 1.14",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      compilers: [:rust] ++ Mix.compilers(),
      aliases: aliases()
    ]
  end

  def application do
    [
      extra_applications: [:logger],
      mod: {Translator.Application, []}
    ]
  end

  defp deps do
    [
      {:jason, "1.4.4"}
    ]
  end

  defp aliases do
    [
      "compile.rust": &compile_rust/1
    ]
  end

  defp compile_rust(_args) do
    native_dir = @native_dir

    if File.dir?(native_dir) do
      native_binary =
        case :os.type() do
          {:win32, _} -> Path.join([native_dir, "target", "release", "audio_engine.exe"])
          _ -> Path.join([native_dir, "target", "release", "audio_engine"])
        end

      force_build? = System.get_env("TRANSLATOR_FORCE_RUST_BUILD") in ["1", "true", "TRUE", "yes"]
      source_newer? = rust_source_newer?(native_dir, native_binary)

      if match?({:win32, _}, :os.type()) and File.exists?(native_binary) and not force_build? and not source_newer? do
        IO.puts("Using existing Rust audio_engine: #{native_binary}")
        {:ok, []}
      else
      path_separator = if match?({:win32, _}, :os.type()), do: ";", else: ":"
      home = System.get_env("HOME") || System.get_env("USERPROFILE") || ""
      system_path = System.get_env("PATH") || ""
      cargo_from_path = System.find_executable("cargo")

      path_entries =
        case :os.type() do
          {:win32, _} ->
            [
              if(cargo_from_path, do: Path.dirname(cargo_from_path)),
              Path.join(home, ".cargo/bin"),
              Path.join(System.get_env("ProgramData") || "C:/ProgramData", "chocolatey/bin"),
              "C:/Windows/System32"
            ]

          _ ->
            [
              Path.join(home, ".cargo/bin"),
              Path.join([__DIR__, ".local", "linux-deps", "root", "usr", "bin"]),
              "/opt/homebrew/opt/rustup/bin",
              system_path
            ]
        end

      path =
        path_entries
        |> Enum.reject(&(&1 in [nil, ""]))
        |> Enum.uniq()
        |> Enum.join(path_separator)

      forwarded_env =
        ["PKG_CONFIG_PATH", "PKG_CONFIG_SYSROOT_DIR", "LD_LIBRARY_PATH", "LIBRARY_PATH", "C_INCLUDE_PATH"]
        |> Enum.reduce([], fn key, acc ->
          case System.get_env(key) do
            nil -> acc
            "" -> acc
            value -> [{key, value} | acc]
          end
        end)

      env =
        [{"PATH", path} | forwarded_env] ++
          case :os.type() do
            {:unix, :darwin} -> [{"MACOSX_DEPLOYMENT_TARGET", "14.0"}]
            _ -> []
          end

      cargo =
        cargo_from_path ||
          Enum.find_value(String.split(path, path_separator), fn dir ->
          candidates = [Path.join(dir, "cargo"), Path.join(dir, "cargo.exe")]
          Enum.find(candidates, &File.exists?/1)
          end) || "cargo"

      {cargo_args, built_binary} = rust_build_plan(native_dir, native_binary)

      IO.puts("Compiling Rust audio_engine...")
      release_windows_native_binary(native_binary)

      case System.cmd(cargo, cargo_args,
             cd: native_dir,
             stderr_to_stdout: true,
             env: env
            ) do
        {output, 0} ->
          IO.puts(output)
          copy_windows_built_binary(built_binary, native_binary)
          IO.puts("Rust audio_engine compiled successfully.")
          {:ok, []}

        {output, code} ->
          IO.puts(output)
          Mix.raise("Rust compilation failed with exit code #{code}")
      end
      end
    else
      IO.puts("Skipping Rust compilation: #{native_dir} not found")
      {:ok, []}
    end
  end

  defp rust_build_plan(native_dir, native_binary) do
    if match?({:win32, _}, :os.type()) do
      windows_target_dir = windows_runtime_target_dir(native_dir)
      built_binary = Path.join([windows_target_dir, "release", "audio_engine.exe"])
      {["build", "--release", "--target-dir", windows_target_dir], built_binary}
    else
      {["build", "--release"], native_binary}
    end
  end

  defp windows_runtime_target_dir(native_dir) do
    Path.join([native_dir, "target", "windows-runtime"])
  end

  defp release_windows_native_binary(native_binary) do
    if match?({:win32, _}, :os.type()) and File.exists?(native_binary) do
      stop_windows_audio_engine()

      case wait_for_windows_binary_release(native_binary, @windows_binary_release_attempts) do
        :ok ->
          :ok

        {:error, reason} ->
          Mix.raise(
            "Windows still refuses write access to #{native_binary}: #{inspect(reason)}. " <>
              "Close the running translator/audio_engine process and retry."
          )
      end
    end
  end

  defp stop_windows_audio_engine do
    System.cmd("taskkill", ["/IM", "audio_engine.exe", "/F", "/T"],
      stderr_to_stdout: true
    )

    :ok
  rescue
    _ -> :ok
  end

  defp wait_for_windows_binary_release(_native_binary, attempts_left) when attempts_left <= 0 do
    {:error, :access_denied}
  end

  defp wait_for_windows_binary_release(native_binary, attempts_left) do
    check_path = "#{native_binary}.compile-check-#{System.unique_integer([:positive])}"

    case File.rename(native_binary, check_path) do
      :ok ->
        case File.rename(check_path, native_binary) do
          :ok -> :ok
          {:error, reason} -> {:error, {:restore_failed, reason}}
        end

      {:error, :enoent} ->
        :ok

      {:error, _reason} ->
        Process.sleep(@windows_binary_release_sleep_ms)
        wait_for_windows_binary_release(native_binary, attempts_left - 1)
    end
  end

  defp copy_windows_built_binary(built_binary, native_binary) do
    if match?({:win32, _}, :os.type()) do
      copy_windows_built_binary(built_binary, native_binary, @windows_binary_release_attempts)
    end
  end

  defp copy_windows_built_binary(_built_binary, _native_binary, attempts_left)
       when attempts_left <= 0 do
    Mix.raise("Failed to replace Rust audio_engine.exe after repeated attempts")
  end

  defp copy_windows_built_binary(built_binary, native_binary, attempts_left) do
    stop_windows_audio_engine()

    with :ok <- remove_windows_binary(native_binary),
         :ok <- File.mkdir_p(Path.dirname(native_binary)),
         :ok <- File.cp(built_binary, native_binary) do
      :ok
    else
      {:error, _reason} ->
        Process.sleep(@windows_binary_release_sleep_ms)
        copy_windows_built_binary(built_binary, native_binary, attempts_left - 1)
    end
  end

  defp remove_windows_binary(native_binary) do
    case File.rm(native_binary) do
      :ok -> :ok
      {:error, :enoent} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  defp rust_source_newer?(native_dir, native_binary) do
    with {:ok, %{mtime: binary_mtime}} <- File.stat(native_binary, time: :posix) do
      native_sources(native_dir)
      |> Enum.any?(fn path ->
        case File.stat(path, time: :posix) do
          {:ok, %{mtime: source_mtime}} -> source_mtime > binary_mtime
          {:error, _} -> false
        end
      end)
    else
      {:error, _} -> true
    end
  end

  defp native_sources(native_dir) do
    Path.wildcard(Path.join([native_dir, "src", "**", "*.rs"])) ++
      [
        Path.join(native_dir, "Cargo.toml"),
        Path.join(native_dir, "Cargo.lock"),
        Path.join(native_dir, "build.rs")
      ]
  end
end
