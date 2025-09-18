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

    // Initialize Lucide icons
    if (typeof (window as any).lucide !== 'undefined') {
      (window as any).lucide.createIcons();
    }
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

  // Initialize Lucide icons on component updates
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 100);
    return () => clearTimeout(timer);
  });

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
    <div className="studio-layout">
      {/* Header */}
      <header className="studio-header">
        <div className="studio-logo">
          <i data-lucide="target" className="w-6 h-6" style={{ color: 'var(--studio-primary)' }}></i>
          Optimal Transport Studio
        </div>

        <div className="studio-toolbar">
          <div className="studio-badge studio-badge--primary">
            <i data-lucide="zap" className="w-3 h-3"></i>
            WebGPU
          </div>
          <button className="studio-button studio-button--ghost" onClick={share}>
            <i data-lucide="share-2" className="w-4 h-4"></i>
            Share
          </button>
          <a
            className="studio-button studio-button--ghost"
            href="https://en.wikipedia.org/wiki/Optimal_transport"
            target="_blank"
          >
            <i data-lucide="help-circle" className="w-4 h-4"></i>
            Help
          </a>
          <button className="studio-button studio-button--ghost">
            <i data-lucide="settings" className="w-4 h-4"></i>
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className="studio-sidebar">
        {/* Source Section */}
        <div className="studio-section">
          <div className="studio-section-header">
            <h3 className="studio-text-heading">Source</h3>
          </div>

          <div className="space-y-3">
            <button
              className="studio-button studio-button--secondary w-full"
              onClick={() =>
                setLeft(randomPointCloud(220, Math.floor(Math.random() * 1e6)))
              }
            >
              <i data-lucide="shuffle" className="w-4 h-4"></i>
              Random Source
            </button>
            <label className="studio-button studio-button--secondary w-full">
              <i data-lucide="image" className="w-4 h-4"></i>
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
            <button className="studio-button studio-button--secondary w-full">
              <i data-lucide="paintbrush" className="w-4 h-4"></i>
              Draw Mode
            </button>
          </div>

          <div className="studio-card mt-4">
            <div className="studio-text-caption mb-2">Canvas Preview</div>
            <DrawCanvas
              onUse={async (url) =>
                setLeft(await samplePointsFromImage(url, 220))
              }
            />
          </div>
        </div>

        {/* Targets Section */}
        <div className="studio-section">
          <MultiTargetsPanel targets={targets} setTargets={setTargets} />
        </div>

        {/* Solver Parameters */}
        <div className="studio-section">
          <div className="studio-section-header">
            <h3 className="studio-text-heading">Solver</h3>
          </div>

          <div className="space-y-4">
            <div className="studio-form-group">
              <label className="studio-form-label">ε (entropy)</label>
              <input
                className="studio-range w-full"
                type="range"
                min="0.01"
                max="0.3"
                step="0.005"
                value={epsilon}
                onChange={(e) => setEps(parseFloat(e.target.value))}
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0.01</span>
                <span className="studio-text-mono">{epsilon.toFixed(3)}</span>
                <span>0.30</span>
              </div>
            </div>

            <div className="studio-form-group">
              <label className="studio-form-label">Max Iterations</label>
              <input
                className="studio-input"
                type="number"
                value={maxIter}
                onChange={(e) => setMaxIter(parseInt(e.target.value))}
              />
            </div>

            <div className="studio-form-group">
              <label className="studio-form-label">Tolerance</label>
              <input
                className="studio-input"
                type="number"
                value={tol}
                step="1e-7"
                onChange={(e) => setTol(parseFloat(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  className="rounded border-gray-600"
                  checked={useLog}
                  onChange={(e) => setUseLog(e.target.checked)}
                />
                <span className="studio-text-body">Log‑domain updates</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  className="rounded border-gray-600"
                  checked={scheduleOn}
                  onChange={(e) => setScheduleOn(e.target.checked)}
                />
                <span className="studio-text-body">Anneal ε</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  className="rounded border-gray-600"
                  checked={computePlan}
                  onChange={(e) => setComputePlan(e.target.checked)}
                />
                <span className="studio-text-body">Plan heatmap</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  className="rounded border-gray-600"
                  checked={useGPU}
                  disabled={!gpuOK}
                  onChange={(e) => setUseGPU(e.target.checked)}
                />
                <span className="studio-text-body">Use WebGPU</span>
              </label>
              {gpuNote && <div className="studio-text-caption">{gpuNote}</div>}
            </div>

            {scheduleOn && (
              <div className="studio-form-group">
                <label className="studio-form-label">ε Schedule</label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="studio-text-caption">Start</span>
                    <input
                      className="studio-input"
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
                  </div>
                  <div>
                    <span className="studio-text-caption">End</span>
                    <input
                      className="studio-input"
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
                  </div>
                  <div>
                    <span className="studio-text-caption">Steps</span>
                    <input
                      className="studio-input"
                      type="number"
                      value={schedule.steps}
                      onChange={(e) =>
                        setSchedule({
                          ...schedule,
                          steps: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            <button
              className="studio-button studio-button--primary w-full"
              disabled={run === "solving"}
              onClick={onSolve}
            >
              <i data-lucide="play" className="w-4 h-4"></i>
              {run === "solving" ? "Solving..." : "Solve"}
            </button>

            {(run === "solving" || result) && (
              <div className="studio-text-caption">
                {run === "solving"
                  ? "Running solver..."
                  : result
                  ? `Dual error: ${(hist.at(-1) ?? 0).toExponential(2)}`
                  : ""}
              </div>
            )}
          </div>
        </div>

        {/* Convergence Plot */}
        <div className="studio-section">
          <div className="studio-section-header">
            <h3 className="studio-text-heading">Convergence</h3>
          </div>
          <ConvergencePlot history={hist} />
        </div>

        {/* Export */}
        <div className="studio-section">
          <div className="studio-section-header">
            <h3 className="studio-text-heading">Export</h3>
          </div>
          <Exporter renderFrame={renderFrame} />
        </div>
      </aside>

      {/* Main Content */}
      <main className="studio-main">
        {/* Workspace Grid */}
        <div className="studio-workspace">
          {/* Source Canvas */}
          <div className="studio-canvas">
            <div className="flex items-center justify-between mb-3">
              <h4 className="studio-text-subheading">Source</h4>
              <div className="studio-badge">N = {left.w.length}</div>
            </div>
            <div className="studio-canvas-content">
              <PointCanvas
                title="Source"
                points={left.X}
                weights={left.w}
                color="#7dd3fc"
              />
              <div className="studio-text-caption mt-4 text-center">
                Left distribution
              </div>
            </div>
          </div>

          {/* Interpolated Canvas */}
          <div className="studio-canvas">
            <div className="flex items-center justify-between mb-3">
              <h4 className="studio-text-subheading">Interpolated</h4>
              <div className="studio-badge studio-badge--success">
                {result ? "Active" : "Idle"}
              </div>
            </div>
            <div className="studio-canvas-content">
              <PointCanvas
                title="Interpolated"
                points={result ? interp ?? left.X : left.X}
                weights={left.w}
                color="#bbf7d0"
              />
              <div className="studio-text-caption mt-4 text-center mb-4">
                Displacement interpolation: (1−t)·X + t·T_blend(X)
              </div>

              {/* Animation Controls */}
              <div className="w-full">
                <div className="studio-control-panel" style={{
                  margin: '0',
                  padding: 'var(--studio-space-sm)',
                  background: 'var(--studio-surface-elevated)',
                  width: '100%',
                  maxWidth: '450px'
                }}>
                  <div className="studio-play-controls">
                    <button
                      className="studio-icon-button"
                      onClick={() => setT(0)}
                      disabled={!result}
                    >
                      <i data-lucide="skip-back" className="w-4 h-4"></i>
                    </button>
                    <button
                      className={`studio-icon-button ${anim ? "active" : ""}`}
                      disabled={!result}
                      onClick={() => setAnim((a) => !a)}
                    >
                      <i data-lucide={anim ? "pause" : "play"} className="w-4 h-4"></i>
                    </button>
                    <button
                      className="studio-icon-button"
                      onClick={() => setT(1)}
                      disabled={!result}
                    >
                      <i data-lucide="skip-forward" className="w-4 h-4"></i>
                    </button>
                  </div>

                  <div className="studio-timeline">
                    <span className="studio-text-mono text-sm">t:</span>
                    <input
                      className="studio-range flex-1"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={t}
                      onChange={(e) => setT(parseFloat(e.target.value))}
                      disabled={!result}
                    />
                    <span className="studio-text-mono text-sm">{t.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Plan Heatmap */}
          <div className="studio-canvas">
            <div className="flex items-center justify-between mb-3">
              <h4 className="studio-text-subheading">Plan Heatmap</h4>
              <div className="studio-badge studio-badge--warning">
                {planShape ? `${planShape[0]}×${planShape[1]}` : "Disabled"}
              </div>
            </div>
            <div className="studio-canvas-content">
              {computePlan && plan && planShape ? (
                <>
                  <PlanHeatmap P={plan} N={planShape[0]} M={planShape[1]} />
                  <div className="studio-text-caption mt-4 text-center">
                    Transport Matrix ({planShape[0]}×{planShape[1]})
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center" style={{ height: '400px' }}>
                  <i data-lucide="grid-3x3" className="w-16 h-16 text-gray-500 mb-4"></i>
                  <div className="studio-text-caption text-center">
                    Enable plan heatmap and keep N×M small
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* KPI Dashboard */}
          <div className="studio-canvas">
            <div className="flex items-center justify-between mb-3">
              <h4 className="studio-text-subheading">Metrics</h4>
              <div className="studio-status-indicator">
                <div className="studio-status-dot"></div>
                {run === "solving" ? "Solving" : result ? "Solved" : "Ready"}
              </div>
            </div>
            <div className="studio-kpi-grid w-full max-w-lg">
              <div className="studio-kpi-card">
                <span className="studio-kpi-value">{epsilon.toFixed(3)}</span>
                <div className="studio-kpi-label">ε</div>
              </div>
              <div className="studio-kpi-card">
                <span className="studio-kpi-value">{hist.length}</span>
                <div className="studio-kpi-label">iter</div>
              </div>
              <div className="studio-kpi-card">
                <span className="studio-kpi-value">
                  {(hist.at(-1) ?? 0).toExponential(1)}
                </span>
                <div className="studio-kpi-label">error</div>
              </div>
              <div className="studio-kpi-card">
                <span className="studio-kpi-value">{targets.length}</span>
                <div className="studio-kpi-label">targets</div>
              </div>
              <div className="studio-kpi-card">
                <span className="studio-kpi-value">
                  {useLog ? "LOG" : "LIN"}
                </span>
                <div className="studio-kpi-label">domain</div>
              </div>
              <div className="studio-kpi-card">
                <span className="studio-kpi-value">
                  {useGPU ? "GPU" : "CPU"}
                </span>
                <div className="studio-kpi-label">compute</div>
              </div>
            </div>
            <div className="studio-text-caption mt-4 text-center">
              Multi‑target blend: compute T_k to each target, then T = Σ w_k T_k
            </div>
          </div>
        </div>
      </main>

      {/* Status Bar */}
      <div className="studio-status">
        <div className="flex items-center space-x-4">
          <div className="studio-status-indicator">
            <div className="studio-status-dot"></div>
            {run === "solving" ? "Solving" : result ? "Ready" : "Ready"}
          </div>
          <span className="studio-text-caption">N: {left.w.length} points</span>
          <span className="studio-text-caption">Targets: {targets.length}</span>
          {result && (
            <span className="studio-text-caption">
              Last error: {(hist.at(-1) ?? 0).toExponential(2)}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-4">
          <div
            className={`studio-badge ${
              gpuOK ? "studio-badge--success" : "studio-badge--warning"
            }`}
          >
            <i data-lucide="zap" className="w-3 h-3"></i>
            {gpuOK ? "GPU Available" : "CPU Only"}
          </div>
          <span className="studio-text-caption studio-text-mono">OTS v0.2.0</span>
        </div>
      </div>
    </div>
  );
}
