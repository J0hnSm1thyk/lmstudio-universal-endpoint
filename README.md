# OpenAI-Compatible Endpoint for LM Studio

[![CI](https://github.com/J0hnSm1thyk/lmstudio-universal-endpoint/actions/workflows/ci.yml/badge.svg)](https://github.com/J0hnSm1thyk/lmstudio-universal-endpoint/actions/workflows/ci.yml)

An LM Studio plugin for connecting the chat UI to any OpenAI-compatible API without a fixed model
list. Enter the Base URL, API key, and model ID you want to use. The plugin does not infer a
provider from the model name: every endpoint follows the same configuration and request path.

This project is based on
[`lmstudio/openai-compat-endpoint`](https://lmstudio.ai/lmstudio/openai-compat-endpoint) and is
maintained separately. It is not an official LM Studio plugin or endorsed by LM Studio or Element
Labs. The installed ID is `local/universal-openai-endpoint`, so it can coexist with the upstream
plugin.

## Features

- Free-form model IDs such as `qwen3-coder`, `deepseek-chat`, `glm-5.3-flash`, or a private model ID
- Configurable Base URL and protected API key
- Streaming responses in the LM Studio chat UI
- Separate reasoning/thinking streams from `reasoning_content` or `reasoning`
- System, user, assistant, and tool messages
- OpenAI-compatible tool calling
- Temperature, max token, stop sequence, and timeout settings
- Clear errors for authentication, permissions, missing models, rate limits, server failures, and
  timeouts

## Install

```bash
git clone https://github.com/J0hnSm1thyk/lmstudio-universal-endpoint.git
cd lmstudio-universal-endpoint
npm install
npm run build
lms dev --install
```

To update an existing local installation without a confirmation prompt:

```bash
lms dev --install --yes
```

For development with automatic reloads:

```bash
lms dev
```

Run the local streaming compatibility check:

```bash
npm run verify
```

The check uses a local mock endpoint and does not require an API key.

## Configure

In LM Studio, select `local/universal-openai-endpoint` as the generation source.

Global plugin settings:

- **Base URL**: the API root including its version path
- **API Key**: leave empty only if the endpoint does not require authentication
- **Request Timeout (ms)**: request timeout in milliseconds

Per-chat settings:

- **Model ID**: the exact model ID accepted by the endpoint
- **Temperature**: `-1` uses the endpoint default
- **Max Tokens**: `0` uses the endpoint default
- **Stop Sequences**: optional stop strings

## Provider examples

These are examples only. The plugin has no provider-specific routing or model allowlist.

| Endpoint | Base URL example | Model ID |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | A model available to your account |
| OpenRouter | `https://openrouter.ai/api/v1` | An OpenRouter model ID |
| LM Studio Server | `http://localhost:1234/v1` | A loaded local model ID |
| vLLM | `http://localhost:8000/v1` | The served model ID |
| llama.cpp server | `http://localhost:8080/v1` | The configured model alias |
| Z.ai Coding Plan | `https://api.z.ai/api/coding/paas/v4` | `glm-5.3-flash` or another available model |
| Other compatible API | `https://provider.example/v1` | The exact model ID accepted by that API |

Ports, paths, and model IDs can vary by provider or server configuration.

## Check an endpoint

List models using `GET {baseURL}/models`:

```powershell
$env:OPENAI_API_KEY = "<API Key>"
npm run probe -- --base-url "https://provider.example/v1"
```

Send a streaming request to `POST {baseURL}/chat/completions`:

```powershell
$env:OPENAI_API_KEY = "<API Key>"
npm run probe -- --base-url "https://provider.example/v1" `
  --model "your-model-id" `
  --prompt "Reply with OK."
```

Add `--no-stream` to compare a non-streaming response, or `--raw` to print parsed response chunks.
Neither mode prints the API key or Authorization header.

The `/models` endpoint is optional. If it is unavailable, enter the model ID manually in LM
Studio.

## Notes

- The endpoint must support OpenAI-compatible `POST /chat/completions` streaming.
- The request timeout covers connection setup and response headers; an active stream can continue
  beyond that value.
- Tool calling requires support from both the endpoint and the selected model.
- Provider-specific request extensions are not sent.
- LM Studio's plugin settings API does not currently support a dynamic model dropdown, so the
  model ID is a text field.
- API keys and Authorization headers are not written to plugin logs.

See [NOTICE.md](NOTICE.md) for upstream attribution and [LICENSE.md](LICENSE.md) for licensing.
