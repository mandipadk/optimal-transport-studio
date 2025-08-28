# Optimal‑Transport Studio

Interactive **entropic OT (Sinkhorn)** playground with:
- **Multi‑target blend (3+)**: compute maps to several targets and blend by weights
- **Plan heatmap** (optional) for small problems
- **WebGPU path** (experimental) for larger N (falls back to CPU worker automatically)
- **Draw‑your‑own** mass with a brush and sample points from it
- **GIF/MP4 export** of the interpolation using FFmpeg.wasm
- **Regularization schedules** (epsilon annealing) and **log‑domain** solver to handle tiny ε

## Quickstart
```bash
npm i
npm run dev
# open http://localhost:5173
```

Build & preview:
```bash
npm run build
npm run preview
```

## Notes
- Keep N, M ~ 200–600 for CPU path. Try the **WebGPU** toggle if the browser supports it.
- **Plan heatmap** is only computed when enabled and when N×M ≤ 65k (configurable).

## How multi‑target blend works
We compute a barycentric map \(T_k(X)\) to each target distribution \(
u_k\), then blend:
\[
T(X) \;=\; \sum_k w_k\, T_k(X),\quad \sum_k w_k = 1.
\]
This is a lightweight “visual barycenter.” A full OT barycenter solver can be added later (IBP / Bregman projections).

## Log‑domain solver
For very small ε, the linear scaling underflows. The **log‑domain** variant updates dual potentials with log‑sum‑exp and derives a stable map.

## Export
The first export loads the FFmpeg core into the browser. Expect a short delay before encoding.

## License
Apache‑2.0
