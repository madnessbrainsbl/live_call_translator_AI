defmodule Translator.MixProject do
  use Mix.Project

  @native_dir Path.join([__DIR__, "native", "audio_engine"])

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

      if match?({:win32, _}, :os.type()) and File.exists?(native_binary) and not force_build? do
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

      IO.puts("Compiling Rust audio_engine...")

      case System.cmd(cargo, ["build", "--release"],
             cd: native_dir,
             stderr_to_stdout: true,
             env: env
            ) do
        {output, 0} ->
          IO.puts(output)
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
end
