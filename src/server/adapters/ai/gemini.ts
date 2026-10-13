import "server-only";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { z } from "zod";
import { CapabilitySchema, type Capability, type Category } from "@/lib/schemas";
import { TIMEOUTS } from "../../config/constants";
import { env } from "../../config/env";

const OutputSchema = z.object({ preferredCapabilities: z.array(CapabilitySchema).max(5) });

/**
 * Asks Gemini which extra capabilities the free text suggests. The output is
 * schema-validated and can only ADD preferences; the required-capability gate
 * always comes from the category map, so AI can never let an unsuitable
 * hospital through. The text is not stored or logged.
 */
export async function geminiPreferredCapabilities(category: Category, text: string): Promise<Capability[]> {
  const key = env().GEMINI_API_KEY;
  if (!key) throw new Error("not_configured");
  const model = new GoogleGenerativeAI(key).getGenerativeModel({
    model: env().GEMINI_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0,
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          preferredCapabilities: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING, format: "enum", enum: [...CapabilitySchema.options] },
          },
        },
        required: ["preferredCapabilities"],
      },
    },
  });
  const prompt =
    "You map an emergency description to hospital capabilities. Return only capabilities clearly implied by the text. " +
    `Emergency category chosen by the user: ${category}. Description (may be Hindi or English): """${text.slice(0, 500)}"""`;
  const result = await model.generateContent(prompt, { timeout: TIMEOUTS.geminiMs });
  const parsed = OutputSchema.safeParse(JSON.parse(result.response.text()));
  if (!parsed.success) throw new Error("invalid_output");
  return parsed.data.preferredCapabilities;
}
