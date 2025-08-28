import React from "react";
import { randomPointCloud, samplePointsFromImage } from "../core/sampling";

export type Points = { X: Float32Array; w: Float32Array };

export function MultiTargetsPanel({
  targets,
  setTargets,
}: {
  targets: { pts: Points; weight: number; id: string }[];
  setTargets: (x: { pts: Points; weight: number; id: string }[]) => void;
}) {
  const add = async () => {
    const n = 180 + Math.floor(Math.random() * 60);
    const pts = randomPointCloud(n, Math.floor(Math.random() * 1e6));
    setTargets([
      ...targets,
      { pts, weight: 1, id: Math.random().toString(36).slice(2) },
    ]);
  };
  const rem = (id: string) => setTargets(targets.filter((t) => t.id !== id));
  const updateWeight = (id: string, w: number) =>
    setTargets(targets.map((t) => (t.id === id ? { ...t, weight: w } : t)));
  const loadImg = async (id: string, f: File) => {
    const url = URL.createObjectURL(f);
    const pts = await samplePointsFromImage(url, 220);
    URL.revokeObjectURL(url);
    setTargets(targets.map((t) => (t.id === id ? { ...t, pts } : t)));
  };
  const totalW = targets.reduce((s, t) => s + t.weight, 0) || 1;
  return (
    <div className="card">
      <h4>Targets (blend 3+)</h4>
      <div className="list">
        {targets.map((t, idx) => (
          <div key={t.id} className="card">
            <div className="row">
              <strong>Target {idx + 1}</strong>
              <button className="btn" onClick={() => rem(t.id)}>
                Remove
              </button>
              <label className="btn">
                Load Image
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) =>
                    e.target.files && loadImg(t.id, e.target.files[0])
                  }
                />
              </label>
              <button
                className="btn"
                onClick={() => {
                  const n = 200;
                  setTargets(
                    targets.map((x) =>
                      x.id === t.id
                        ? {
                            ...x,
                            pts: randomPointCloud(
                              n,
                              Math.floor(Math.random() * 1e6)
                            ),
                          }
                        : x
                    )
                  );
                }}
              >
                Random
              </button>
            </div>
            <div className="slider">
              <input
                className="range"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={t.weight}
                onChange={(e) => updateWeight(t.id, parseFloat(e.target.value))}
              />
              <span className="badge">{(t.weight / totalW).toFixed(2)}</span>
            </div>
            <div className="small">
              Normalized weight = {(t.weight / totalW).toFixed(3)}
            </div>
          </div>
        ))}
      </div>
      <div className="row">
        <button className="btn" onClick={add}>
          Add Target
        </button>
      </div>
      <div className="small">
        Weights are normalized automatically when blending maps.
      </div>
    </div>
  );
}
