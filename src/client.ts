import OpenAI from "openai";

export type EndpointClientConfig = {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
};

export type EndpointOperation = "model discovery" | "chat completion";

/** Validate and normalize a user-provided OpenAI-compatible API base URL. */
export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Base URL is required. Configure it in the plugin's global settings.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      "Base URL is invalid. Enter a complete http:// or https:// URL including the API version path.",
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Base URL must use http:// or https://.");
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Base URL must not contain credentials, query parameters, or a fragment.");
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

/** Build an SDK client without deriving the provider from the model name. */
export function createOpenAIClient(config: EndpointClientConfig): OpenAI {
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs < 1_000) {
    throw new Error("Request Timeout must be a number of at least 1000 milliseconds.");
  }

  return new OpenAI({
    apiKey: config.apiKey.trim() || "not-required",
    baseURL: normalizeBaseUrl(config.baseUrl),
    timeout: config.timeoutMs,
    maxRetries: 0,
  });
}

/** Fetch model IDs from the standard OpenAI-compatible GET /models endpoint. */
export async function listModelIds(client: OpenAI): Promise<string[]> {
  const response = await client.models.list();
  return response.data
    .map(model => model.id?.trim())
    .filter((id): id is string => Boolean(id))
    .sort((left, right) => left.localeCompare(right));
}

function redactSensitiveText(message: string, secrets: string[]): string {
  let redacted = message;

  for (const secret of secrets) {
    if (secret) {
      redacted = redacted.split(secret).join("[REDACTED]");
    }
  }

  redacted = redacted
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/(authorization["']?\s*[:=]\s*["']?)[^"',}\s]+/gi, "$1[REDACTED]")
    .replace(/((?:api[-_ ]?key|token)["']?\s*[:=]\s*["']?)[^"',}\s]+/gi, "$1[REDACTED]");

  return redacted.replace(/\s+/g, " ").trim().slice(0, 500);
}

export function statusSummary(status: number, operation: EndpointOperation): string {
  switch (status) {
    case 400:
      return "HTTP 400: the endpoint rejected the request. Verify the Model ID and request options.";
    case 401:
      return "HTTP 401: authentication failed. The API Key is missing or invalid.";
    case 403:
      return "HTTP 403: access is forbidden. Check the API Key permissions and model access.";
    case 404:
      return operation === "model discovery"
        ? "HTTP 404: /models is not supported at this Base URL. Manual Model ID entry remains available."
        : "HTTP 404: the chat endpoint or Model ID was not found. Check the Base URL and Model ID.";
    case 429:
      return "HTTP 429: the endpoint rate limit or quota was exceeded. Retry later or check the account quota.";
    default:
      if (status >= 500) {
        return `HTTP ${status}: the upstream endpoint failed. Retry later or check the provider status.`;
      }
      return `HTTP ${status}: the endpoint returned an error.`;
  }
}

/** Convert SDK/network failures to actionable messages without exposing headers or credentials. */
export function toUserFacingError(
  error: unknown,
  operation: EndpointOperation,
  apiKey = "",
): Error {
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new Error(
      `${operation === "model discovery" ? "Model discovery" : "Chat completion"} timed out. ` +
        "Check the Base URL, network connection, and Request Timeout setting.",
    );
  }

  if (error instanceof OpenAI.APIConnectionError) {
    return new Error(
      `${operation === "model discovery" ? "Model discovery" : "Chat completion"} could not connect ` +
        "to the endpoint. Check the Base URL, TLS certificate, server status, and network connection.",
    );
  }

  if (error instanceof OpenAI.APIError && typeof error.status === "number") {
    const summary = statusSummary(error.status, operation);
    const detail = redactSensitiveText(error.message, [apiKey]);
    const requestId = error.requestID ? ` Request ID: ${error.requestID}.` : "";
    return new Error(`${summary}${requestId}${detail ? ` Details: ${detail}` : ""}`);
  }

  const detail = redactSensitiveText(
    error instanceof Error ? error.message : String(error),
    [apiKey],
  );
  return new Error(
    `${operation === "model discovery" ? "Model discovery" : "Chat completion"} failed` +
      (detail ? `: ${detail}` : "."),
  );
}
