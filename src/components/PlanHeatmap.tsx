import React, { useEffect, useRef } from "react";

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
    const img = ctx.createImageData(W - 20, H - 40);
    const data = img.data;
    // normalize
    let mx = 0;
    for (let i = 0; i < N * M; i++) if (P[i] > mx) mx = P[i];
    const w = W - 20,
      h = H - 40;
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        const ii = Math.floor((i * N) / h),
          jj = Math.floor((j * M) / w);
        const v = P[ii * M + jj] / (mx || 1);
        const k = (i * w + j) * 4;
        // viridis-like simple gradient
        const r = Math.round(255 * Math.max(0, Math.min(1, 1.5 * v - 0.1)));
        const g = Math.round(
          255 * Math.max(0, Math.min(1, 1.5 * (1 - v) - 0.1))
        );
        const b = Math.round(255 * (0.6 + 0.4 * (1 - v)));
        data[k] = r;
        data[k + 1] = g;
        data[k + 2] = b;
        data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 10, 30);
  }, [P, N, M]);
  return <canvas ref={ref} />;
}
