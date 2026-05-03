defmodule Translator.CommandServer do
  @moduledoc "Tiny TCP server on port 5051 for commands from the web UI."

  use GenServer
  require Logger

  @port 5051

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    {:ok, listen} =
      :gen_tcp.listen(@port, [
        :binary,
        packet: :line,
        active: false,
        reuseaddr: true
      ])

    Logger.info("CommandServer listening on port #{@port}")
    spawn_link(fn -> accept_loop(listen) end)
    {:ok, %{listen: listen}}
  end

  defp accept_loop(listen) do
    case :gen_tcp.accept(listen) do
      {:ok, socket} ->
        case :gen_tcp.recv(socket, 0, 5000) do
          {:ok, data} ->
            resp = handle_command(String.trim(data))
            :gen_tcp.send(socket, resp <> "\n")

          _ ->
            :ok
        end

        :gen_tcp.close(socket)
        accept_loop(listen)

      {:error, reason} ->
        Logger.error("CommandServer accept error: #{inspect(reason)}")
    end
  end

  defp handle_command("start") do
    Translator.AudioEngine.start_pipelines()
    "ok"
  end

  defp handle_command("start_outgoing") do
    Translator.AudioEngine.start_pipelines(["outgoing"])
    "ok"
  end

  defp handle_command("start_incoming") do
    Translator.AudioEngine.start_pipelines(["incoming"])
    "ok"
  end

  defp handle_command("stop") do
    Translator.AudioEngine.stop_pipelines()
    "ok"
  end

  defp handle_command("mute_outgoing") do
    Translator.AudioEngine.set_config(:mute_outgoing, true)
    "ok"
  end

  defp handle_command("unmute_outgoing") do
    Translator.AudioEngine.set_config(:mute_outgoing, false)
    "ok"
  end

  defp handle_command("mute_incoming") do
    Translator.AudioEngine.set_config(:mute_incoming, true)
    "ok"
  end

  defp handle_command("unmute_incoming") do
    Translator.AudioEngine.set_config(:mute_incoming, false)
    "ok"
  end

  defp handle_command("text_only_on") do
    Translator.AudioEngine.set_config(:tts_enabled, false)
    "ok"
  end

  defp handle_command("text_only_off") do
    Translator.AudioEngine.set_config(:tts_enabled, true)
    "ok"
  end

  defp handle_command("monitor_audio_on") do
    Translator.AudioEngine.set_config(:browser_monitor_enabled, true)
    "ok"
  end

  defp handle_command("monitor_audio_off") do
    Translator.AudioEngine.set_config(:browser_monitor_enabled, false)
    "ok"
  end

  defp handle_command("preview:" <> rest) do
    case String.split(rest, ":", parts: 2) do
      [lang, voice] ->
        debug_log("▶ Preview command: lang=#{lang} voice=#{voice}")
        Translator.AudioEngine.send_command(%{
          "cmd" => "tts_preview",
          "lang" => lang,
          "voice" => voice
        })
        "ok:previewing"

      _ ->
        "error:bad_preview_format"
    end
  end

  defp handle_command("list_devices") do
    Translator.AudioEngine.send_command(%{"cmd" => "list_devices"})
    "ok:listing"
  end

  defp handle_command("get_devices") do
    Translator.AudioEngine.get_devices()
    |> Jason.encode!()
  end

  defp handle_command("poll_audio") do
    items = Translator.AudioEngine.pop_audio()
    Jason.encode!(items)
  end

  defp handle_command("restart") do
    Translator.AudioEngine.restart_engine_async()
    "ok:restarting"
  end

  defp handle_command("status") do
    %{status: status} = Translator.AudioEngine.status()
    "ok:#{status}"
  end

  defp handle_command(other) do
    Logger.warning("Unknown command: #{other}")
    "error:unknown_command"
  end

  defp debug_log(line) do
    timestamp = DateTime.utc_now() |> DateTime.to_iso8601()
    File.write("test-log.txt", "[#{timestamp}] #{line}\n", [:append])
  end
end
