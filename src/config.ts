import { createConfigSchematics } from "@lmstudio/sdk";

// Per-chat settings. Model IDs are deliberately free-form: OpenAI-compatible
// providers do not share a stable, enumerable model catalogue.
export const configSchematics = createConfigSchematics()
  .field(
    "model",
    "string",
    {
      displayName: "Model ID",
      subtitle: "Enter the exact model ID accepted by the configured OpenAI-compatible endpoint.",
      placeholder: "glm-5.3-flash",
    },
    "",
  )
  .field(
    "temperature",
    "numeric",
    {
      displayName: "Temperature",
      subtitle: "Use -1 to let the endpoint choose its default.",
      min: -1,
      max: 2,
      step: 0.01,
      precision: 2,
    },
    -1,
  )
  .field(
    "maxTokens",
    "numeric",
    {
      displayName: "Max Tokens",
      subtitle: "Use 0 to let the endpoint choose its default.",
      min: 0,
      int: true,
      step: 1,
    },
    0,
  )
  .field(
    "stop",
    "stringArray",
    {
      displayName: "Stop Sequences",
      subtitle: "Optional stop sequences forwarded to the endpoint.",
      allowEmptyStrings: false,
    },
    [],
  )
  .build();

export const globalConfigSchematics = createConfigSchematics()
  .field(
    "baseUrl",
    "string",
    {
      displayName: "Base URL",
      subtitle: "Include the API version path, for example https://api.example.com/v1.",
      placeholder: "https://api.z.ai/api/coding/paas/v4",
    },
    "",
  )
  .field(
    "apiKey",
    "string",
    {
      displayName: "API Key",
      subtitle: "Leave empty only when the endpoint does not require authentication.",
      isProtected: true,
      placeholder: "API key",
    },
    "",
  )
  .field(
    "requestTimeoutMs",
    "numeric",
    {
      displayName: "Request Timeout (ms)",
      subtitle: "Maximum time to wait for the endpoint before showing a timeout error.",
      min: 1_000,
      max: 600_000,
      int: true,
      step: 1_000,
    },
    120_000,
  )
  .build();
