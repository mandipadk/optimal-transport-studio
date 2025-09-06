import React, { useEffect, useRef, useState } from "react";

export function PlanHeatmap({
  P,
  N,
  M,
}: {
  P: Float32Array | null;
  N: number;
  M: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [robust, setRobust] = useState(true);
  useEffect(() => {
    const W = 320,
      H = 320,
      dpr = Math.min(2, window.devicePixelRatio || 1);
    const cvs = ref.current!;
    cvs.width = W * dpr;
    cvs.height = H * dpr;
    cvs.style.width = W + "px";
    cvs.style.height = H + "px";
    const ctx = cvs.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0b0e14";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#1f2937";
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    ctx.fillStyle = "#9ca3af";
    ctx.font = "12px ui-sans-serif";
    ctx.fillText("Plan heatmap (rows=source, cols=target)", 8, 18);

    if (!P) {
      ctx.fillText("n/a", 8, 36);
      return;
    }
    // Build high-contrast, CVD-friendly colormap (cividis-like) with gamma boost and robust max
    const total = N * M;
    let mx = 0;
    if (robust) {
      let robustMax = 0;
      if (total <= 4096) {
        const arr = Array.from(P).sort((a, b) => a - b);
        robustMax = arr[Math.floor(0.99 * (arr.length - 1))] || 0;
      } else {
        const sample: number[] = [];
        const step = Math.max(1, Math.floor(total / 4096));
        for (let idx = 0; idx < total; idx += step) sample.push(P[idx]);
        sample.sort((a, b) => a - b);
        robustMax = sample[Math.floor(0.99 * (sample.length - 1))] || 0;
      }
      mx = Math.max(robustMax, 1e-12);
    } else {
      // linear scaling uses global max
      for (let i = 0; i < total; i++) if (P[i] > mx) mx = P[i];
      mx = Math.max(mx, 1e-12);
    }
    const gamma = 0.5; // brighten small values
    const w = W - 40, // leave space for colorbar
      h = H - 40;
    const img = ctx.createImageData(w, h);
    const data = img.data;
    function lerp(a: number, b: number, t: number) {
      return a + (b - a) * t;
    }
    function colormap(t: number): [number, number, number] {
      // cividis-like simple 5-stop gradient
      const stops: [number, number, number, number][] = [
        [0.0, 0, 32, 76], // deep blue
        [0.25, 40, 110, 135],
        [0.5, 100, 140, 60],
        [0.75, 195, 160, 45],
        [1.0, 255, 233, 110], // warm yellow
      ];
      let k = 0;
      while (k + 1 < stops.length && t > stops[k + 1][0]) k++;
      const a = stops[k], b = stops[Math.min(k + 1, stops.length - 1)];
      const span = Math.max(1e-6, b[0] - a[0]);
      const tt = Math.max(0, Math.min(1, (t - a[0]) / span));
      return [
        Math.round(lerp(a[1], b[1], tt)),
        Math.round(lerp(a[2], b[2], tt)),
        Math.round(lerp(a[3], b[3], tt)),
      ];
    }
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        const ii = Math.floor((i * N) / h);
        const jj = Math.floor((j * M) / w);
        const raw = P[ii * M + jj];
        let v = raw / mx;
        v = Math.max(0, Math.min(1, v));
        v = Math.pow(v, gamma);
        const k = (i * w + j) * 4;
        const [r, g, b] = colormap(v);
        data[k] = r;
        data[k + 1] = g;
        data[k + 2] = b;
        data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 10, 30);
    // Draw a simple vertical colorbar
    const barX = 10 + w + 6;
    const barW = 12;
    for (let y = 0; y < h; y++) {
      const t = 1 - y / (h - 1);
      const [r, g, b] = colormap(Math.pow(t, gamma));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(barX, 30 + y, barW, 1);
    }
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px ui-sans-serif";
    ctx.fillText("low", barX + barW + 4, 30 + h - 2);
    ctx.fillText("high", barX + barW + 4, 30 + 10);
  }, [P, N, M, robust]);
  return (
    <div>
      <canvas
        ref={ref}
        title={
          robust
            ? "Plan heatmap: values scaled to 99th percentile; cividis-like colormap"
            : "Plan heatmap: values scaled to global max; cividis-like colormap"
        }
      />
      <div className="row small" style={{ marginTop: 6 }}>
        <label>
          <input
            type="checkbox"
            checked={robust}
            onChange={(e) => setRobust(e.target.checked)}
          />{" "}
          Robust contrast (99th percentile)
        </label>
      </div>
      <div className="small">
        Colormap: cividis‑like. Colorbar shows low → high mass. {robust
          ? "Clipped to 99th percentile for contrast."
          : "Scaled to global maximum."}
      </div>
    </div>
  );
}
