defmodule Translator.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      Translator.Config,
      Translator.AudioEngine,
      {Translator.PipelineSupervisor, []},
      Translator.CommandServer
    ]

    opts = [strategy: :rest_for_one, name: Translator.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
