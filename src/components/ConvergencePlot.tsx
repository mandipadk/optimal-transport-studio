import React, { useEffect, useRef } from "react";

export function ConvergencePlot({ history }: { history: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const W = 320,
      H = 140,
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
    if (history.length === 0) {
      ctx.fillStyle = "#9ca3af";
      ctx.font = "12px ui-sans-serif";
      ctx.fillText("No data", 8, 18);
      return;
    }
    const minVal = Math.min(...history, 1e-12),
      maxVal = Math.max(...history);
    const xs = (i: number) => (i / (history.length - 1 || 1)) * (W - 20) + 10;
    const ys = (v: number) => {
      const t =
        (Math.log10(v) - Math.log10(minVal)) /
        (Math.log10(maxVal) - Math.log10(minVal) + 1e-12);
      return (1 - t) * (H - 30) + 20;
    };
    ctx.strokeStyle = "#7dd3fc";
    ctx.beginPath();
    ctx.moveTo(xs(0), ys(history[0]));
    for (let i = 1; i < history.length; i++) ctx.lineTo(xs(i), ys(history[i]));
    ctx.stroke();
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px ui-sans-serif";
    ctx.fillText("log10 error", 12, H - 8);
  }, [history]);
  return <canvas ref={ref} />;
}
