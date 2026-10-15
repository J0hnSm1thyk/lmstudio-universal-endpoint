const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { createOpenAIClient } = require("../dist/client.js");
const { consumeStream, generate, validateStreamSummary } = require("../dist/generator.js");

function makeController() {
  const result = {
    content: "",
    reasoning: "",
    started: [],
    names: [],
    argumentFragments: [],
    ended: [],
    failures: [],
  };

  return {
    result,
    fragmentGenerated(content, opts = {}) {
      if (opts.reasoningType === "reasoning") result.reasoning += content;
      else result.content += content;
    },
    toolCallGenerationStarted(value) {
      result.started.push(value?.toolCallId);
    },
    toolCallGenerationNameReceived(name) {
      result.names.push(name);
    },
    toolCallGenerationArgumentFragmentGenerated(fragment) {
      result.argumentFragments.push(fragment);
    },
    toolCallGenerationEnded(toolCall) {
      result.ended.push(toolCall);
    },
    toolCallGenerationFailed(error) {
      result.failures.push(error.message);
    },
  };
}

function sse(data) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function writeFragmented(response, payload) {
  const widths = [1, 2, 5, 3, 8, 13];
  let offset = 0;
  let widthIndex = 0;
  while (offset < payload.length) {
    const width = widths[widthIndex++ % widths.length];
    response.write(payload.slice(offset, offset + width));
    offset += width;
    await new Promise(resolve => setImmediate(resolve));
  }
  response.end();
}

async function main() {
  const server = http.createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    const parsed = JSON.parse(body || "{}");

    if (parsed.stream === false) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: "mock",
          object: "chat.completion",
          created: 1,
          model: "mock-model",
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                reasoning_content: "Thinking",
                content: "Final answer",
              },
            },
          ],
        }),
      );
      return;
    }

    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const payload =
      sse({ choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] }) +
      sse({ choices: [{ index: 0, delta: { reasoning_content: "Think" }, finish_reason: null }] }) +
      sse({ choices: [{ index: 0, delta: { reasoning_content: "ing" }, finish_reason: null }] }) +
      sse({ choices: [{ index: 0, delta: { content: "Final " }, finish_reason: null }] }) +
      sse({ choices: [{ index: 0, delta: { content: "answer" }, finish_reason: null }] }) +
      sse({
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                { index: 0, id: "call-a", function: { name: "first", arguments: '{"a":' } },
                { index: 1, id: "call-b", function: { name: "second", arguments: '{"b":' } },
              ],
            },
            finish_reason: null,
          },
        ],
      }) +
      sse({
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                { index: 0, function: { arguments: "1}" } },
                { index: 1, function: { arguments: "2}" } },
              ],
            },
            finish_reason: null,
          },
        ],
      }) +
      sse({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] }) +
      "data: [DONE]\n\n";
    await writeFragmented(response, payload);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");
  const client = createOpenAIClient({
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: "test-key",
    timeoutMs: 10_000,
  });

  try {
    const nonStreaming = await client.chat.completions.create({
      model: "mock-model",
      messages: [{ role: "user", content: "test" }],
      stream: false,
    });
    assert.equal(nonStreaming.choices[0].message.content, "Final answer");
    assert.equal(nonStreaming.choices[0].message.reasoning_content, "Thinking");

    const stream = await client.chat.completions.create({
      model: "mock-model",
      messages: [{ role: "user", content: "test" }],
      stream: true,
    });
    const controller = makeController();
    const summary = await consumeStream(stream, controller);
    validateStreamSummary(summary);

    assert.equal(controller.result.reasoning, "Thinking");
    assert.equal(controller.result.content, "Final answer");
    assert.deepEqual(
      controller.result.ended.map(call => call.arguments),
      [{ a: 1 }, { b: 2 }],
    );
    assert.equal(summary.toolCalls, 2);
    assert.equal(summary.finishReason, "tool_calls");

    const pluginController = makeController();
    const abortController = new AbortController();
    Object.assign(pluginController, {
      abortSignal: abortController.signal,
      getToolDefinitions: () => [],
      getPluginConfig: () => ({
        get(key) {
          return {
            model: "mock-model",
            temperature: -1,
            maxTokens: 0,
            stop: [],
          }[key];
        },
      }),
      getGlobalPluginConfig: () => ({
        get(key) {
          return {
            baseUrl: `http://127.0.0.1:${address.port}/v1`,
            apiKey: "test-key",
            requestTimeoutMs: 10_000,
          }[key];
        },
      }),
    });
    await generate(pluginController, []);
    assert.equal(pluginController.result.reasoning, "Thinking");
    assert.equal(pluginController.result.content, "Final answer");
    assert.equal(pluginController.result.ended.length, 2);

    const reasoningAliasController = makeController();
    const aliasSummary = await consumeStream(
      (async function* () {
        yield { choices: [{ delta: { reasoning: "Alias reasoning" }, finish_reason: "stop" }] };
      })(),
      reasoningAliasController,
    );
    validateStreamSummary(aliasSummary);
    assert.equal(reasoningAliasController.result.reasoning, "Alias reasoning");

    const invalidToolController = makeController();
    await assert.rejects(
      () =>
        consumeStream(
          (async function* () {
            yield {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: "bad-call",
                        function: { name: "broken", arguments: '{"missing":' },
                      },
                    ],
                  },
                  finish_reason: "tool_calls",
                },
              ],
            };
          })(),
          invalidToolController,
        ),
      /invalid JSON/,
    );
    assert.deepEqual(invalidToolController.result.failures, [
      "The endpoint returned invalid JSON for a tool call's arguments.",
    ]);

    assert.throws(
      () =>
        validateStreamSummary({
          chunks: 2,
          contentCharacters: 0,
          reasoningCharacters: 0,
          toolCalls: 0,
          finishReason: "stop",
          observedDeltaFields: ["role"],
        }),
      /completed without text, reasoning, or tool calls/,
    );
    assert.throws(
      () =>
        validateStreamSummary({
          chunks: 3,
          contentCharacters: 0,
          reasoningCharacters: 100,
          toolCalls: 0,
          finishReason: "length",
          observedDeltaFields: ["reasoning_content"],
        }),
      /token limit during reasoning/,
    );

    console.log(
      "Streaming verification passed: fragmented SSE, full plugin path, reasoning, content, " +
        "multiple tools, malformed tools, and empty-output errors.",
    );
  } finally {
    server.close();
    await once(server, "close");
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
