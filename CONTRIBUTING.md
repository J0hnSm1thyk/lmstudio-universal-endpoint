# Contributing

Thank you for considering a contribution.

## Development setup

Requirements:

- Node.js 20 or newer
- npm
- LM Studio and its `lms` CLI for plugin runtime testing

Install dependencies and run the checks:

```bash
npm ci
npm run build
npm test
```

To test inside LM Studio without permanently installing the working copy:

```bash
lms dev
```

## Pull requests

Please:

1. Keep provider behavior generic and avoid model-name or vendor-name routing.
2. Preserve manual Model ID entry even when adding model discovery features.
3. Preserve streaming, all supported message roles, and tool calling.
4. Do not log API keys, Authorization headers, or raw request objects containing credentials.
5. Add or update tests for behavior changes.
6. Run `npm run build` and `npm test` before opening a pull request.
7. Describe user-visible changes and compatibility considerations clearly.

Do not include API keys, private endpoint URLs, customer prompts, or other secrets in issues,
tests, logs, screenshots, or pull requests.
