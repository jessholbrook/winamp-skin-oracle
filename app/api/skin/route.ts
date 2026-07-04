import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const HEX = { type: "string", pattern: "^#[0-9a-fA-F]{6}$" } as const;

const SPEC_SCHEMA = {
  type: "object",
  properties: {
    skinName: {
      type: "string",
      description:
        "A name for this skin in late-90s skin-site style, e.g. 'ChromeWasp v2', 'velvet_dialtone', 'MIDNIGHT OBLIVION XP'",
    },
    vibe: {
      type: "string",
      description: "One short sentence describing the skin's energy, written like a cryptic readme.txt",
    },
    colors: {
      type: "object",
      properties: {
        bgDark: { ...HEX, description: "Darkest chassis color" },
        bgLight: { ...HEX, description: "Lighter chassis color for bevels/highlights" },
        accent: { ...HEX, description: "Primary accent (title bar, buttons)" },
        accent2: { ...HEX, description: "Secondary accent" },
        text: { ...HEX, description: "Marquee/label text color, must read on bgDark" },
        display: { ...HEX, description: "LCD time display color, bright on near-black" },
        vis1: { ...HEX, description: "Visualizer bar base color" },
        vis2: { ...HEX, description: "Visualizer bar peak color" },
      },
      required: ["bgDark", "bgLight", "accent", "accent2", "text", "display", "vis1", "vis2"],
      additionalProperties: false,
    },
    texture: {
      type: "string",
      enum: ["scanlines", "noise", "checker", "diagonal", "gradient"],
      description: "Chassis texture treatment",
    },
    shape: {
      type: "string",
      enum: ["classic", "rounded", "chamfered", "jagged", "melted"],
      description:
        "Window silhouette. classic=rectangle, rounded=soft corners, chamfered=45-degree cut corners, jagged=sawtooth bottom edge, melted=wavy dripping bottom edge. Pick whatever the answers' energy demands.",
    },
    trackTitle: {
      type: "string",
      description:
        "A fake song title + artist for the marquee, derived from the user's answers, formatted like '1. Artist - Song Title'. Keep under 40 chars.",
    },
  },
  required: ["skinName", "vibe", "colors", "texture", "shape", "trackTitle"],
  additionalProperties: false,
} as const;

export async function POST(req: Request) {
  const body = (await req.json()) as {
    qa?: { question?: unknown; answer?: unknown }[];
  };

  // Clamp untrusted input server-side: the client's 3-question / 200-char
  // limits are advisory, and the transcript goes straight into a paid prompt.
  const qa = (Array.isArray(body.qa) ? body.qa : [])
    .slice(0, 3)
    .map((p) => ({
      question: String(p?.question ?? "").slice(0, 300),
      answer: String(p?.answer ?? "").slice(0, 300),
    }))
    .filter((p) => p.answer.trim());

  if (!qa.length) {
    return NextResponse.json({ error: "missing answers" }, { status: 400 });
  }

  const transcript = qa
    .map((p, i) => `Q${i + 1}: ${p.question}\nA${i + 1}: ${p.answer}`)
    .join("\n\n");

  try {
    const client = new Anthropic();

    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      system:
        "You are the design engine of a mystical Winamp skin generator. " +
        "You receive a user's answers to three surreal questions and translate them into a classic Winamp 2.x skin design. " +
        "Take the answers extremely seriously, as if they were a detailed creative brief. " +
        "Mine them for color, material, and mood. The palette must be cohesive and era-appropriate: " +
        "think brushed metal, alien goo, lava lamps, fake wood, vaporwave chrome, CRT phosphor. " +
        "High contrast where needed: 'display' and 'text' must be clearly readable on the dark chassis colors.",
      messages: [
        {
          role: "user",
          content: `Here is the completed ritual questionnaire:\n\n${transcript}\n\nDesign the skin.`,
        },
      ],
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SPEC_SCHEMA },
      },
    });

    const text = response.content.find((b) => b.type === "text");
    if (!text) throw new Error("no text block");

    return NextResponse.json({ spec: JSON.parse(text.text), source: "oracle" });
  } catch (err) {
    console.error("skin generation failed, using fallback:", err);
    return NextResponse.json({ spec: fallbackSpec(transcript), source: "fallback" });
  }
}

// Deterministic local spec derived from the answers, used if the API call fails.
function fallbackSpec(seedText: string) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
  const hue = Math.floor(rand() * 360);
  const hsl = (hh: number, s: number, l: number) => {
    const sf = s / 100, lf = l / 100;
    const a = sf * Math.min(lf, 1 - lf);
    const f = (n: number) => {
      const k = (n + hh / 30) % 12;
      const v = lf - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * v)
        .toString(16)
        .padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };
  const textures = ["scanlines", "noise", "checker", "diagonal", "gradient"] as const;
  const shapes = ["classic", "rounded", "chamfered", "jagged", "melted"] as const;
  return {
    skinName: `untitled_artifact_${Math.floor(rand() * 9000 + 1000)}`,
    vibe: "the oracle was silent, so the machine dreamed alone",
    colors: {
      bgDark: hsl(hue, 45, 12),
      bgLight: hsl(hue, 40, 28),
      accent: hsl((hue + 30) % 360, 70, 45),
      accent2: hsl((hue + 180) % 360, 65, 50),
      text: hsl(hue, 30, 85),
      display: hsl((hue + 120) % 360, 90, 60),
      vis1: hsl((hue + 90) % 360, 85, 50),
      vis2: hsl((hue + 90) % 360, 95, 75),
    },
    texture: textures[Math.floor(rand() * textures.length)],
    shape: shapes[Math.floor(rand() * shapes.length)],
    trackTitle: "1. The Machine - Dreaming Alone",
  };
}
