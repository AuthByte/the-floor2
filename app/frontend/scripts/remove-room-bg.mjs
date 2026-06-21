/**
 * One-off batch processor: runs every PNG in public/rooms/ through the
 * fal-ai/bria/background/remove model (RMBG 2.0) and overwrites the source
 * file with the transparent result. Re-run any time new room art is added.
 *
 * Usage (from app/frontend):
 *   node scripts/remove-room-bg.mjs
 *   node scripts/remove-room-bg.mjs jim_simons howard_marks
 */
import { fal } from "@fal-ai/client";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FAL_KEY = "360aca70-09f5-496b-a3cb-b6f2fa26a8a5:2e34fd2b905955d6954487e602af14dc";
const MODEL   = "fal-ai/bria/background/remove";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOMS_DIR = path.resolve(__dirname, "..", "public", "rooms");
const onlyKeys = process.argv.slice(2);

fal.config({ credentials: FAL_KEY });

async function processOne(file) {
  const full = path.join(ROOMS_DIR, file);
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
    throw new Error(`Fetch failed (${res.status} ${res.statusText}): ${imgUrl}`);
  }
  const out = Buffer.from(await res.arrayBuffer());

  await writeFile(full, out);
  const endBytes = out.byteLength;
  console.log(`done (${startBytes} → ${endBytes} bytes)`);
}

async function main() {
  const entries = await readdir(ROOMS_DIR);
  const requested = new Set(onlyKeys.map(key => `${key}.png`));
  const pngs = entries
    .filter(e => e.toLowerCase().endsWith(".png"))
    .filter(e => requested.size === 0 || requested.has(e))
    .sort();
  if (pngs.length === 0) {
    console.log(`No matching PNGs found in ${ROOMS_DIR}`);
    return;
  }
  console.log(`Processing ${pngs.length} room PNG(s) in ${ROOMS_DIR}`);

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
