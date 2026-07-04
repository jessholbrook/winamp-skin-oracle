import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FALLBACK_QUESTIONS = [
  "What does the static between radio stations smell like to you?",
  "If your shadow could hum one note forever, which household appliance would it annoy first?",
  "Describe the temperature of the year 1997.",
];

const QUESTIONS_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 3,
      description: "Exactly three short, surreal questions",
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

export async function GET() {
  try {
    const client = new Anthropic();
    const seed = Math.random().toString(36).slice(2, 8);

    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      // Questions are latency-sensitive and simple; skip adaptive thinking
      // (on by default on Sonnet 5 when the field is omitted).
      thinking: { type: "disabled" },
      system:
        "You generate intake questions for a mystical machine that designs classic Winamp skins. " +
        "The questions must be short (under 20 words each), nonsensical, surreal, and slightly unsettling in a funny way. " +
        "They should feel like a personality quiz written by a broken oracle. " +
        "Each question should secretly probe a different design axis: one about color/light, one about texture/material, one about mood/energy. " +
        "Never ask anything sensible like 'what is your favorite color'. Vary wildly between runs — choose something off-distribution and interesting.",
      messages: [
        {
          role: "user",
          content: `Generate exactly 3 questions. Inspiration entropy: ${seed}`,
        },
      ],
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: QUESTIONS_SCHEMA },
      },
    });

    const text = response.content.find((b) => b.type === "text");
    const parsed = text ? JSON.parse(text.text) : null;
    const questions: string[] = parsed?.questions?.slice(0, 3);

    if (!questions || questions.length < 3) throw new Error("bad output");

    return NextResponse.json({ questions, source: "oracle" });
  } catch (err) {
    console.error("question generation failed, using fallback:", err);
    return NextResponse.json({ questions: FALLBACK_QUESTIONS, source: "fallback" });
  }
}
