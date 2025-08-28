export function randomPointCloud(
  n: number,
  seed: number = 1
): { X: Float32Array; w: Float32Array } {
  let s = seed >>> 0;
  const rand = () => (
    (s = (1664525 * s + 1013904223) >>> 0), (s & 0xfffffff) / 0x10000000
  );
  const X = new Float32Array(n * 2);
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = 0.2 + 0.6 * rand();
    const th = 2 * Math.PI * rand();
    const jitter = 0.05 * (rand() - 0.5);
    X[2 * i] = r * Math.cos(th) + jitter;
    X[2 * i + 1] = r * Math.sin(th) + jitter;
    w[i] = 1.0 / n;
  }
  return { X, w };
}

export function normalizeWeights(w: Float32Array): Float32Array {
  let s = 0.0;
  for (let i = 0; i < w.length; i++) s += w[i];
  if (s <= 0) return w;
  const out = new Float32Array(w.length);
  for (let i = 0; i < w.length; i++) out[i] = w[i] / s;
  return out;
}

export async function samplePointsFromImage(
  url: string,
  n: number
): Promise<{ X: Float32Array; w: Float32Array }> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const off = document.createElement("canvas");
  const W = 128,
    H = 128;
  off.width = W;
  off.height = H;
  const ctx = off.getContext("2d")!;
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const mass = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = data[4 * i],
      g = data[4 * i + 1],
      b = data[4 * i + 2];
    const y = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    mass[i] = y * y;
  }
  let sum = 0;
  for (let i = 0; i < mass.length; i++) sum += mass[i];
  if (sum <= 1e-12) {
    return randomPointCloud(n);
  }
  const cdf = new Float32Array(mass.length);
  let acc = 0;
  for (let i = 0; i < mass.length; i++) {
    acc += mass[i];
    cdf[i] = acc / sum;
  }
  const X = new Float32Array(n * 2);
  const w = new Float32Array(n);
  w.fill(1 / n);
  for (let k = 0; k < n; k++) {
    const u = Math.random();
    let lo = 0,
      hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (u <= cdf[mid]) hi = mid;
      else lo = mid + 1;
    }
    const px = lo % W,
      py = Math.floor(lo / W);
    const jitterX = (Math.random() - 0.5) / W,
      jitterY = (Math.random() - 0.5) / H;
    X[2 * k] = ((px + jitterX) / W) * 2 - 1;
    X[2 * k + 1] = ((py + jitterY) / H) * 2 - 1;
  }
  return { X, w };
}
