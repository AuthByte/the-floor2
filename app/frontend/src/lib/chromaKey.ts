import { useEffect, useState } from "react";

/**
 * Loads an image and returns a data-URL with the background flood-filled to
 * transparency. The fill starts from every pixel on the four borders of the
 * image and only consumes pixels that are (a) close in color to the top-left
 * pixel and (b) reachable from the exterior — so interior pixels matching the
 * background color (e.g. shadows that happen to be near-white inside a hex
 * frame) are preserved.
 *
 * @param url        Source image URL.
 * @param threshold  Euclidean color distance (0–~441) below which a pixel
 *                   counts as "background". Higher = more aggressive.
 */
export function useTransparentImage(url: string, threshold = 60): string | null {
  const [processed, setProcessed] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const w = img.width;
      const h = img.height;
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);

      const id = ctx.getImageData(0, 0, w, h);
      const d  = id.data;

      const bgR = d[0], bgG = d[1], bgB = d[2];
      const visited = new Uint8Array(w * h);

      const colorDist = (i: number): number => {
        const dr = d[i]     - bgR;
        const dg = d[i + 1] - bgG;
        const db = d[i + 2] - bgB;
        return Math.sqrt(dr * dr + dg * dg + db * db);
      };

      const queue: number[] = [];
      const seed = (px: number, py: number) => {
        const idx = py * w + px;
        if (!visited[idx] && colorDist(idx * 4) < threshold) {
          visited[idx] = 1;
          queue.push(idx);
        }
      };
      for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
      for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }

      while (queue.length) {
        const idx = queue.pop()!;
        d[idx * 4 + 3] = 0;
        const x = idx % w;
        const y = (idx - x) / w;
        if (x > 0) {
          const n = idx - 1;
          if (!visited[n] && colorDist(n * 4) < threshold) { visited[n] = 1; queue.push(n); }
        }
        if (x < w - 1) {
          const n = idx + 1;
          if (!visited[n] && colorDist(n * 4) < threshold) { visited[n] = 1; queue.push(n); }
        }
        if (y > 0) {
          const n = idx - w;
          if (!visited[n] && colorDist(n * 4) < threshold) { visited[n] = 1; queue.push(n); }
        }
        if (y < h - 1) {
          const n = idx + w;
          if (!visited[n] && colorDist(n * 4) < threshold) { visited[n] = 1; queue.push(n); }
        }
      }

      ctx.putImageData(id, 0, 0);
      if (!cancelled) setProcessed(canvas.toDataURL("image/png"));
    };
    img.src = url;
    return () => { cancelled = true; };
  }, [url, threshold]);

  return processed;
}
