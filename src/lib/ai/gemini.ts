import "server-only";

import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";
import { z as zod } from "zod";

/**
 * One place that knows how to ask Gemini for JSON matching a schema.
 *
 * Both AI features want the same thing — a system prompt, a user message, and
 * a response shaped like a zod schema — so the SDK is touched here and nowhere
 * else. Swapping providers again means rewriting this file only.
 */

export class AiUnavailableError extends Error {}

/** Fast and cheap; both features are extraction and light reasoning. */
const DEFAULT_MODEL = "gemini-2.5-flash";

export function aiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** A picture to read alongside the prompt. Raw bytes, never a URL. */
export type ImagePart = { data: Uint8Array; mimeType: string };

export async function generateJson<T extends z.ZodType>({
  schema,
  system,
  prompt,
  image,
  maxOutputTokens = 4096,
}: {
  schema: T;
  system: string;
  prompt: string;
  image?: ImagePart;
  maxOutputTokens?: number;
}): Promise<z.infer<T>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AiUnavailableError(
      "AI features are off. Add GEMINI_API_KEY to your environment to turn them on.",
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    // The image goes first: the model reads parts in order, and the text that
    // follows is about the picture rather than the other way round.
    contents: image
      ? [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: image.mimeType,
                  data: Buffer.from(image.data).toString("base64"),
                },
              },
              { text: prompt },
            ],
          },
        ]
      : prompt,
    config: {
      systemInstruction: system,
      // Constrains the decoder to the schema, so the reply is parseable by
      // construction rather than by hoping the model formatted it right.
      responseMimeType: "application/json",
      responseJsonSchema: zod.toJSONSchema(schema, { io: "output" }),
      maxOutputTokens,
      // Nutrition figures should not wander between identical requests.
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) {
    // Safety blocks and token exhaustion both land here with no text.
    const reason = response.candidates?.[0]?.finishReason;
    throw new Error(
      reason ? `The model returned nothing (${reason}).` : "The model returned nothing.",
    );
  }

  // The schema constrains generation but does not guarantee it, so the reply is
  // still validated before anything downstream trusts it.
  const parsed = schema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error(`The model's reply did not match the expected shape.`);
  }
  return parsed.data;
}
