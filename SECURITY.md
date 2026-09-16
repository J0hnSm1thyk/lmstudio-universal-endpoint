# Security Policy

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature for this repository. Do not open a
public issue for an unpatched vulnerability and do not include live API keys, Authorization
headers, private endpoint URLs, or user conversation data in a report.

Include the following when possible:

- affected version or commit;
- a concise description of the impact;
- reproduction steps using non-sensitive test credentials;
- affected endpoint or request path;
- suggested mitigations, if known.

Security reports will be assessed as time permits. This community project does not provide a
guaranteed response or remediation timeline.

## Supported version

Only the latest version on the `main` branch is actively maintained.

## Credential handling

API keys are expected to be entered through LM Studio's protected plugin configuration field.
Never commit credentials to the repository or pass them as command-line arguments. The included
probe reads credentials from the `OPENAI_API_KEY` environment variable.
