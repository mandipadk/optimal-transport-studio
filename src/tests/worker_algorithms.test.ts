import { describe, it, expect } from "vitest";
import {
  _computeCost,
  _sinkhornLinear,
  _sinkhornLog,
  _sinkhornBlend,
} from "../core/worker/ot.worker";

function nearlyEqual(a: Float32Array, b: Float32Array, tol = 1e-3) {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++)
    expect(Math.abs(a[i] - b[i])).toBeLessThanOrEqual(tol);
}

describe("worker internals", () => {
  it("computeCost returns pairwise squared distances", () => {
    const X = new Float32Array([0, 0, 1, 0]);
    const Y = new Float32Array([0, 0, 0, 1]);
    const C = _computeCost(X, Y);
    expect(C.length).toBe(4);
    // distances: from (0,0)->(0,0)=0, (0,0)->(0,1)=1, (1,0)->(0,0)=1, (1,0)->(0,1)=2
    expect(Array.from(C)).toEqual([0, 1, 1, 2]);
  });

  it("sinkhorn linear: identity on identical supports, uniform weights", () => {
    const X = new Float32Array([0, 0, 1, 0, 0, 1]);
    const Y = new Float32Array([0, 0, 1, 0, 0, 1]);
    const a = new Float32Array([1 / 3, 1 / 3, 1 / 3]);
    const b = new Float32Array([1 / 3, 1 / 3, 1 / 3]);
    const { T, P, err, N, M } = _sinkhornLinear(
      {
        mode: "solve",
        X,
        Y,
        a,
        b,
        epsilon: 0.1,
        maxIter: 500,
        tol: 1e-9,
        computePlan: true,
        planMaxCells: 1024,
      } as any,
      () => {}
    );
    nearlyEqual(T, X, 1e-2);
    expect(err).toBeLessThan(1e-3);
    expect(P).toBeTruthy();
    expect(N).toBe(3);
    expect(M).toBe(3);
    // row/col sums match marginals
    const Pm = P!;
    const rows = new Array(3).fill(0);
    const cols = new Array(3).fill(0);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        rows[i] += Pm[i * 3 + j];
        cols[j] += Pm[i * 3 + j];
      }
    }
    rows.forEach((v, i) => expect(v).toBeCloseTo(a[i], 3));
    cols.forEach((v, i) => expect(v).toBeCloseTo(b[i], 3));
  });

  it("sinkhorn log: similar to linear on identical supports", () => {
    const X = new Float32Array([0, 0, 1, 0, 0, 1]);
    const Y = new Float32Array([0, 0, 1, 0, 0, 1]);
    const a = new Float32Array([1 / 3, 1 / 3, 1 / 3]);
    const b = new Float32Array([1 / 3, 1 / 3, 1 / 3]);
    const { T, P, err } = _sinkhornLog(
      {
        mode: "solveLog",
        X,
        Y,
        a,
        b,
        epsilon: 0.1,
        maxIter: 500,
        tol: 1e-9,
        computePlan: true,
        planMaxCells: 1024,
      } as any,
      () => {}
    );
    nearlyEqual(T, X, 1e-2);
    expect(err).toBeLessThan(1e-2);
    expect(P).toBeTruthy();
  });

  it("sinkhorn blend: blending identical targets returns same map", () => {
    const X = new Float32Array([0, 0, 1, 0]);
    const a = new Float32Array([0.5, 0.5]);
    const Y1 = new Float32Array([0, 0, 1, 0]);
    const Y2 = new Float32Array([0, 0, 1, 0]);
    const b = new Float32Array([0.5, 0.5]);
    const out = _sinkhornBlend(
      {
        mode: "solveBlend",
        X,
        a,
        Ys: [Y1, Y2],
        Bs: [b, b],
        weights: [1, 1],
        epsilon: 0.1,
        maxIter: 200,
        tol: 1e-6,
      } as any,
      () => {},
      false
    );
    nearlyEqual(out.T, X, 1e-2);
    expect(out.err).toBeLessThan(1e-2);
  });
});
