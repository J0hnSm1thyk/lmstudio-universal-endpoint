import { type Chat, type GeneratorController } from "@lmstudio/sdk";
import OpenAI from "openai";
import {
  type ChatCompletionCreateParamsStreaming,
  type ChatCompletionMessageParam,
  type ChatCompletionMessageToolCall,
  type ChatCompletionTool,
  type ChatCompletionToolMessageParam,
} from "openai/resources/index";
import { createOpenAIClient, toUserFacingError } from "./client";
import { configSchematics, globalConfigSchematics } from "./config";

type ToolCallState = {
  id: string;
  name: string | null;
  index: number;
  arguments: string;
};

/** Convert internal chat history to the format expected by OpenAI-compatible endpoints. */
export function toOpenAIMessages(history: Chat): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];

  for (const message of history) {
    switch (message.getRole()) {
      case "system":
        messages.push({ role: "system", content: message.getText() });
        break;

      case "user":
        messages.push({ role: "user", content: message.getText() });
        break;

      case "assistant": {
        const toolCalls: ChatCompletionMessageToolCall[] = message
          .getToolCallRequests()
          .map(toolCall => ({
            id: toolCall.id ?? "",
            type: "function",
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.arguments ?? {}),
            },
          }));

        messages.push({
          role: "assistant",
          content: message.getText(),
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        });
        break;
      }

      case "tool":
        message.getToolCallResults().forEach(toolCallResult => {
          messages.push({
            role: "tool",
            tool_call_id: toolCallResult.toolCallId ?? "",
            content: toolCallResult.content,
          } as ChatCompletionToolMessageParam);
        });
        break;
    }
  }

  return messages;
}

/** Convert LM Studio tool definitions to OpenAI function-tool descriptors. */
function toOpenAITools(ctl: GeneratorController): ChatCompletionTool[] | undefined {
  const tools = ctl.getToolDefinitions().map<ChatCompletionTool>(tool => ({
    type: "function",
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters ?? {},
    },
  }));
  return tools.length ? tools : undefined;
}

function wireAbort(ctl: GeneratorController, stream: { controller: AbortController }) {
  ctl.onAborted(() => {
    stream.controller.abort();
  });
}

async function consumeStream(stream: AsyncIterable<unknown>, ctl: GeneratorController) {
  let current: ToolCallState | null = null;

  function flushCurrentToolCall() {
    if (current === null || current.name === null) return;

    try {
      ctl.toolCallGenerationEnded({
        type: "function",
        name: current.name,
        arguments: JSON.parse(current.arguments || "{}"),
        id: current.id,
      });
    } catch {
      ctl.toolCallGenerationFailed(
        new Error("The endpoint returned invalid JSON for a tool call's arguments."),
      );
    }
    current = null;
  }

  for await (const rawChunk of stream) {
    const chunk = rawChunk as {
      choices?: Array<{
        finish_reason?: string | null;
        delta?: {
          content?: string | null;
          tool_calls?: Array<{
            index: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) continue;

    if (delta.content) {
      ctl.fragmentGenerated(delta.content);
    }

    for (const toolCall of delta.tool_calls ?? []) {
      if (toolCall.id !== undefined) {
        flushCurrentToolCall();
        current = { id: toolCall.id, name: null, index: toolCall.index, arguments: "" };
        ctl.toolCallGenerationStarted({ toolCallId: toolCall.id });
      }

      if (toolCall.function?.name && current) {
        current.name = toolCall.function.name;
        ctl.toolCallGenerationNameReceived(toolCall.function.name);
      }

      if (toolCall.function?.arguments && current) {
        current.arguments += toolCall.function.arguments;
        ctl.toolCallGenerationArgumentFragmentGenerated(toolCall.function.arguments);
      }
    }

    if (chunk.choices?.[0]?.finish_reason === "tool_calls") {
      flushCurrentToolCall();
    }
  }

  // Some compatible endpoints omit finish_reason in their final SSE event.
  flushCurrentToolCall();
}

export async function generate(ctl: GeneratorController, history: Chat) {
  const config = ctl.getPluginConfig(configSchematics);
  const globalConfig = ctl.getGlobalPluginConfig(globalConfigSchematics);
  const model = config.get("model").trim();
  const apiKey = globalConfig.get("apiKey");

  if (!model) {
    throw new Error("Model ID is required. Enter the endpoint's exact model ID in plugin settings.");
  }

  try {
    const openai = createOpenAIClient({
      apiKey,
      baseUrl: globalConfig.get("baseUrl"),
      timeoutMs: globalConfig.get("requestTimeoutMs"),
    });
    const temperature = config.get("temperature");
    const maxTokens = config.get("maxTokens");
    const stop = config.get("stop");

    const request: ChatCompletionCreateParamsStreaming = {
      model,
      messages: toOpenAIMessages(history),
      tools: toOpenAITools(ctl),
      stream: true,
      ...(temperature >= 0 ? { temperature } : {}),
      ...(maxTokens > 0 ? { max_tokens: maxTokens } : {}),
      ...(stop.length ? { stop } : {}),
    };

    const stream = await openai.chat.completions.create(request);
    wireAbort(ctl, stream as unknown as { controller: AbortController });
    await consumeStream(stream as AsyncIterable<unknown>, ctl);
  } catch (error) {
    if (error instanceof OpenAI.APIUserAbortError) return;
    throw toUserFacingError(error, "chat completion", apiKey);
  }
}
