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
    <div>
      <div className="studio-section-header">
        <h3 className="studio-text-heading">Targets</h3>
        <button className="studio-icon-button" onClick={add}>
          <i data-lucide="plus" className="w-4 h-4"></i>
        </button>
      </div>

      <div className="studio-target-tabs">
        {targets.map((t, idx) => (
          <div key={t.id} className="studio-target-tab active">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: idx % 2 === 0 ? '#10b981' : '#3b82f6' // green/blue alternating
              }}
            ></div>
            T{idx + 1}
            <button onClick={() => rem(t.id)}>
              <i data-lucide="x" className="w-3 h-3"></i>
            </button>
          </div>
        ))}
      </div>

      {targets.map((t, idx) => (
        <div key={t.id} className="mb-4">
          <div className="flex gap-2 mb-2">
            <button
              className="studio-button studio-button--secondary flex-1"
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
              <i data-lucide="shuffle" className="w-3 h-3"></i>
              Random
            </button>
            <label className="studio-button studio-button--secondary flex-1">
              <i data-lucide="image" className="w-3 h-3"></i>
              Image
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) =>
                  e.target.files && loadImg(t.id, e.target.files[0])
                }
              />
            </label>
          </div>

          <div className="studio-form-group">
            <label className="studio-form-label">Weight</label>
            <input
              className="studio-range w-full"
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={t.weight}
              onChange={(e) => updateWeight(t.id, parseFloat(e.target.value))}
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0.0</span>
              <span className="studio-text-mono">{t.weight.toFixed(1)}</span>
              <span>2.0</span>
            </div>
          </div>
        </div>
      ))}

      <div className="studio-text-caption">
        Weights are normalized automatically when blending maps.
      </div>
    </div>
  );
}
