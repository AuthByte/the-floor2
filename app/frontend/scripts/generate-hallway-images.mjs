/**
 * Generate hex pixel-art hallway tiles via OpenRouter (Gemini image model).
 *
 * Usage (from app/frontend, OPENROUTER_API_KEY in repo .env):
 *   node scripts/generate-hallway-images.mjs
 *   node scripts/generate-hallway-images.mjs hallway_horizontal
 *   node scripts/generate-hallway-images.mjs --skip-existing
 */
import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_ENV = path.resolve(__dirname, "../../../.env");
const ROOMS_DIR = path.resolve(__dirname, "../public/rooms");
const HALLWAYS_DIR = path.resolve(__dirname, "../public/hallways");
const PROMPTS_FILE = path.resolve(__dirname, "hallway-prompts.json");
const MODEL = "google/gemini-3.1-flash-image-preview";

const args = process.argv.slice(2);
const skipExisting = args.includes("--skip-existing");
const onlyKeys = args.filter((a) => !a.startsWith("--"));

async function loadEnv() {
  try {
    const raw = await readFile(ROOT_ENV, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* no .env */
  }
}

function toDataUri(buf) {
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function extractImageB64(data) {
  const msg = data?.choices?.[0]?.message;
  if (!msg) return null;

  const images = msg.images;
  if (Array.isArray(images)) {
    for (const img of images) {
      const url = img?.image_url?.url ?? img?.url;
      if (typeof url === "string" && url.startsWith("data:")) {
        return url.split(",", 2)[1];
      }
    }
  }

  const content = msg.content;
  const parts = Array.isArray(content)
    ? content
    : content
      ? [{ type: "text", text: content }]
      : [];

  for (const part of parts) {
    if (part?.type === "image_url" && part.image_url?.url) {
      const url = part.image_url.url;
      if (url.startsWith("data:")) return url.split(",", 2)[1];
    }
    if (part?.inline_data?.data) return part.inline_data.data;
  }
  return null;
}

async function generateOne({ key, prompt, reference }, defaultRefBuf) {
  const outPath = path.join(HALLWAYS_DIR, `${key}.png`);

  if (skipExisting) {
    try {
      await access(outPath);
      console.log(`[${key}] skip (exists)`);
      return;
    } catch {
      /* generate */
    }
  }

  let refBuf = defaultRefBuf;
  if (reference) {
    const inHallways = path.join(HALLWAYS_DIR, reference);
    const inRooms = path.join(ROOMS_DIR, reference);
    try {
      refBuf = await readFile(inHallways);
    } catch {
      refBuf = await readFile(inRooms);
    }
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  process.stdout.write(`[${key}] generating… `);

  const fullPrompt = `IMPORTANT: You must output a generated PNG image (use the image output modality). Do not respond with text only.\n\n${prompt}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/AuthByte/the-floor2",
      "X-Title": "THE FLOOR Hallway Generator",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: toDataUri(refBuf) } },
            { type: "text", text: fullPrompt },
          ],
        },
      ],
      modalities: ["text", "image"],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = await res.json();
  const b64 = extractImageB64(data);
  if (!b64) {
    const text = JSON.stringify(data?.choices?.[0]?.message?.content ?? data).slice(0, 300);
    throw new Error(`No image in response: ${text}`);
  }

  const out = Buffer.from(b64, "base64");
  await writeFile(outPath, out);
  console.log(`saved ${out.byteLength} bytes → ${key}.png`);
}

async function main() {
  await loadEnv();
  const config = JSON.parse(await readFile(PROMPTS_FILE, "utf8"));
  let segments = config.segments;
  if (onlyKeys.length) {
    segments = segments.filter((s) => onlyKeys.includes(s.key));
  }

  const refDir = config.referenceDir === "hallways" ? HALLWAYS_DIR : ROOMS_DIR;
  const refPath = path.join(refDir, config.reference);
  const refBuf = await readFile(refPath);

  console.log(`Generating ${segments.length} hallway tile(s) with ${MODEL}`);
  for (const seg of segments) {
    try {
      await generateOne(seg, refBuf);
      await new Promise((r) => setTimeout(r, 2500));
    } catch (err) {
      console.error(`\n[${seg.key}] FAILED: ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log("Hallway generation complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
