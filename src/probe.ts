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
    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) process.stdout.write(content);
    }
    process.stdout.write("\n");
  } catch (error) {
    throw toUserFacingError(error, "chat completion", apiKey);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Endpoint probe failed.");
  process.exitCode = 1;
});
