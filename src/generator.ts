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
  id?: string;
  name: string;
  index: number;
  arguments: string;
};

type CompatibleChatCompletionChunk = {
  choices?: Array<{
    finish_reason?: string | null;
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
      [key: string]: unknown;
    };
  }>;
};

export type StreamSummary = {
  chunks: number;
  contentCharacters: number;
  reasoningCharacters: number;
  toolCalls: number;
  finishReason: string | null;
  observedDeltaFields: string[];
};

type StreamController = Pick<
  GeneratorController,
  | "fragmentGenerated"
  | "toolCallGenerationStarted"
  | "toolCallGenerationNameReceived"
  | "toolCallGenerationArgumentFragmentGenerated"
  | "toolCallGenerationEnded"
  | "toolCallGenerationFailed"
>;

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

function appendDelta(existing: string, incoming: string | undefined): string {
  if (!incoming) return existing;
  // A few compatible servers send cumulative values instead of true deltas.
  if (incoming.startsWith(existing)) return incoming;
  return existing + incoming;
}

function emitToolCalls(toolCalls: Map<number, ToolCallState>, ctl: StreamController): number {
  let emitted = 0;

  for (const toolCall of [...toolCalls.values()].sort((left, right) => left.index - right.index)) {
    ctl.toolCallGenerationStarted(
      toolCall.id === undefined ? undefined : { toolCallId: toolCall.id },
    );

    if (!toolCall.name) {
      const error = new Error("The endpoint returned a tool call without a function name.");
      ctl.toolCallGenerationFailed(error);
      throw error;
    }

    ctl.toolCallGenerationNameReceived(toolCall.name);
    if (toolCall.arguments) {
      ctl.toolCallGenerationArgumentFragmentGenerated(toolCall.arguments);
    }

    let parsedArguments: unknown;
    try {
      parsedArguments = JSON.parse(toolCall.arguments || "{}");
    } catch {
      const error = new Error("The endpoint returned invalid JSON for a tool call's arguments.");
      ctl.toolCallGenerationFailed(error);
      throw error;
    }

    if (
      parsedArguments === null ||
      typeof parsedArguments !== "object" ||
      Array.isArray(parsedArguments)
    ) {
      const error = new Error("The endpoint returned non-object arguments for a tool call.");
      ctl.toolCallGenerationFailed(error);
      throw error;
    }

    ctl.toolCallGenerationEnded({
      type: "function",
      name: toolCall.name,
      arguments: parsedArguments as Record<string, unknown>,
      ...(toolCall.id === undefined ? {} : { id: toolCall.id }),
    });
    emitted += 1;
  }

  return emitted;
}

/** Consume parsed OpenAI-compatible SSE chunks and forward them to LM Studio. */
export async function consumeStream(
  stream: AsyncIterable<unknown>,
  ctl: StreamController,
): Promise<StreamSummary> {
  const toolCalls = new Map<number, ToolCallState>();
  const observedDeltaFields = new Set<string>();
  const summary: StreamSummary = {
    chunks: 0,
    contentCharacters: 0,
    reasoningCharacters: 0,
    toolCalls: 0,
    finishReason: null,
    observedDeltaFields: [],
  };

  for await (const rawChunk of stream) {
    summary.chunks += 1;
    const chunk = rawChunk as CompatibleChatCompletionChunk;
    const choice = chunk.choices?.[0];
    if (choice?.finish_reason) summary.finishReason = choice.finish_reason;

    const delta = choice?.delta;
    if (!delta) continue;
    Object.keys(delta).forEach(field => observedDeltaFields.add(field));

    if (typeof delta.content === "string" && delta.content.length > 0) {
      ctl.fragmentGenerated(delta.content);
      summary.contentCharacters += delta.content.length;
    }

    const reasoning =
      typeof delta.reasoning_content === "string"
        ? delta.reasoning_content
        : typeof delta.reasoning === "string"
          ? delta.reasoning
          : "";
    if (reasoning.length > 0) {
      ctl.fragmentGenerated(reasoning, { reasoningType: "reasoning" });
      summary.reasoningCharacters += reasoning.length;
    }

    for (const toolCall of delta.tool_calls ?? []) {
      const current = toolCalls.get(toolCall.index) ?? {
        index: toolCall.index,
        name: "",
        arguments: "",
      };
      if (toolCall.id !== undefined) current.id = toolCall.id;
      current.name = appendDelta(current.name, toolCall.function?.name);
      current.arguments = appendDelta(current.arguments, toolCall.function?.arguments);
      toolCalls.set(toolCall.index, current);
    }
  }

  summary.toolCalls = emitToolCalls(toolCalls, ctl);
  summary.observedDeltaFields = [...observedDeltaFields].sort();
  return summary;
}

/** Reject silent or reasoning-truncated completions instead of creating an empty chat message. */
export function validateStreamSummary(summary: StreamSummary): void {
  if (
    summary.contentCharacters === 0 &&
    summary.reasoningCharacters === 0 &&
    summary.toolCalls === 0
  ) {
    const finishReason = summary.finishReason ?? "not provided";
    const fields = summary.observedDeltaFields.join(", ") || "none";
    throw new Error(
      `The endpoint completed without text, reasoning, or tool calls ` +
        `(finish_reason: ${finishReason}; observed delta fields: ${fields}).`,
    );
  }

  if (
    summary.finishReason === "length" &&
    summary.contentCharacters === 0 &&
    summary.reasoningCharacters > 0 &&
    summary.toolCalls === 0
  ) {
    throw new Error(
      "The endpoint reached its token limit during reasoning before producing a final answer. " +
        "Increase Max Tokens or shorten the request.",
    );
  }
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

    const stream = await openai.chat.completions.create(request, {
      signal: ctl.abortSignal,
    });
    const summary = await consumeStream(stream as AsyncIterable<unknown>, ctl);

    if (ctl.abortSignal.aborted) return;
    validateStreamSummary(summary);
  } catch (error) {
    if (error instanceof OpenAI.APIUserAbortError) return;
    throw toUserFacingError(error, "chat completion", apiKey);
  }
}
