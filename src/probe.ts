import { createOpenAIClient, listModelIds, toUserFacingError } from "./client";

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const baseUrl = readArgument("--base-url") ?? process.env.OPENAI_BASE_URL ?? "";
  const model = readArgument("--model");
  const prompt = readArgument("--prompt") ?? "Reply with OK.";
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  const timeoutMs = Number(readArgument("--timeout-ms") ?? "30000");
  const useStreaming = !process.argv.includes("--no-stream");
  const showRaw = process.argv.includes("--raw");
  const client = createOpenAIClient({ baseUrl, apiKey, timeoutMs });

  if (!model) {
    try {
      const modelIds = await listModelIds(client);
      if (!modelIds.length) {
        console.log("The endpoint returned an empty model list.");
        return;
      }
      modelIds.forEach(modelId => console.log(modelId));
    } catch (error) {
      throw toUserFacingError(error, "model discovery", apiKey);
    }
    return;
  }

  try {
    if (!useStreaming) {
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
      });
      if (showRaw) {
        console.log(JSON.stringify(completion, null, 2));
        return;
      }

      const message = completion.choices[0]?.message as
        | {
            content?: string | null;
            reasoning_content?: string | null;
            reasoning?: string | null;
          }
        | undefined;
      const reasoning = message?.reasoning_content ?? message?.reasoning ?? "";
      const content = message?.content ?? "";
      if (reasoning) process.stdout.write(`[reasoning]\n${reasoning}\n`);
      if (content) process.stdout.write(`[content]\n${content}\n`);
      if (!reasoning && !content) {
        throw new Error("The endpoint returned no text or reasoning content.");
      }
      return;
    }

    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });
    let reasoningCharacters = 0;
    let contentCharacters = 0;
    let outputMode: "reasoning" | "content" | null = null;
    for await (const chunk of stream) {
      if (showRaw) {
        process.stdout.write(`${JSON.stringify(chunk)}\n`);
        continue;
      }

      const delta = chunk.choices[0]?.delta as
        | {
            content?: string | null;
            reasoning_content?: string | null;
            reasoning?: string | null;
          }
        | undefined;
      const reasoning = delta?.reasoning_content ?? delta?.reasoning ?? "";
      if (reasoning) {
        if (outputMode !== "reasoning") process.stdout.write("[reasoning]\n");
        outputMode = "reasoning";
        reasoningCharacters += reasoning.length;
        process.stdout.write(reasoning);
      }

      const content = delta?.content ?? "";
      if (content) {
        if (outputMode !== "content") process.stdout.write("\n[content]\n");
        outputMode = "content";
        contentCharacters += content.length;
        process.stdout.write(content);
      }
    }
    process.stdout.write("\n");
    if (!showRaw && reasoningCharacters === 0 && contentCharacters === 0) {
      throw new Error("The endpoint streamed no text or reasoning content.");
    }
  } catch (error) {
    throw toUserFacingError(error, "chat completion", apiKey);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Endpoint probe failed.");
  process.exitCode = 1;
});
