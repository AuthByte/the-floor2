/**
 * Remove backgrounds from hallway PNGs in public/hallways/.
 *
 * Usage (from app/frontend):
 *   node scripts/remove-hallway-bg.mjs
 *   node scripts/remove-hallway-bg.mjs hallway_horizontal
 */
import { fal } from "@fal-ai/client";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FAL_KEY = "360aca70-09f5-496b-a3cb-b6f2fa26a8a5:2e34fd2b905955d6954487e602af14dc";
const MODEL = "fal-ai/bria/background/remove";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HALLWAYS_DIR = path.resolve(__dirname, "..", "public", "hallways");
const onlyKeys = process.argv.slice(2);

fal.config({ credentials: FAL_KEY });

async function processOne(file) {
  const full = path.join(HALLWAYS_DIR, file);
  const startBytes = (await stat(full)).size;
  const buf = await readFile(full);

  process.stdout.write(`  → uploading… `);
  const f = new File([buf], file, { type: "image/png" });
  const uploadedUrl = await fal.storage.upload(f);

  process.stdout.write(`removing bg… `);
  const result = await fal.subscribe(MODEL, {
    input: { image_url: uploadedUrl },
  });

  const imgUrl = result?.data?.image?.url;
  if (!imgUrl) {
    throw new Error(`No image URL in response: ${JSON.stringify(result)}`);
  }

  process.stdout.write(`fetching… `);
  const res = await fetch(imgUrl);
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status}): ${imgUrl}`);
  }
  const out = Buffer.from(await res.arrayBuffer());
  await writeFile(full, out);
  console.log(`done (${startBytes} → ${out.byteLength} bytes)`);
}

async function main() {
  const entries = await readdir(HALLWAYS_DIR).catch(() => []);
  const requested = new Set(onlyKeys.map((key) => `${key}.png`));
  const pngs = entries
    .filter((e) => e.toLowerCase().endsWith(".png"))
    .filter((e) => requested.size === 0 || requested.has(e))
    .sort();

  if (pngs.length === 0) {
    console.log(`No PNGs in ${HALLWAYS_DIR} — run generate-hallway-images.mjs first.`);
    return;
  }

  console.log(`Processing ${pngs.length} hallway PNG(s)`);
  for (const file of pngs) {
    console.log(`[${file}]`);
    try {
      await processOne(file);
    } catch (err) {
      console.error(`  ✗ FAILED: ${err?.message ?? err}`);
      process.exitCode = 1;
    }
  }
  console.log("All done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
