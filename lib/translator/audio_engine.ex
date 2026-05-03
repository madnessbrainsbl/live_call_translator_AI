defmodule Translator.AudioEngine do
  @moduledoc """
  GenServer wrapping the Rust audio_engine binary via an Erlang Port.

  Communicates using 4-byte length-prefixed JSON protocol (`{:packet, 4}`).
  Handles Port crashes with automatic restart after a delay.
  """

  use GenServer
  require Logger

  @restart_delay_ms 2_000

  @log_file "test-log.txt"

  defstruct [:port, status: :idle, pipelines: [], devices: %{"input" => [], "output" => []}]

  # --- Client API ---

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @spec start_pipelines(list(String.t())) :: :ok | {:error, term()}
  def start_pipelines(pipelines \\ ["outgoing", "incoming"]) do
    config = Translator.Config.get_all()

    GenServer.call(__MODULE__, {:start_pipelines, pipelines, config})
  end

  @spec stop_pipelines() :: :ok | {:error, term()}
  def stop_pipelines do
    GenServer.call(__MODULE__, :stop_pipelines)
  end

  @spec status() :: map()
  def status do
    GenServer.call(__MODULE__, :status)
  end

  @spec set_config(atom(), term()) :: :ok | {:error, term()}
  def set_config(key, value) do
    Translator.Config.put(key, value)

    GenServer.call(__MODULE__, {:set_config, key, value})
  end

  @spec send_command(map()) :: :ok | {:error, term()}
  def send_command(command) when is_map(command) do
    GenServer.call(__MODULE__, {:send_command, command})
  end

  @spec pop_audio() :: list(map())
  def pop_audio do
    GenServer.call(__MODULE__, :pop_audio)
  end

  @spec get_devices() :: map()
  def get_devices do
    GenServer.call(__MODULE__, :get_devices)
  end

  @spec restart_engine_async() :: :ok
  def restart_engine_async do
    GenServer.cast(__MODULE__, :restart_engine)
  end

  # --- Server Callbacks ---

  @impl true
  def init(_opts) do
    case open_port() do
      {:ok, port} ->
        Logger.info("AudioEngine started, port opened")
        send_to_port(port, %{"cmd" => "list_devices"})
        {:ok, %__MODULE__{port: port, status: :idle}}

      {:error, reason} ->
        Logger.error("AudioEngine failed to open port: #{inspect(reason)}")
        {:ok, %__MODULE__{port: nil, status: :crashed}}
    end
  end

  @impl true
  def handle_call({:start_pipelines, _pipelines, _config}, _from, %{port: nil} = state) do
    Logger.error("Cannot start pipelines: engine port is not open")
    {:reply, {:error, :port_not_open}, state}
  end

  def handle_call({:start_pipelines, pipelines, _config}, _from, %{status: status} = state)
      when status in [:starting, :running] do
    Logger.debug("Ignoring duplicate start request while engine is #{status}")
    {:reply, :ok, %{state | pipelines: Enum.uniq(state.pipelines ++ pipelines)}}
  end

  def handle_call({:start_pipelines, pipelines, config}, _from, state) do
    log_to_file("→ Port start pipelines=#{inspect(pipelines)}")
    command = %{
      "cmd" => "start",
      "pipelines" => pipelines,
      "config" => encode_config(config)
    }

    send_to_port(state.port, command)
    {:reply, :ok, %{state | status: :starting, pipelines: pipelines}}
  end

  @impl true
  def handle_call(:stop_pipelines, _from, %{port: nil} = state) do
    {:reply, {:error, :port_not_open}, state}
  end

  def handle_call(:stop_pipelines, _from, state) do
    log_to_file("→ Port stop")
    command = %{"cmd" => "stop"}
    send_to_port(state.port, command)
    {:reply, :ok, %{state | status: :stopping}}
  end

  @impl true
  def handle_call(:status, _from, state) do
    {:reply, %{status: state.status, pipelines: state.pipelines}, state}
  end

  @impl true
  def handle_call({:set_config, _key, _value}, _from, %{port: nil} = state) do
    {:reply, {:error, :port_not_open}, state}
  end

  def handle_call({:set_config, key, value}, _from, state) do
    command = %{
      "cmd" => "set_config",
      "key" => to_string(key),
      "value" => value
    }

    send_to_port(state.port, command)
    {:reply, :ok, state}
  end

  @impl true
  def handle_call(:pop_audio, _from, state) do
    queue = Process.get(:audio_queue, [])
    Process.put(:audio_queue, [])
    {:reply, queue, state}
  end

  @impl true
  def handle_call(:get_devices, _from, state) do
    {:reply, state.devices, state}
  end

  @impl true
  def handle_call({:send_command, _command}, _from, %{port: nil} = state) do
    {:reply, {:error, :port_not_open}, state}
  end

  def handle_call({:send_command, command}, _from, state) do
    log_to_file("→ Port send #{inspect(command)}")
    send_to_port(state.port, command)
    {:reply, :ok, state}
  end

  # --- Port message handling ---

  @impl true
  def handle_cast(:restart_engine, state) do
    Logger.info("Restarting engine (async)...")

    if state.port do
      try do
        send_to_port(state.port, %{"cmd" => "stop"})
        Process.sleep(500)
        Port.close(state.port)
      rescue
        _ -> :ok
      catch
        _, _ -> :ok
      end
    end

    Process.sleep(1000)

    case open_port() do
      {:ok, port} ->
        Logger.info("Engine restarted")
        send_to_port(port, %{"cmd" => "list_devices"})
        {:noreply, %{state | port: port, status: :idle, pipelines: []}}

      {:error, reason} ->
        Logger.error("Failed to restart engine: #{inspect(reason)}")
        Process.send_after(self(), :restart_engine, @restart_delay_ms)
        {:noreply, %{state | port: nil, status: :crashed, pipelines: []}}
    end
  end

  @impl true
  def handle_info({port, {:data, data}}, %{port: port} = state) do
    case Jason.decode(data) do
      {:ok, event} ->
        new_state = dispatch_event(event, state)
        {:noreply, new_state}

      {:error, reason} ->
        Logger.warning("Failed to decode JSON from engine: #{inspect(reason)}")
        {:noreply, state}
    end
  end

  @impl true
  def handle_info({port, {:exit_status, status}}, %{port: port} = state) do
    Logger.error("AudioEngine Rust process exited with status #{status}")
    log_to_file("✖ AudioEngine exit_status=#{status}")
    Process.send_after(self(), :restart_engine, @restart_delay_ms)
    {:noreply, %{state | port: nil, status: :crashed}}
  end

  @impl true
  def handle_info(:restart_engine, state) do
    Logger.info("Attempting to restart AudioEngine Rust process...")
    log_to_file("↻ Restarting AudioEngine process")

    case open_port() do
      {:ok, port} ->
        Logger.info("AudioEngine restarted successfully")
        log_to_file("✓ AudioEngine restarted successfully")
        send_to_port(port, %{"cmd" => "list_devices"})
        {:noreply, %{state | port: port, status: :idle}}

      {:error, reason} ->
        Logger.error("Failed to restart AudioEngine: #{inspect(reason)}")
        Process.send_after(self(), :restart_engine, @restart_delay_ms)
        {:noreply, %{state | port: nil, status: :crashed}}
    end
  end

  @impl true
  def handle_info(msg, state) do
    Logger.debug("AudioEngine received unexpected message: #{inspect(msg)}")
    {:noreply, state}
  end

  # --- Private Helpers ---

  defp open_port do
    engine_path = Application.get_env(:translator, :audio_engine_path)
    settings = read_settings()
    models_base = System.get_env("TRANSLATOR_MODELS_DIR", "./models")
    {default_meet_input, default_meet_output} = default_virtual_devices()

    my_lang = Map.get(settings, "my_language", "ru")
    their_lang = Map.get(settings, "their_language", "en")

    # Outgoing TTS = their language, Incoming TTS = my language
    out_voice = Map.get(settings, "tts_outgoing_voice", "")
    in_voice = Map.get(settings, "tts_incoming_voice", "")

    # Use configured voices only if the model files are present locally.
    out_voice = resolve_voice(models_base, their_lang, out_voice)
    in_voice = resolve_voice(models_base, my_lang, in_voice)

    if engine_path && File.exists?(engine_path) do
      ort_path =
        System.get_env(
          "ORT_DYLIB_PATH",
          Path.join(File.cwd!(), "vendor/onnxruntime-win-x64/lib/onnxruntime.dll")
        )

      port_env = [
        {~c"RUST_LOG", ~c"warn"},
        {~c"DEEPGRAM_API_KEY", charlist_setting(settings, "deepgram_api_key", "DEEPGRAM_API_KEY")},
        {~c"GROQ_API_KEY", charlist_setting(settings, "groq_api_key", "GROQ_API_KEY")},
        {~c"TRANSLATOR_TTS_EN_MODEL", String.to_charlist("#{models_base}/piper-#{their_lang}/#{out_voice}.onnx")},
        {~c"TRANSLATOR_TTS_EN_CONFIG", String.to_charlist("#{models_base}/piper-#{their_lang}/#{out_voice}.onnx.json")},
        {~c"TRANSLATOR_TTS_RU_MODEL", String.to_charlist("#{models_base}/piper-#{my_lang}/#{in_voice}.onnx")},
        {~c"TRANSLATOR_TTS_RU_CONFIG", String.to_charlist("#{models_base}/piper-#{my_lang}/#{in_voice}.onnx.json")},
        {~c"TRANSLATOR_MIC_DEVICE", charlist_device_setting(settings, "mic_device", "default")},
        {~c"TRANSLATOR_SPEAKER_DEVICE", charlist_device_setting(settings, "speaker_device", "default")},
        {~c"TRANSLATOR_MEET_INPUT", charlist_device_setting(settings, "meet_input_device", default_meet_input)},
        {~c"TRANSLATOR_MEET_OUTPUT", charlist_device_setting(settings, "meet_output_device", default_meet_output)},
        {~c"TRANSLATOR_ENDPOINTING_MS", String.to_charlist("#{Map.get(settings, "endpointing_ms", 300)}")},
        {~c"TRANSLATOR_MY_LANG", String.to_charlist(Map.get(settings, "my_language", "ru"))},
        {~c"TRANSLATOR_THEIR_LANG", String.to_charlist(Map.get(settings, "their_language", "en"))},
        {~c"TRANSLATOR_TTS_ENABLED", String.to_charlist(if(Map.get(settings, "text_only_mode", false), do: "false", else: "true"))},
        {~c"TRANSLATOR_TTS_PROVIDER", String.to_charlist(Map.get(settings, "tts_provider", "piper"))},
        {~c"TRANSLATOR_DEBUG_LOG", String.to_charlist(Path.join(File.cwd!(), "engine-debug.log"))},
        {~c"ORT_DYLIB_PATH", String.to_charlist(ort_path)},
        {~c"PATH", String.to_charlist(runtime_path(ort_path))}
      ]

      try do
        executable_path =
          case :os.type() do
            {:win32, _} -> String.replace(engine_path, "/", "\\")
            _ -> engine_path
          end

        port =
          Port.open({:spawn_executable, String.to_charlist(executable_path)}, [
            :binary,
            {:packet, 4},
            :exit_status,
            {:env, port_env}
          ])

        send_to_port(port, %{"cmd" => "ping"})
        {:ok, port}
      rescue
        e -> {:error, e}
      catch
        kind, reason -> {:error, {kind, reason}}
      end
    else
      Logger.warning(
        "AudioEngine binary not found at #{inspect(engine_path)}. " <>
          "Run `mix compile` to build the Rust binary."
      )

      {:error, :binary_not_found}
    end
  end

  defp read_settings do
    settings_path = Path.join(File.cwd!(), "settings.json")

    case File.read(settings_path) do
      {:ok, contents} ->
        case Jason.decode(contents) do
          {:ok, settings} -> settings
          _ -> %{}
        end

      _ ->
        %{}
    end
  end

  defp default_voice(models_base, lang) do
    dir = Path.join(models_base, "piper-#{lang}")

    case File.ls(dir) do
      {:ok, files} ->
        files
        |> Enum.filter(&String.ends_with?(&1, ".onnx"))
        |> Enum.reject(&String.ends_with?(&1, ".onnx.json"))
        |> Enum.sort()
        |> List.first("")
        |> String.replace(".onnx", "")

      _ ->
        ""
    end
  end

  defp resolve_voice(models_base, lang, voice) do
    cond do
      voice != "" and voice_files_exist?(models_base, lang, voice) ->
        voice

      true ->
        default_voice(models_base, lang)
    end
  end

  defp voice_files_exist?(models_base, lang, voice) do
    model = Path.join([models_base, "piper-#{lang}", "#{voice}.onnx"])
    config = Path.join([models_base, "piper-#{lang}", "#{voice}.onnx.json"])
    File.exists?(model) and File.exists?(config)
  end

  defp default_virtual_devices do
    case :os.type() do
      {:unix, :linux} -> {"translator_call_in", "translator_call_out"}
      {:win32, _} -> {"__system_output_loopback__", "default"}
      _ -> {"BlackHole 16ch", "BlackHole 2ch"}
    end
  end

  defp runtime_path(ort_path) do
    case :os.type() do
      {:win32, _} ->
        [
          Path.dirname(ort_path),
          Path.join(File.cwd!(), "native/audio_engine/target/release"),
          System.get_env("ESPEAK_BIN_PATH"),
          "C:/Program Files/eSpeak NG",
          "C:/Windows/System32"
        ]
        |> Enum.reject(&(&1 in [nil, ""]))
        |> Enum.uniq()
        |> Enum.join(";")

      _ ->
        System.get_env("PATH", "")
    end
  end

  defp charlist_setting(settings, json_key, env_var) do
    val = Map.get(settings, json_key, "")
    val = if val == "", do: System.get_env(env_var, ""), else: val
    String.to_charlist(val)
  end

  defp charlist_device_setting(settings, json_key, fallback) do
    value =
      settings
      |> Map.get(json_key, fallback)
      |> to_string()

    value =
      case :os.type() do
        {:win32, _} ->
          # Erlang's Windows port env rejects non-Latin chars before the Rust process starts.
          if Enum.all?(String.to_charlist(value), &(&1 <= 255)), do: value, else: fallback

        _ ->
          value
      end

    String.to_charlist(value)
  end

  defp send_to_port(port, command) when is_port(port) do
    json = Jason.encode!(command)
    Port.command(port, json)
  rescue
    e ->
      Logger.error("Failed to send command to port: #{inspect(e)}")
      :error
  end

  defp send_to_port(nil, _command) do
    Logger.error("Cannot send command: port is not open")
    :error
  end

  defp dispatch_event(%{"event" => "pong"}, state) do
    Logger.debug("Received pong from engine")
    state
  end

  defp dispatch_event(%{"event" => "started", "pipelines" => pipelines}, state) do
    Logger.info("Engine started pipelines: #{inspect(pipelines)}")
    log_to_file("▶ Engine started: #{Enum.join(pipelines, ", ")}")
    %{state | status: :running, pipelines: pipelines}
  end

  defp dispatch_event(%{"event" => "stopped"}, state) do
    Logger.info("Engine stopped all pipelines")
    log_to_file("■ Engine stopped")
    %{state | status: :idle, pipelines: []}
  end

  defp dispatch_event(
         %{"event" => "transcript", "direction" => direction, "text" => text} = event,
         state
       ) do
    line = "🎤 [#{direction}] #{text}"
    Logger.info(line)
    log_to_file(line)
    notify_pipeline(direction, event)
    state
  end

  defp dispatch_event(
         %{"event" => "translation", "direction" => direction, "text" => text} = event,
         state
       ) do
    line = "🌐 [#{direction}] #{text}"
    Logger.info(line)
    log_to_file(line)
    notify_pipeline(direction, event)
    state
  end

  defp dispatch_event(%{"event" => "metrics"} = event, state) do
    metrics = Map.delete(event, "event")
    stt = Map.get(metrics, "stt_ms", 0)
    trl = Map.get(metrics, "translate_ms", 0)
    tts = Map.get(metrics, "tts_ms", 0)
    line = "⏱  stt=#{stt}ms trl=#{trl}ms tts=#{tts}ms"
    Logger.info(line)
    log_to_file(line <> "\n")
    state
  end

  defp dispatch_event(%{"event" => "error", "message" => message}, state) do
    Logger.error("Engine error: #{message}")
    log_to_file("✖ Engine error: #{message}")

    if state.port && state.status in [:starting, :running] && String.contains?(message, "pipeline failed") do
      log_to_file("→ Port stop (auto after pipeline error)")
      send_to_port(state.port, %{"cmd" => "stop"})
    end

    next_status =
      case state.status do
        s when s in [:starting, :running] -> :crashed
        other -> other
      end

    pipelines = if next_status == :crashed, do: [], else: state.pipelines
    %{state | status: next_status, pipelines: pipelines}
  end

  defp dispatch_event(%{"event" => "log", "level" => level, "message" => message}, state) do
    case level do
      "debug" -> Logger.debug("Engine: #{message}")
      "info" -> Logger.info("Engine: #{message}")
      "warn" -> Logger.warning("Engine: #{message}")
      "error" -> Logger.error("Engine: #{message}")
      _ -> Logger.info("Engine [#{level}]: #{message}")
    end

    state
  end

  defp dispatch_event(%{"event" => "device_list", "input" => input, "output" => output}, state) do
    loopback_note =
      if :os.type() |> elem(0) == :win32 and length(output) > 0 do
        " (system output loopback available)"
      else
        ""
      end

    Logger.info(
      "Received device list: #{length(input)} physical input, #{length(output)} output#{loopback_note}"
    )

    %{state | devices: %{"input" => input, "output" => output}}
  end

  defp dispatch_event(
         %{"event" => "tts_audio", "direction" => dir, "sample_rate" => sr, "audio_b64" => b64},
         state
       ) do
    # Store in process dict for polling by web UI (not in log — too large for SSE)
    queue = Process.get(:audio_queue, [])
    Process.put(:audio_queue, queue ++ [%{"direction" => dir, "sr" => sr, "b64" => b64}])
    # Keep max 5
    if length(queue) > 5 do
      Process.put(:audio_queue, Enum.take(queue, -5))
    end
    state
  end

  defp dispatch_event(%{"event" => "tts_preview_done"}, state) do
    Logger.info("TTS preview playback finished")
    state
  end

  defp dispatch_event(event, state) do
    Logger.debug("Unhandled engine event: #{inspect(event)}")
    state
  end

  defp notify_pipeline(direction, event) do
    case find_pipeline_pid(direction) do
      nil -> :ok
      pid -> Translator.Pipeline.handle_event(pid, event)
    end
  end

  defp find_pipeline_pid(direction) do
    direction_atom = String.to_existing_atom(direction)

    Translator.PipelineSupervisor.which_pipelines()
    |> Enum.find_value(fn {pid, dir} ->
      if dir == direction_atom, do: pid
    end)
  rescue
    ArgumentError -> nil
  end

  defp log_to_file(line) do
    timestamp = DateTime.utc_now() |> DateTime.to_iso8601()
    File.write(@log_file, "[#{timestamp}] #{line}\n", [:append])
  end

  defp encode_config(config) when is_map(config) do
    config
    |> Enum.map(fn {k, v} -> {to_string(k), v} end)
    |> Map.new()
  end
end
