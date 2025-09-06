import React, { useEffect, useMemo, useRef, useState } from "react";
import { PointCanvas } from "./components/PointCanvas";
import { ConvergencePlot } from "./components/ConvergencePlot";
import { MultiTargetsPanel, type Points } from "./components/MultiTargetsPanel";
import { DrawCanvas } from "./components/DrawCanvas";
import { PlanHeatmap } from "./components/PlanHeatmap";
import { Exporter } from "./components/Exporter";
import {
  displacementInterpolate,
  sinkhornWorkerBlend,
  sinkhornWorkerSolve,
  type SinkhornResult,
} from "./core/sinkhorn";
import { randomPointCloud, samplePointsFromImage } from "./core/sampling";
import { encodeStateToUrl, decodeStateFromUrl } from "./core/utils";
import { hasWebGPU } from "./core/gpu";

type RunState = "idle" | "solving" | "solved";

export default function App() {
  const [left, setLeft] = useState<Points>(() => randomPointCloud(220, 0x1234));
  const [targets, setTargets] = useState<
    { pts: Points; weight: number; id: string }[]
  >([
    { pts: randomPointCloud(220, 0x1001), weight: 1, id: "t1" },
    { pts: randomPointCloud(220, 0x1002), weight: 1, id: "t2" },
  ]);

  const [epsilon, setEps] = useState(0.06);
  const [maxIter, setMaxIter] = useState(500);
  const [tol, setTol] = useState(1e-6);
  const [t, setT] = useState(0.0);
  const [run, setRun] = useState<RunState>("idle");
  const [hist, setHist] = useState<number[]>([]);
  const [result, setResult] = useState<SinkhornResult | null>(null);
  const [anim, setAnim] = useState(false);
  const [computePlan, setComputePlan] = useState(false);
  const [plan, setPlan] = useState<Float32Array | null>(null);
  const [planShape, setPlanShape] = useState<[number, number] | null>(null);
  const [useLog, setUseLog] = useState(false);
  const [useGPU, setUseGPU] = useState(false);
  const [gpuOK, setGpuOK] = useState(false);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [schedule, setSchedule] = useState({
    start: 0.12,
    end: 0.03,
    steps: 3,
  });

  useEffect(() => {
    hasWebGPU()
      .then(setGpuOK)
      .catch(() => setGpuOK(false));
  }, []);

  useEffect(() => {
    const st = decodeStateFromUrl();
    if (st) {
      setLeft(st.left);
      setTargets(st.targets?.length ? st.targets : targets);
      setEps(st.epsilon ?? 0.05);
      setMaxIter(st.maxIter ?? 500);
      setTol(st.tol ?? 1e-6);
      setUseLog(!!st.useLog);
    }
  }, []);

  // Solve single vs. blend depending on #targets (>=1 always blend path; if exactly 1 we still go blend)
  const onSolve = async () => {
    setRun("solving");
    setResult(null);
    setHist([]);
    setPlan(null);
    setPlanShape(null);
    // prepare animation state
    setAnim(false);
    setT(0);
    const norm = targets.reduce((s, t) => s + t.weight, 0) || 1;
    const tgts = targets.map((t) => ({
      X: t.pts.X,
      w: t.pts.w,
      weight: t.weight / norm,
    }));
    // If there's exactly one target and plan heatmap is requested, use single-target solver
    if (tgts.length === 1 && computePlan) {
      const right = { X: tgts[0].X, w: tgts[0].w };
      const res = await sinkhornWorkerSolve(
        left,
        right,
        { epsilon, maxIter, tol, computePlan, planMaxCells: 65536 },
        (err) => setHist((prev) => [...prev, err]),
        useLog,
        scheduleOn ? schedule : null
      );
      setResult(res);
      setRun("solved");
      setPlan(res.P ?? null);
      setPlanShape(res.N && res.M ? [res.N, res.M] : null);
      setAnim(true); // auto-animate after completion
    } else {
      // Blend path for 1+ targets (no plan available here)
      const res = await sinkhornWorkerBlend(
        left,
        tgts,
        { epsilon, maxIter, tol, computePlan, planMaxCells: 65536 },
        (err) => setHist((prev) => [...prev, err]),
        useLog,
        scheduleOn ? schedule : null
      );
      setResult(res);
      setRun("solved");
      setAnim(true); // auto-animate after completion
    }
  };

  // Interpolated positions
  const interp = useMemo(() => {
    if (!result) return null;
    const T = result.T;
    return displacementInterpolate(left.X, T, t);
  }, [result, left, t]);

  // Animation
  useEffect(() => {
    if (!result || !anim) return;
    let raf: number,
      dir = 1,
      tt = t;
    const step = () => {
      tt += dir * 0.01;
      if (tt >= 1) {
        tt = 1;
        dir = -1;
      }
      if (tt <= 0) {
        tt = 0;
        dir = 1;
      }
      setT(tt);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [result, anim]);

  const onLoadLeft = async (f: File) => {
    const arr = await f.arrayBuffer();
    const url = URL.createObjectURL(new Blob([arr]));
    const pts = await samplePointsFromImage(url, 220);
    URL.revokeObjectURL(url);
    setLeft(pts);
  };

  const share = () => {
    const link = encodeStateToUrl({
      left,
      targets,
      epsilon,
      maxIter,
      tol,
      schedule: scheduleOn ? schedule : null,
      useLog,
    });
    navigator.clipboard.writeText(link).catch(() => {});
    alert("Sharable link copied to clipboard!");
  };

  const gpuNote = !gpuOK ? (
    <span className="warn">
      WebGPU not supported; falling back to CPU worker.
    </span>
  ) : useGPU ? (
    <span className="ok">WebGPU enabled (experimental).</span>
  ) : null;

  // Exporter: render interpolated frame
  const renderFrame = (tt: number, cvs: HTMLCanvasElement) => {
    const Z = result ? displacementInterpolate(left.X, result.T, tt) : left.X;
    const weights = left.w;
    const ctx = cvs.getContext("2d")!;
    const W = cvs.width,
      H = cvs.height;
    const draw = (pts: Float32Array, color: string) => {
      ctx.fillStyle = color;
      for (let i = 0; i < weights.length; i++) {
        const x = pts[2 * i],
          y = pts[2 * i + 1];
        const xi = (x * 0.5 + 0.5) * (W - 20) + 10;
        const yi = (1 - (y * 0.5 + 0.5)) * (H - 20) + 10;
        const r = 2 + 2 * Math.sqrt(weights[i]);
        ctx.beginPath();
        ctx.arc(xi, yi, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    ctx.fillStyle = "#0b0e14";
    ctx.fillRect(0, 0, W, H);
    draw(Z, "#bbf7d0");
  };

  return (
    <div className="app">
      <header className="header row">
        <div style={{ fontWeight: 600 }}>Optimal‑Transport Studio</div>
        <div className="badge">
          Multi‑target blend • Plan heatmap • WebGPU • Draw
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={share}>
          Share
        </button>
        <a
          className="btn"
          href="https://en.wikipedia.org/wiki/Optimal_transport"
          target="_blank"
        >
          What is OT?
        </a>
      </header>

      <aside className="sidebar">
        <div className="section">
          <div className="row">
            <strong>Source</strong>
          </div>
          <div className="row">
            <button
              className="btn"
              onClick={() =>
                setLeft(randomPointCloud(220, Math.floor(Math.random() * 1e6)))
              }
            >
              Random Source
            </button>
            <label className="btn">
              Load Image
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) =>
                  e.target.files && onLoadLeft(e.target.files[0])
                }
              />
            </label>
          </div>
          <DrawCanvas
            onUse={async (url) =>
              setLeft(await samplePointsFromImage(url, 220))
            }
          />
        </div>

        <div className="section">
          <MultiTargetsPanel targets={targets} setTargets={setTargets} />
        </div>

        <div className="section">
          <div className="row">
            <strong>Solver</strong>
          </div>
          <div className="row">
            ε (entropy):{" "}
            <input
              className="range"
              type="range"
              min="0.01"
              max="0.3"
              step="0.005"
              value={epsilon}
              onChange={(e) => setEps(parseFloat(e.target.value))}
            />{" "}
            <span className="badge">{epsilon.toFixed(3)}</span>
          </div>
          <div className="row">
            maxIter:{" "}
            <input
              className="input"
              type="number"
              value={maxIter}
              onChange={(e) => setMaxIter(parseInt(e.target.value))}
            />
          </div>
          <div className="row">
            tol:{" "}
            <input
              className="input"
              type="number"
              value={tol}
              step="1e-7"
              onChange={(e) => setTol(parseFloat(e.target.value))}
            />
          </div>
          <div className="row">
            <label>
              <input
                type="checkbox"
                checked={useLog}
                onChange={(e) => setUseLog(e.target.checked)}
              />{" "}
              Log‑domain updates
            </label>
          </div>
          <div className="row">
            <label>
              <input
                type="checkbox"
                checked={scheduleOn}
                onChange={(e) => setScheduleOn(e.target.checked)}
              />{" "}
              Anneal ε
            </label>
            {scheduleOn && (
              <>
                <span>start</span>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={schedule.start}
                  onChange={(e) =>
                    setSchedule({
                      ...schedule,
                      start: parseFloat(e.target.value),
                    })
                  }
                />
                <span>end</span>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={schedule.end}
                  onChange={(e) =>
                    setSchedule({
                      ...schedule,
                      end: parseFloat(e.target.value),
                    })
                  }
                />
                <span>steps</span>
                <input
                  className="input"
                  type="number"
                  value={schedule.steps}
                  onChange={(e) =>
                    setSchedule({
                      ...schedule,
                      steps: parseInt(e.target.value),
                    })
                  }
                />
              </>
            )}
          </div>
          <div className="row">
            <label>
              <input
                type="checkbox"
                checked={computePlan}
                onChange={(e) => setComputePlan(e.target.checked)}
              />{" "}
              Plan heatmap (small N)
            </label>
          </div>
          <div className="row">
            <label>
              <input
                type="checkbox"
                checked={useGPU}
                disabled={!gpuOK}
                onChange={(e) => setUseGPU(e.target.checked)}
              />{" "}
              Use WebGPU (experimental)
            </label>
            {gpuNote}
          </div>
          <div className="row">
            <button
              className="btn primary"
              disabled={run === "solving"}
              onClick={onSolve}
            >
              Solve
            </button>
            <span className="small">
              {run === "solving"
                ? "Running…"
                : result
                ? `Dual err: ${(hist.at(-1) ?? 0).toExponential(2)}`
                : ""}
            </span>
          </div>
        </div>

        <div className="section">
          <Exporter renderFrame={renderFrame} />
        </div>

        <div className="section">
          <div className="row">
            <strong>Convergence</strong>
          </div>
          <ConvergencePlot history={hist} />
        </div>
      </aside>

      <main className="content">
        <div className="grid">
          <div className="canvasWrap">
            <PointCanvas
              title="Source"
              points={left.X}
              weights={left.w}
              color="#7dd3fc"
            />
            <div className="caption">Left distribution (N={left.w.length})</div>
          </div>
          <div className="canvasWrap">
            <PointCanvas
              title="Interpolated"
              points={result ? interp ?? left.X : left.X}
              weights={left.w}
              color="#bbf7d0"
            />
            <div className="caption">
              Displacement interpolation: (1−t)·X + t·T_blend(X)
            </div>
            <div className="row">
              t:{" "}
              <input
                className="range"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={t}
                onChange={(e) => setT(parseFloat(e.target.value))}
              />{" "}
              <span className="badge">{t.toFixed(2)}</span>{" "}
              <button
                className="btn"
                disabled={!result}
                onClick={() => setAnim((a) => !a)}
              >
                {anim ? "Stop" : "Animate"}
              </button>
            </div>
          </div>
          <div className="canvasWrap">
            {computePlan && plan && planShape ? (
              <PlanHeatmap P={plan} N={planShape[0]} M={planShape[1]} />
            ) : (
              <div className="center small" style={{ height: 320 }}>
                Enable plan heatmap and keep N×M small.
              </div>
            )}
          </div>
          <div className="canvasWrap">
            <div className="kpi">
              <div>
                ε: <strong>{epsilon.toFixed(3)}</strong>
              </div>
              <div>
                iter: <strong>{hist.length}</strong>
              </div>
              <div>
                err: <strong>{(hist.at(-1) ?? 0).toExponential(2)}</strong>
              </div>
              <div>
                targets: <strong>{targets.length}</strong>
              </div>
              <div>{useLog ? "log‑domain" : "linear"}</div>
            </div>
            <div className="caption">
              Multi‑target blend: compute T_k to each target, then T = Σ w_k
              T_k.
            </div>
          </div>
        </div>
      </main>

      <footer className="footer small">
        <span>
          © OTS — entropic OT (Sinkhorn) with multi-target blend, plan heatmap,
          WebGPU path, drawing, URL sharing, and GIF/MP4 export.
        </span>
      </footer>
    </div>
  );
}
