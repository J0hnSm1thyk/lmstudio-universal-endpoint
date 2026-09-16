const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const {
  createOpenAIClient,
  listModelIds,
  normalizeBaseUrl,
  statusSummary,
  toUserFacingError,
} = require("../dist/client.js");

test("normalizes compatible endpoint base URLs", () => {
  assert.equal(
    normalizeBaseUrl("https://api.z.ai/api/coding/paas/v4/"),
    "https://api.z.ai/api/coding/paas/v4",
  );
  assert.throws(() => normalizeBaseUrl(""), /Base URL is required/);
  assert.throws(() => normalizeBaseUrl("file:///tmp/api"), /http:\/\/ or https:\/\//);
  assert.throws(
    () => normalizeBaseUrl("https://user:password@example.com/v1"),
    /must not contain credentials/,
  );
});

test("redacts API keys from user-facing errors", () => {
  const error = toUserFacingError(
    new Error("request failed with Authorization: Bearer top-secret and api_key=top-secret"),
    "chat completion",
    "top-secret",
  );
  assert.doesNotMatch(error.message, /top-secret/);
  assert.match(error.message, /\[REDACTED\]/);
});

test("maps required HTTP failures to actionable messages", () => {
  assert.match(statusSummary(401, "chat completion"), /API Key/);
  assert.match(statusSummary(403, "chat completion"), /forbidden/);
  assert.match(statusSummary(404, "model discovery"), /\/models is not supported/);
  assert.match(statusSummary(404, "chat completion"), /Model ID was not found/);
  assert.match(statusSummary(429, "chat completion"), /rate limit/);
  assert.match(statusSummary(503, "chat completion"), /upstream endpoint failed/);
});

test("lists models and streams chat against standard paths", async t => {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", chunk => (body += chunk));
    request.on("end", () => {
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        body,
      });

      if (request.method === "GET" && request.url === "/v1/models") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            object: "list",
            data: [{ id: "qwen3-coder" }, { id: "glm-5.3-flash" }],
          }),
        );
        return;
      }

      if (request.method === "POST" && request.url === "/v1/chat/completions") {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          'data: {"id":"test","object":"chat.completion.chunk","created":0,"model":"glm-5.3-flash","choices":[{"index":0,"delta":{"content":"OK"},"finish_reason":null}]}\n\n' +
            'data: [DONE]\n\n',
        );
        return;
      }

      response.writeHead(404).end();
    });
  });
  t.after(() => server.close());
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.notEqual(typeof address, "string");

  const client = createOpenAIClient({
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: "test-key",
    timeoutMs: 5_000,
  });

  assert.deepEqual(await listModelIds(client), ["glm-5.3-flash", "qwen3-coder"]);

  const stream = await client.chat.completions.create({
    model: "glm-5.3-flash",
    messages: [{ role: "user", content: "Hello" }],
    stream: true,
  });
  let content = "";
  for await (const chunk of stream) content += chunk.choices[0]?.delta?.content ?? "";
  assert.equal(content, "OK");

  assert.equal(requests[0].url, "/v1/models");
  assert.equal(requests[1].url, "/v1/chat/completions");
  assert.equal(requests[0].authorization, "Bearer test-key");
  assert.equal(JSON.parse(requests[1].body).model, "glm-5.3-flash");
});
