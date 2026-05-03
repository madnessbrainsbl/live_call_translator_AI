# Live Call Translator AI

[![English version](https://img.shields.io/badge/lang-english-blue)](README.md)
![Windows](https://img.shields.io/badge/platform-Windows_10%2F11-lightgrey)
![License](https://img.shields.io/badge/license-MIT-blue)

Windows-first переводчик звонков с AI Assistant. Приложение слушает обе стороны голосового или видео-звонка, распознает речь через Deepgram, переводит через Groq, озвучивает перевод через виртуальный аудио-кабель и умеет подсказывать ответы по текущему диалогу.

Текущая логика проекта заточена под Windows, VB-CABLE A+B, Rust audio engine, Elixir supervisor и Flask UI.

## Возможности

- Двусторонний live-перевод: вы говорите на своем языке, собеседник слышит перевод, и наоборот.
- AI Assistant: быстрые и подробные варианты ответа по текущей расшифровке.
- Провайдеры ассистента: локальный ChatGPT/Codex login, OpenRouter, Groq или auto fallback.
- Дополнительный web context для ассистента, если последний вопрос выглядит фактическим или техническим.
- STT через Deepgram Nova-3 streaming.
- Перевод через Groq `llama-3.3-70b-versatile`.
- TTS через локальные Piper voices или Microsoft Edge Neural voices.
- Windows-маршрутизация через VB-CABLE A+B, плюс Monitor/system loopback для браузерного аудио.
- История звонков, экспорт транскрипта, закладки и AI summary.

## Архитектура

```text
Microphone or system audio
        |
        v
Rust audio engine -> Deepgram STT -> Groq translation -> Piper/Edge TTS
        |                                             |
        v                                             v
Elixir supervisor and command port              VB-CABLE / speakers
        |
        v
Flask web UI: settings, transcript, AI Assistant, history
```

## Требования

- Windows 10 или Windows 11.
- Установленный и включенный [VB-CABLE A+B](https://vb-audio.com/Cable/).
- Python 3.
- Elixir/Erlang с `mix`.
- Rust с `cargo`.
- `espeak-ng`.
- Deepgram API key для распознавания речи.
- Groq API key для перевода.
- Опционально: Codex CLI с ChatGPT login для AI Assistant.
- Опционально: OpenRouter API key для AI Assistant.

`setup_windows.ps1` ожидает, что Python, Elixir, Rust и `espeak-ng` уже доступны в PATH. Скрипт создаст `.venv`, установит Python-пакеты, скачает ONNX Runtime для Windows, скачает стандартные голоса Piper, подготовит `.env`, поставит Mix-зависимости и соберет Rust audio engine.

## Сначала установите зависимости

Перед запуском `setup_windows.ps1` нужно вручную установить системные пакеты:

| Нужно | Зачем |
|---|---|
| Git | Клонирование репозитория. |
| Python 3.10+ | Flask UI и вспомогательные setup-скрипты. |
| Elixir + Erlang/OTP | Supervisor-приложение и команда `mix`. |
| Rust stable toolchain | Сборка native audio engine через `cargo`. |
| espeak-ng | Фонемизация для Piper TTS. |
| VB-CABLE A+B | Виртуальная аудио-маршрутизация между приложением и звонком. |

Можно ставить вручную с официальных installer'ов или через Windows package manager, например Chocolatey/winget. Если используете Chocolatey, перед клонированием нужен примерно такой набор:

```powershell
choco install git python elixir rust espeak-ng -y
```

После установки откройте новое PowerShell-окно и проверьте, что команды видны:

```powershell
git --version
python --version
elixir --version
mix --version
cargo --version
espeak-ng --version
```

Продолжайте только когда все команды работают. После этого `setup_windows.ps1` поставит project-local dependencies, скачает ONNX Runtime и voice models, затем соберет приложение.

Опционально для AI Assistant:

- Установите Codex CLI и выполните `codex login`, если нужен ChatGPT / Codex provider.
- Добавьте OpenRouter key, если хотите использовать OpenRouter как fallback/provider.

## Быстрый старт

```powershell
git clone https://github.com/madnessbrainsbl/live_call_translator_AI.git
cd live_call_translator_AI
.\setup_windows.ps1
```

После setup заполните `.env`:

```env
DEEPGRAM_API_KEY=your_deepgram_api_key_here
GROQ_API_KEY=your_groq_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=openrouter/auto
CODEX_BIN=
ORT_DYLIB_PATH=
```

Запуск:

```powershell
.\run_windows.ps1
```

Откройте:

```text
http://127.0.0.1:5050
```

`run_windows.ps1` стартует Flask UI в фоне, загружает `.env`, выставляет Windows-путь к ONNX Runtime, затем запускает Elixir-приложение и Rust audio engine.

См. [Usage Guide](USAGE.md): управление, голоса, аудио, AI Assistant и историю звонков.

## Что скачивает и собирает setup

`setup_windows.ps1` выполняет проектную настройку после установки системных пакетов:

- создает `.venv`;
- ставит Python-пакеты из `requirements.txt`;
- скачивает ONNX Runtime для Windows в `vendor/onnxruntime-win-x64`;
- скачивает стандартные английский и русский голоса Piper в `models/`;
- создает `.env` из `.env.example`, если его еще нет;
- прописывает Windows-пути для ONNX Runtime и данных espeak-ng;
- запускает `mix deps.get`;
- компилирует Elixir-приложение и Rust audio engine.

## Настройка аудио Windows

Обычный сценарий для звонков через VB-CABLE A+B:

1. В приложении для звонка установите speakers/output = `CABLE-A Input (VB-Audio Cable A)`.
2. В приложении для звонка установите microphone/input = `CABLE-B Output (VB-Audio Cable B)`.
3. В настройках Live Call Translator установите `Speaker/System Capture Source` = `CABLE-A Output (VB-Audio Cable A)`.
4. Установите `Call Microphone Playback Target` = `CABLE-B Input (VB-Audio Cable B)`.
5. `Speakers` = ваши реальные наушники или колонки.
6. `Microphone` = ваш реальный микрофон.

Для браузерных звонков можно использовать кнопку `Monitor`: она захватывает звук браузера и проигрывает перевод в браузере. Windows system loopback тоже может захватывать звук с выбранных speakers, если не выбран отдельный cable capture source.

## AI Assistant

Кнопка `AI Assistant` читает последние реплики из live transcript и возвращает:

- короткий ответ, который можно сказать сразу;
- более подробный ответ, если нужен контекст.

Провайдеры в Settings:

- `ChatGPT / Codex`: локальный Codex CLI OAuth login. Перед тестом выполните `codex login` в PowerShell.
- `OpenRouter`: использует `OPENROUTER_API_KEY` и `OPENROUTER_MODEL`.
- `Groq`: использует тот же Groq key, что и перевод.
- `Auto fallback`: пробует Codex, затем OpenRouter, затем Groq.

Ассистент отвечает на вашем выбранном языке, учитывает недавний контекст диалога, не копирует prompt-текст и может добавлять легкий web context для подробных ответов.

## Голоса и TTS

Piper mode использует локальные ONNX voice models. Setup скачивает английский и русский voice defaults, а UI умеет скачивать дополнительные голоса из Piper catalog.

Edge mode использует Microsoft Edge Neural voices через `edge-tts`. Локальные Piper models для него не нужны, но нужен доступ к сети.

`Text Only` отключает озвучку перевода, но оставляет транскрипцию, перевод и AI Assistant.

## Управление

- `Start`: запускает выбранные audio pipelines.
- `Mic Out`: захватывает ваш микрофон и переводит для собеседника.
- `Mic In`: захватывает собеседника/system audio и переводит для вас.
- `Monitor`: захватывает аудио браузера из UI.
- `AI Assistant`: предлагает ответы по текущему transcript.
- `Saved`: фильтр по сохраненным репликам.
- `History`: история звонков, реплик и summary.
- `Export`: экспорт текущего transcript в txt.

## Возможности Web UI

- Live transcript с оригинальной речью и переводом.
- Панель AI Assistant с быстрым и подробным ответом.
- Проверка провайдеров Deepgram, Groq, Codex и OpenRouter.
- Выбор голоса, загрузка голосов и предварительное прослушивание.
- Локальные голоса Piper и режим Microsoft Edge Neural voices.
- Browser Monitor для захвата и проигрывания аудио из браузера.
- Text Only mode для перевода без озвучки TTS.
- Отдельное отключение звука для outgoing/incoming потоков.
- Закладки и фильтр сохраненных сообщений.
- Локальная история звонков с AI-сводками.
- Экспорт transcript.
- Темная и светлая тема.
- Метрики задержки для STT, перевода, TTS и общего времени.

## Поддерживаемые языки

Текущий Windows UI показывает эти языки для STT и перевода:

| Язык | STT | Перевод | TTS |
|---|---|---|---|
| Английский | Да | Да | Piper/Edge |
| Арабский | Да | Да | Piper/Edge, если голос доступен |
| Вьетнамский | Да | Да | Piper/Edge, если голос доступен |
| Голландский | Да | Да | Piper/Edge, если голос доступен |
| Греческий | Да | Да | Piper/Edge, если голос доступен |
| Датский | Да | Да | Piper/Edge, если голос доступен |
| Индонезийский | Да | Да | Edge или Piper, если голос доступен |
| Испанский | Да | Да | Piper/Edge, если голос доступен |
| Итальянский | Да | Да | Piper/Edge, если голос доступен |
| Каталанский | Да | Да | Piper/Edge, если голос доступен |
| Китайский | Да | Да | Piper/Edge, если голос доступен |
| Латышский | Да | Да | Edge или Piper, если голос доступен |
| Немецкий | Да | Да | Piper/Edge, если голос доступен |
| Норвежский | Да | Да | Piper/Edge, если голос доступен |
| Персидский | Да | Да | Piper/Edge, если голос доступен |
| Польский | Да | Да | Piper/Edge, если голос доступен |
| Португальский | Да | Да | Piper/Edge, если голос доступен |
| Румынский | Да | Да | Piper/Edge, если голос доступен |
| Русский | Да | Да | Piper/Edge |
| Турецкий | Да | Да | Piper/Edge, если голос доступен |
| Украинский | Да | Да | Piper/Edge, если голос доступен |
| Венгерский | Да | Да | Piper/Edge, если голос доступен |
| Финский | Да | Да | Piper/Edge, если голос доступен |
| Французский | Да | Да | Piper/Edge, если голос доступен |
| Хинди | Да | Да | Edge или Piper, если голос доступен |
| Чешский | Да | Да | Piper/Edge, если голос доступен |
| Шведский | Да | Да | Piper/Edge, если голос доступен |

Setup по умолчанию скачивает английский и русский голоса Piper. Дополнительные голоса Piper можно скачать в Settings; Edge Neural voices загружаются онлайн.

## Troubleshooting

Если перевод не попадает в приложение звонка, проверьте направление VB-CABLE: microphone в call app должен быть `CABLE-B Output`, а это приложение должно проигрывать outgoing translation в `CABLE-B Input`.

Если не слышно входящую сторону, выберите `CABLE-A Output` как capture source, когда speakers в call app стоят на `CABLE-A Input`, или используйте `Monitor` для браузерного аудио.

Если Codex Assistant не работает, выполните `codex login` в PowerShell и нажмите `Test` рядом с ChatGPT / Codex в Settings.

Если Piper TTS не работает, скачайте выбранный voice в Settings или переключите TTS Engine на Microsoft Edge Neural voices.

## Лицензия

MIT
