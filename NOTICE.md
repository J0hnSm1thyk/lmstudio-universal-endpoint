# Attribution Notice

## Upstream project

- Project: `lmstudio/openai-compat-endpoint`
- Source: https://lmstudio.ai/lmstudio/openai-compat-endpoint
- Source snapshot obtained with `lms clone` on September 16, 2026
- Upstream manifest revision in that snapshot: `9`

The upstream project supplied the original LM Studio plugin entry point, configuration schema,
OpenAI client integration, message conversion, streaming response handling, and tool-call bridge.

## Changes in this derivative

This independently maintained derivative includes, among other changes:

- removal of the hard-coded model catalogue;
- removal of model-name-based provider detection;
- free-form model ID input;
- generic Base URL and protected API Key settings;
- OpenAI-compatible `GET /models` discovery support through a reusable helper and CLI probe;
- Z.ai Coding Plan-compatible configuration;
- temperature, max token, stop sequence, and request timeout controls;
- explicit HTTP, connection, and timeout error messages;
- API credential redaction and safer logging behavior;
- endpoint integration tests, continuous integration, and expanded documentation; and
- an independent plugin identity that does not overwrite the upstream plugin.

This repository is not affiliated with or endorsed by LM Studio or Element Labs.
