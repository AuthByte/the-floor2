/**
 * Remove background from newly generated room PNGs only (skips files
 * that already have transparent corners from a prior Bria pass).
 *
 * Usage: node scripts/remove-room-bg-new.mjs
 */
import { fal } from "@fal-ai/client";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FAL_KEY = "360aca70-09f5-496b-a3cb-b6f2fa26a8a5:2e34fd2b905955d6954487e602af14dc";
const MODEL = "fal-ai/bria/background/remove";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOMS_DIR = path.resolve(__dirname, "..", "public", "rooms");

fal.config({ credentials: FAL_KEY });

async function hasTransparentCorners(filePath) {
  const buf = await readFile(filePath);
  // PNG IHDR + minimal check: use sharp if available, else skip check
  try {
    const { default: sharp } = await import("sharp");
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const alphaAt = (x, y) => data[(y * width + x) * channels + (channels - 1)];
    const corners = [
      alphaAt(0, 0),
      alphaAt(width - 1, 0),
      alphaAt(0, height - 1),
      alphaAt(width - 1, height - 1),
    ];
    return corners.every((a) => a < 16);
  } catch {
    return false;
  }
}

async function processOne(file) {
  const full = path.join(ROOMS_DIR, file);
  const startBytes = (await stat(full)).size;
  const buf = await readFile(full);
  process.stdout.write(`  → uploading… `);
  const f = new File([buf], file, { type: "image/png" });
  const uploadedUrl = await fal.storage.upload(f);
  process.stdout.write(`removing bg… `);
  const result = await fal.subscribe(MODEL, { input: { image_url: uploadedUrl } });
  const imgUrl = result?.data?.image?.url;
  if (!imgUrl) throw new Error("No image URL in Bria response");
  const res = await fetch(imgUrl);
  const out = Buffer.from(await res.arrayBuffer());
  await writeFile(full, out);
  console.log(`done (${startBytes} → ${out.byteLength} bytes)`);
}

async function main() {
  const pngs = (await readdir(ROOMS_DIR)).filter((e) => e.endsWith(".png")).sort();
  console.log(`Checking ${pngs.length} PNG(s) in ${ROOMS_DIR}`);
  for (const file of pngs) {
    const full = path.join(ROOMS_DIR, file);
    if (await hasTransparentCorners(full)) {
      console.log(`[${file}] skip (already transparent)`);
      continue;
    }
    console.log(`[${file}]`);
    try {
      await processOne(file);
    } catch (err) {
      console.error(`  ✗ FAILED: ${err?.message ?? err}`);
      process.exitCode = 1;
    }
  }
  console.log("Done.");
}

main();
