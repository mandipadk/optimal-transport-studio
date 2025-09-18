import React, { useEffect, useRef } from "react";
export function PointCanvas({
  title,
  points,
  weights,
  color,
}: {
  title: string;
  points: Float32Array;
  weights: Float32Array;
  color: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cvs = ref.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    // Make canvases take available space but stay square
    const container = cvs.parentElement;
    const containerWidth = container?.clientWidth || 800;
    const maxSize = Math.min(containerWidth - 40, 600); // Leave some padding, max 600px
    const W = maxSize;
    const H = maxSize;

    cvs.width = W * dpr;
    cvs.height = H * dpr;
    cvs.style.width = W + "px";
    cvs.style.height = H + "px";

    const ctx = cvs.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Use studio background colors
    ctx.fillStyle = "oklch(0.0800 0.0040 240)"; // var(--studio-bg)
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "oklch(0.2000 0.0160 240)"; // var(--studio-border)
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    const N = weights.length;
    const rBase = 2.3;
    for (let i = 0; i < N; i++) {
      const x = points[2 * i],
        y = points[2 * i + 1];
      const xi = (x * 0.5 + 0.5) * (W - 20) + 10;
      const yi = (y * 0.5 + 0.5) * (H - 20) + 10;
      const r = rBase + 2 * Math.sqrt(Math.max(0, weights[i]));
      ctx.beginPath();
      ctx.arc(xi, yi, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [points, weights, color]);
  return (
    <canvas
      ref={ref}
      style={{ borderRadius: "0.5rem", display: "block", margin: "0 auto" }}
    />
  );
}
