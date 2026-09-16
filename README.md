# OpenAI-Compatible Endpoint for LM Studio

[![CI](https://github.com/J0hnSm1thyk/lmstudio-universal-endpoint/actions/workflows/ci.yml/badge.svg)](https://github.com/J0hnSm1thyk/lmstudio-universal-endpoint/actions/workflows/ci.yml)

Use remote or local OpenAI-compatible Chat Completions APIs directly from the LM Studio chat UI.
This plugin accepts arbitrary model IDs and does not guess the provider from model names such as
`gpt-*`, `claude-*`, or any other prefix.

## Upstream and attribution

This plugin is an independently maintained derivative of
[lmstudio/openai-compat-endpoint](https://lmstudio.ai/lmstudio/openai-compat-endpoint).

The upstream plugin provided the original LM Studio generator integration. This derivative adds
free-form model IDs, a fully configurable OpenAI-compatible endpoint, optional model discovery,
request controls, safer error handling, endpoint probes, tests, and configuration suitable for
Z.ai Coding Plan and other compatible services.

This project is not an official LM Studio plugin. It is not affiliated with, endorsed by, or
supported by LM Studio or Element Labs. LM Studio and related names are trademarks of their
respective owners.

The installed plugin uses the independent local identity `local/universal-openai-endpoint`, so it
can coexist with the upstream `lmstudio/openai-compat-endpoint` plugin.

## Features

- Connect to any endpoint that implements the OpenAI-compatible Chat Completions API.
- Enter any Model ID instead of selecting from a hard-coded catalogue.
- Configure the Base URL, API Key, request timeout, temperature, max tokens, and stop sequences.
- Stream generated tokens into the LM Studio chat UI.
- Preserve system, user, assistant, and tool messages.
- Forward OpenAI-compatible tool definitions and stream tool calls back to LM Studio.
- Return actionable errors for authentication, permission, endpoint, model, rate-limit, server,
  connection, and timeout failures.
- Keep API keys and Authorization headers out of plugin logs and displayed error details.
- Query the optional OpenAI-compatible `GET /models` endpoint from the included command-line probe.

Compatible services may include Z.ai, OpenRouter, LM Studio Server, vLLM, llama.cpp server, and
other servers that implement the same API contract.

## Requirements

- LM Studio with plugin support
- The `lms` command-line tool supplied with LM Studio
- Node.js and npm for standalone builds and tests
- An OpenAI-compatible API endpoint
- An API key when required by the provider

## Installation

Clone this repository:

```bash
git clone https://github.com/J0hnSm1thyk/lmstudio-universal-endpoint.git
cd lmstudio-universal-endpoint
```

Open a terminal in this plugin directory and install the dependencies:

```bash
npm install
```

Build and test the plugin:

```bash
npm run build
npm test
```

Install it into LM Studio:

```bash
lms dev --install
```

LM Studio asks before replacing a locally installed copy of this plugin. Use the non-interactive
form only when you intentionally want to update that local installation:

```bash
lms dev --install --yes
```

Restart LM Studio or reload the plugin if the newly installed version is not shown immediately.

For development with automatic rebuilding and reloading, keep the following command running:

```bash
lms dev
```

## Configuration in LM Studio

After installation:

1. Open or create a chat in LM Studio.
2. Select this plugin as the generation source.
3. Open the plugin's global settings.
4. Enter the **Base URL** and **API Key**.
5. Optionally change **Request Timeout (ms)**.
6. Open the per-chat plugin settings and enter the exact **Model ID** accepted by the endpoint.
7. Send a message from the normal LM Studio chat UI.

### Global settings

- **Base URL**: API root including its version path, such as `https://api.example.com/v1`.
- **API Key**: stored as a protected field. Leave it empty only when the endpoint does not require
  authentication.
- **Request Timeout (ms)**: maximum time to wait for the endpoint.

### Per-chat settings

- **Model ID**: any identifier accepted by the configured endpoint, such as `glm-5.3-flash`,
  `deepseek-chat`, or `qwen3-coder`.
- **Temperature**: use `-1` to omit the parameter and use the endpoint default.
- **Max Tokens**: use `0` to omit the parameter and use the endpoint default.
- **Stop Sequences**: optional values forwarded as the OpenAI-compatible `stop` parameter.

## Z.ai Coding Plan example

Configure the plugin as follows:

```yaml
Base URL: https://api.z.ai/api/coding/paas/v4
API Key: <your Z.ai API key>
Model ID: glm-5.3-flash
```

Then select the plugin as the generation source and use the normal LM Studio chat interface.

## Model discovery

The reusable model-discovery implementation calls:

```text
GET {baseURL}/models
```

To list model IDs without putting the API key on the command line, set it through an environment
variable and run the probe.

PowerShell:

```powershell
$env:OPENAI_API_KEY = "<API Key>"
npm run probe -- --base-url "https://api.z.ai/api/coding/paas/v4"
```

Bash:

```bash
OPENAI_API_KEY="<API Key>" npm run probe -- \
  --base-url "https://api.z.ai/api/coding/paas/v4"
```

If the provider does not implement `/models`, model discovery can fail without disabling chat.
Enter the Model ID manually in the LM Studio plugin settings.

## Chat Completions probe

The included streaming probe makes a request to:

```text
POST {baseURL}/chat/completions
```

PowerShell example:

```powershell
$env:OPENAI_API_KEY = "<API Key>"
npm run probe -- --base-url "https://api.z.ai/api/coding/paas/v4" `
  --model "glm-5.3-flash" `
  --prompt "Reply with OK."
```

Bash example:

```bash
OPENAI_API_KEY="<API Key>" npm run probe -- \
  --base-url "https://api.z.ai/api/coding/paas/v4" \
  --model "glm-5.3-flash" \
  --prompt "Reply with OK."
```

## Compatibility and limitations

- The endpoint must support the OpenAI-compatible `POST /chat/completions` request format and SSE
  streaming when `stream: true` is supplied.
- Tool calling requires the endpoint and selected model to support OpenAI-compatible `tools` and
  streamed `tool_calls`.
- A model can still be used for ordinary chat when it does not support tool calling.
- Structured-output configuration is not exposed because the upstream plugin did not implement it.
- Provider-specific request extensions are not sent.
- LM Studio's current plugin configuration SDK supports static select options but does not expose a
  settings action button or runtime replacement of dropdown options. Therefore, the GUI uses a
  free-form Model ID field rather than a dynamic **Refresh Models** dropdown.

## Security notes

- Never commit API keys to this repository.
- Prefer environment variables when using the command-line probes.
- API keys are stored in an LM Studio protected configuration field.
- The plugin does not log request headers, API keys, or raw SDK error objects.

## Development commands

```bash
npm run build
npm test
npm run probe -- --base-url "https://api.example.com/v1"
npm run dev
```

## Contributing and security

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow.
Please report security issues through GitHub's private vulnerability reporting instead of a public
issue; see [SECURITY.md](SECURITY.md).

Licensing and upstream attribution are documented in [LICENSE.md](LICENSE.md) and
[NOTICE.md](NOTICE.md).
