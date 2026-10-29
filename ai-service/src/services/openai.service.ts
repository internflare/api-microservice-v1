import OpenAI from "openai";
import type { z } from "zod";
import { config } from "../config.js";
import { AppError } from "../utils/appError.js";

// One shared client; the SDK retries transient 429/5xx failures with backoff.
const openai = new OpenAI({
  apiKey: config.openaiApiKey,
  maxRetries: 3,
  timeout: 60_000,
});

// Ask the OpenAI model for a JSON object and validate it against a zod schema.
// Throws AppError 502 when the provider fails or returns something unusable.
export async function completeJson<T>(
  schema: z.ZodType<T>,
  system: string,
  user: string,
  temperature = 0.4,
): Promise<T> {
  try {
    const completion = await openai.chat.completions.create({
      model: config.openaiModel,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty completion");
    return schema.parse(JSON.parse(content));
  } catch (error) {
    throw new AppError(
      `AI provider failed: ${error instanceof Error ? error.message : "unknown error"}`,
      502,
    );
  }
}
