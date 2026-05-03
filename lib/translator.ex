defmodule Translator do
  @moduledoc """
  Public API for the realtime speech translator.

  Delegates all operations to `Translator.AudioEngine` which manages
  the Rust audio processing binary via a Port.
  """

  @doc """
  Starts translation pipelines (outgoing and incoming by default).
  """
  @spec start(list(String.t())) :: :ok | {:error, term()}
  def start(pipelines \\ ["outgoing", "incoming"]) do
    Translator.AudioEngine.start_pipelines(pipelines)
  end

  @doc """
  Stops all active translation pipelines.
  """
  @spec stop() :: :ok | {:error, term()}
  def stop do
    Translator.AudioEngine.stop_pipelines()
  end

  @doc """
  Returns the current status of the audio engine and pipelines.
  """
  @spec status() :: map()
  def status do
    Translator.AudioEngine.status()
  end

  @doc """
  Updates a runtime configuration value.
  """
  @spec set_config(atom(), term()) :: :ok | {:error, term()}
  def set_config(key, value) do
    Translator.AudioEngine.set_config(key, value)
  end
end
