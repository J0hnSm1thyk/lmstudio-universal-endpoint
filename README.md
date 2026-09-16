# OpenAI-Compatible Endpoint for LM Studio

[![CI](https://github.com/J0hnSm1thyk/lmstudio-universal-endpoint/actions/workflows/ci.yml/badge.svg)](https://github.com/J0hnSm1thyk/lmstudio-universal-endpoint/actions/workflows/ci.yml)

An LM Studio plugin for connecting the chat UI to OpenAI-compatible APIs without a fixed model
list. Enter the Base URL, API key, and model ID you want to use.

This project is based on
[`lmstudio/openai-compat-endpoint`](https://lmstudio.ai/lmstudio/openai-compat-endpoint) and is
maintained separately. It is not an official LM Studio plugin or endorsed by LM Studio or Element
Labs. The installed ID is `local/universal-openai-endpoint`, so it can coexist with the upstream
plugin.

## Features

- Free-form model IDs such as `glm-5.3-flash`, `deepseek-chat`, and `qwen3-coder`
- Configurable Base URL and protected API key
- Streaming responses in the LM Studio chat UI
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

### Z.ai Coding Plan

```yaml
Base URL: https://api.z.ai/api/coding/paas/v4
API Key: <your Z.ai API key>
Model ID: glm-5.3-flash
```

The same plugin can be used with OpenRouter, LM Studio Server, vLLM, llama.cpp server, and other
OpenAI-compatible endpoints.

## Check an endpoint

List models using `GET {baseURL}/models`:

```powershell
$env:OPENAI_API_KEY = "<API Key>"
npm run probe -- --base-url "https://api.z.ai/api/coding/paas/v4"
```

Send a streaming request to `POST {baseURL}/chat/completions`:

```powershell
$env:OPENAI_API_KEY = "<API Key>"
npm run probe -- --base-url "https://api.z.ai/api/coding/paas/v4" `
  --model "glm-5.3-flash" `
  --prompt "Reply with OK."
```

The `/models` endpoint is optional. If it is unavailable, enter the model ID manually in LM
Studio.

## Notes

- The endpoint must support OpenAI-compatible `POST /chat/completions` streaming.
- Tool calling requires support from both the endpoint and the selected model.
- Provider-specific request extensions are not sent.
- LM Studio's plugin settings API does not currently support a dynamic model dropdown, so the
  model ID is a text field.
- API keys and Authorization headers are not written to plugin logs.

See [NOTICE.md](NOTICE.md) for upstream attribution and [LICENSE.md](LICENSE.md) for licensing.
