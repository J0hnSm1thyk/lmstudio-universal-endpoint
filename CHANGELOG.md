# Changelog

All notable changes to this project are documented in this file.

## [1.1.0] - 2026-09-16

### Added

- Free-form Model ID configuration for arbitrary OpenAI-compatible models.
- Configurable Base URL, protected API Key, and request timeout.
- Optional temperature, max token, and stop sequence controls.
- Reusable `GET /models` discovery helper.
- Command-line probes for model discovery and streaming chat completions.
- Actionable errors for HTTP 400, 401, 403, 404, 429, 5xx, connection, and timeout failures.
- Credential redaction for user-facing errors.
- Mock-server integration tests for standard `/models` and `/chat/completions` paths.
- Independent local plugin identity and complete installation documentation.

### Changed

- All providers now use the same OpenAI-compatible client initialized from Base URL and API Key.
- Removed model-name prefix checks and automatic OpenAI/Anthropic provider selection.
- Retained streamed text, chat roles, and OpenAI-compatible tool calling.

### Security

- Prevented API keys and Authorization values from being included in displayed error details.
- Updated `ws` to a release that addresses published memory disclosure and denial-of-service issues.
