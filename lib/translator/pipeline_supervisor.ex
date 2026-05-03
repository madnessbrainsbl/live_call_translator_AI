defmodule Translator.PipelineSupervisor do
  @moduledoc """
  DynamicSupervisor for managing individual pipeline GenServer processes.

  Each pipeline tracks state for a single audio direction (outgoing/incoming).
  """

  use DynamicSupervisor

  def start_link(opts) do
    DynamicSupervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    DynamicSupervisor.init(strategy: :one_for_one)
  end

  @doc "Starts a pipeline process for the given direction (:outgoing or :incoming)."
  @spec start_pipeline(atom()) :: {:ok, pid()} | {:error, term()}
  def start_pipeline(direction) when direction in [:outgoing, :incoming] do
    child_spec = {Translator.Pipeline, direction}
    DynamicSupervisor.start_child(__MODULE__, child_spec)
  end

  @doc "Stops a pipeline process by pid."
  @spec stop_pipeline(pid()) :: :ok | {:error, :not_found}
  def stop_pipeline(pid) when is_pid(pid) do
    DynamicSupervisor.terminate_child(__MODULE__, pid)
  end

  @doc """
  Returns a list of `{pid, direction}` tuples for all running pipelines.
  """
  @spec which_pipelines() :: [{pid(), atom()}]
  def which_pipelines do
    DynamicSupervisor.which_children(__MODULE__)
    |> Enum.filter(fn {_, pid, _, _} -> is_pid(pid) end)
    |> Enum.map(fn {_, pid, _, _} ->
      direction = Translator.Pipeline.get_direction(pid)
      {pid, direction}
    end)
  end
end
