defmodule Translator.Config do
  @moduledoc """
  Runtime configuration store backed by an Agent.

  Merges Application environment config with sensible defaults on start.
  Supports dynamic updates at runtime.
  """

  use Agent

  @defaults %{
    vad_threshold: 0.5,
    min_silence_ms: 500,
    transcript_timeout_ms: 2000,
    sample_rate: 48000
  }

  def start_link(_opts) do
    initial_config = load_config()
    Agent.start_link(fn -> initial_config end, name: __MODULE__)
  end

  @spec get(atom()) :: term()
  def get(key) do
    Agent.get(__MODULE__, &Map.get(&1, key))
  end

  @spec get_all() :: map()
  def get_all do
    Agent.get(__MODULE__, & &1)
  end

  @spec put(atom(), term()) :: :ok
  def put(key, value) do
    Agent.update(__MODULE__, &Map.put(&1, key, value))
  end

  @spec reset() :: :ok
  def reset do
    Agent.update(__MODULE__, fn _ -> load_config() end)
  end

  defp load_config do
    app_config =
      [:vad_threshold, :min_silence_ms, :transcript_timeout_ms, :sample_rate]
      |> Enum.reduce(%{}, fn key, acc ->
        case Application.get_env(:translator, key) do
          nil -> acc
          value -> Map.put(acc, key, value)
        end
      end)

    Map.merge(@defaults, app_config)
  end
end
