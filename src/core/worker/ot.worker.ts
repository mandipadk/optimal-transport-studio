/// <reference lib="webworker" />
type SolveReq = {
  mode: "solve" | "solveLog" | "solveBlend" | "solveLogBlend";
  X: Float32Array;
  Y?: Float32Array;
  a: Float32Array;
  b?: Float32Array;
  Ys?: Float32Array[];
  Bs?: Float32Array[];
  weights?: number[];
  epsilon: number;
  maxIter: number;
  tol: number;
  computePlan?: boolean;
  planMaxCells?: number;
  schedule?: { start: number; end: number; steps: number } | null;
};
type WorkerResp =
  | { kind: "progress"; err: number }
  | {
      kind: "done";
      T: Float32Array;
      iter: number;
      err: number;
      P?: Float32Array | null;
      N?: number;
      M?: number;
    };

function computeCost(X: Float32Array, Y: Float32Array): Float64Array {
  const N = X.length / 2,
    M = Y.length / 2;
  const C = new Float64Array(N * M);
  for (let i = 0; i < N; i++) {
    const xi = X[2 * i],
      yi = X[2 * i + 1];
    for (let j = 0; j < M; j++) {
      const xj = Y[2 * j],
        yj = Y[2 * j + 1];
      const dx = xi - xj,
        dy = yi - yj;
      C[i * M + j] = dx * dx + dy * dy;
    }
  }
  return C;
}

function sinkhornBarycentricLinear(
  req: SolveReq,
  post: (m: WorkerResp) => void
): {
  T: Float32Array;
  iter: number;
  err: number;
  P?: Float32Array | null;
  N?: number;
  M?: number;
} {
  const {
    X,
    Y,
    a,
    b,
    epsilon,
    maxIter,
    tol,
    computePlan = false,
    planMaxCells = 65536,
  } = req;
  if (!Y || !b) throw new Error("Missing target");
  const N = a.length,
    M = b.length;
  const C = computeCost(X, Y);
  const K = new Float64Array(N * M);
  const scale = -1.0 / Math.max(1e-12, epsilon);
  for (let i = 0; i < N * M; i++) K[i] = Math.exp(scale * C[i]);

  const u = new Float64Array(N);
  for (let i = 0; i < N; i++) u[i] = 1.0 / N;
  const v = new Float64Array(M);
  for (let j = 0; j < M; j++) v[j] = 1.0 / M;

  const Kv = new Float64Array(N);
  const KT_u = new Float64Array(M);
  let err = Infinity,
    iter = 0;
  for (iter = 0; iter < maxIter; iter++) {
    for (let i = 0; i < N; i++) {
      let s = 0.0;
      const off = i * M;
      for (let j = 0; j < M; j++) s += K[off + j] * v[j];
      Kv[i] = s;
    }
    let maxErr = 0.0;
    for (let i = 0; i < N; i++) {
      const newUi = a[i] / Math.max(1e-300, Kv[i]);
      maxErr = Math.max(maxErr, Math.abs(newUi - u[i]));
      u[i] = newUi;
    }
    for (let j = 0; j < M; j++) {
      let s = 0.0;
      for (let i = 0; i < N; i++) s += K[i * M + j] * u[i];
      KT_u[j] = s;
    }
    for (let j = 0; j < M; j++) {
      const newVj = b[j] / Math.max(1e-300, KT_u[j]);
      maxErr = Math.max(maxErr, Math.abs(newVj - v[j]));
      v[j] = newVj;
    }
    let rowErr = 0.0;
    for (let i = 0; i < N; i++) rowErr += Math.abs(u[i] * Kv[i] - a[i]);
    let colErr = 0.0;
    for (let j = 0; j < M; j++) colErr += Math.abs(v[j] * KT_u[j] - b[j]);
    err = rowErr + colErr;
    if (iter % 10 === 0) post({ kind: "progress", err });
    if (err < tol) break;
  }

  // Barycentric map
  const T = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    let den = 0.0,
      sx = 0.0,
      sy = 0.0;
    const off = i * M;
    for (let j = 0; j < M; j++) {
      const w = K[off + j] * v[j];
      den += w;
      sx += w * Y[2 * j];
      sy += w * Y[2 * j + 1];
    }
    if (den <= 1e-20) {
      T[2 * i] = X[2 * i];
      T[2 * i + 1] = X[2 * i + 1];
    } else {
      T[2 * i] = sx / den;
      T[2 * i + 1] = sy / den;
    }
  }

  // Optional plan
  let P: Float32Array | null = null;
  if (computePlan && N * M <= planMaxCells) {
    P = new Float32Array(N * M);
    for (let i = 0; i < N; i++) {
      const off = i * M;
      for (let j = 0; j < M; j++) P[off + j] = u[i] * K[off + j] * v[j];
    }
  }
  return { T, iter: iter + 1, err, P, N, M };
}

// log-domain utilities
function logsumexp(arr: Float64Array, len?: number): number {
  const actualLen = len ?? arr.length;
  let m = -Infinity;
  for (let i = 0; i < actualLen; i++) if (arr[i] > m) m = arr[i];
  if (!isFinite(m)) return -Infinity;
  let s = 0.0;
  for (let i = 0; i < actualLen; i++) s += Math.exp(arr[i] - m);
  return m + Math.log(s);
}

function sinkhornBarycentricLog(req: SolveReq, post: (m: WorkerResp) => void) {
  const {
    X,
    Y,
    a,
    b,
    epsilon,
    maxIter,
    tol,
    computePlan = false,
    planMaxCells = 65536,
  } = req;
  if (!Y || !b) throw new Error("Missing target");
  const N = a.length,
    M = b.length;
  const C = computeCost(X, Y);
  const loga = new Float64Array(N);
  const logb = new Float64Array(M);
  for (let i = 0; i < N; i++) loga[i] = Math.log(Math.max(1e-300, a[i]));
  for (let j = 0; j < M; j++) logb[j] = Math.log(Math.max(1e-300, b[j]));
  let f = new Float64Array(N);
  f.fill(0.0); // dual potentials
  let g = new Float64Array(M);
  g.fill(0.0);
  let err = Infinity,
    iter = 0;
  const tmp = new Float64Array(Math.max(N, M));
  for (iter = 0; iter < maxIter; iter++) {
    let maxErr = 0.0;
    // update f
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++)
        tmp[j] = (g[j] - C[i * M + j]) / Math.max(1e-12, epsilon) + logb[j];
      const lse = logsumexp(tmp, M);
      const newf = loga[i] - lse;
      if (isFinite(newf)) {
        maxErr = Math.max(maxErr, Math.abs(newf - f[i]));
        f[i] = newf;
      }
    }
    // update g
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < N; i++)
        tmp[i] = (f[i] - C[i * M + j]) / Math.max(1e-12, epsilon) + loga[i];
      const lse = logsumexp(tmp, N);
      const newg = logb[j] - lse;
      if (isFinite(newg)) {
        maxErr = Math.max(maxErr, Math.abs(newg - g[j]));
        g[j] = newg;
      }
    }
    err = maxErr;
    if (iter % 5 === 0) post({ kind: "progress", err });
    if (err < tol) break;
  }
  // derive v from g: v_j ~ exp(g_j) (up to scaling); but for barycentric map we need K*v rowwise sums
  const v = new Float64Array(M);
  for (let j = 0; j < M; j++) {
    v[j] = isFinite(g[j]) ? Math.exp(g[j]) : 1e-10;
  }
  // barycentric map using K_ij*v_j with K from exp(-C/eps)
  const T = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    let den = 0.0,
      sx = 0.0,
      sy = 0.0;
    for (let j = 0; j < M; j++) {
      const kij = Math.exp(-C[i * M + j] / Math.max(1e-12, epsilon));
      const w = kij * v[j];
      if (isFinite(w)) {
        den += w;
        sx += w * Y[2 * j];
        sy += w * Y[2 * j + 1];
      }
    }
    if (den <= 1e-30) {
      T[2 * i] = X[2 * i];
      T[2 * i + 1] = X[2 * i + 1];
    } else {
      T[2 * i] = sx / den;
      T[2 * i + 1] = sy / den;
    }
  }
  let P: Float32Array | null = null;
  if (computePlan && N * M <= planMaxCells) {
    P = new Float32Array(N * M);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        const kij = Math.exp(-C[i * M + j] / Math.max(1e-12, epsilon));
        const u = Math.exp(f[i]);
        const vv = Math.exp(g[j]);
        P[i * M + j] = u * kij * vv;
      }
    }
  }
  return { T, iter: iter + 1, err, P, N, M };
}

// Blend multiple targets: compute T_k per target, then T = sum_k w_k T_k (weights normalized)
function sinkhornBlend(
  req: SolveReq,
  post: (m: WorkerResp) => void,
  useLog: boolean
) {
  const {
    X,
    a,
    Ys = [],
    Bs = [],
    weights = [],
    epsilon,
    maxIter,
    tol,
    schedule,
  } = req;
  const K = Ys.length;
  if (K === 0) throw new Error("no targets");
  const wsum = weights.reduce((s, v) => s + v, 0) || 1;
  const W = weights.map((v) => v / wsum);
  let T = new Float32Array(X.length);
  T.set(X); // init
  let itTot = 0;
  let errLast = 0;

  const solveOnce = (Y: Float32Array, b: Float32Array, eps: number) => {
    const r = useLog
      ? sinkhornBarycentricLog({ ...req, Y, b, epsilon: eps } as any, post)
      : sinkhornBarycentricLinear({ ...req, Y, b, epsilon: eps } as any, post);
    itTot += r.iter;
    errLast = r.err;
    return r.T;
  };

  if (schedule && schedule.steps > 0) {
    const { start, end, steps } = schedule;
    const denom = steps > 1 ? steps - 1 : 1; // avoid divide-by-zero when steps===1
    for (let s = 0; s < steps; s++) {
      const eps = start + (end - start) * (s / denom);
      // sequential over targets per stage
      let blend = new Float32Array(X.length);
      blend.fill(0);
      for (let k = 0; k < K; k++) {
        const Tk = solveOnce(Ys[k], Bs[k], eps);
        for (let i = 0; i < T.length; i++) blend[i] += W[k] * Tk[i];
      }
      T = blend;
      post({ kind: "progress", err: Math.max(1e-12, errLast) });
    }
  } else {
    // single epsilon
    let blend = new Float32Array(X.length);
    blend.fill(0);
    for (let k = 0; k < K; k++) {
      const Tk = solveOnce(Ys[k], Bs[k], epsilon);
      for (let i = 0; i < T.length; i++) blend[i] += W[k] * Tk[i];
    }
    T = blend;
  }
  return { T, iter: itTot, err: errLast };
}

// Only attach handler when running in a real Worker context (e.g., browser). This
// prevents test/node environments from erroring on missing `self`.
if (typeof self !== "undefined" && (self as any).postMessage) {
  (self as any).onmessage = (ev: MessageEvent<SolveReq>) => {
    const req = ev.data;
    let out;
    try {
      if (req.mode === "solve")
        out = sinkhornBarycentricLinear(req, (m) =>
          (self as any).postMessage(m)
        );
      else if (req.mode === "solveLog")
        out = sinkhornBarycentricLog(req, (m) => (self as any).postMessage(m));
      else if (req.mode === "solveBlend")
        out = sinkhornBlend(req, (m) => (self as any).postMessage(m), false);
      else if (req.mode === "solveLogBlend")
        out = sinkhornBlend(req, (m) => (self as any).postMessage(m), true);
      (self as any).postMessage({ kind: "done", ...out } as WorkerResp);
    } catch (e: any) {
      (self as any).postMessage({
        kind: "done",
        T: new Float32Array(req.X.length),
        iter: 0,
        err: 1e9,
      } as WorkerResp);
    }
  };
}

// Expose internals for unit tests (doesn't change anything in production builds)
export {
  computeCost as _computeCost,
  sinkhornBarycentricLinear as _sinkhornLinear,
  sinkhornBarycentricLog as _sinkhornLog,
  sinkhornBlend as _sinkhornBlend,
};
