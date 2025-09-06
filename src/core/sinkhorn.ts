export type SinkhornParams = {
  epsilon: number;
  maxIter: number;
  tol: number;
  computePlan?: boolean;
  planMaxCells?: number;
};
export type SinkhornResult = {
  T: Float32Array;
  iter: number;
  err: number;
  P?: Float32Array | null;
  N?: number;
  M?: number;
};

type WorkerMsg =
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

export async function sinkhornWorkerSolve(
  left: { X: Float32Array; w: Float32Array },
  right: { X: Float32Array; w: Float32Array },
  params: SinkhornParams,
  onProgress?: (err: number) => void,
  useLog: boolean = false,
  schedule?: { start: number; end: number; steps: number } | null
): Promise<SinkhornResult> {
  const worker = new Worker(new URL("./worker/ot.worker.ts", import.meta.url), {
    type: "module",
  });
  const req = {
    mode: useLog ? "solveLog" : "solve",
    X: left.X,
    Y: right.X,
    a: left.w,
    b: right.w,
    epsilon: params.epsilon,
    maxIter: params.maxIter,
    tol: params.tol,
    computePlan: !!params.computePlan,
    planMaxCells: params.planMaxCells ?? 65536,
    schedule: schedule || null,
  };
  return new Promise((resolve, reject) => {
    worker.onmessage = (ev: MessageEvent<WorkerMsg>) => {
      const data = ev.data;
      if (data.kind === "progress") {
        onProgress?.(data.err);
      } else if (data.kind === "done") {
        worker.terminate();
        resolve({
          T: data.T,
          iter: data.iter,
          err: data.err,
          P: data.P ?? null,
          N: data.N,
          M: data.M,
        });
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(e);
    };
    // Do not transfer buffers that the UI still needs (detaches them in main thread).
    // Structured clone is fine for these sizes and keeps source arrays intact for rendering.
    worker.postMessage(req);
  });
}

export async function sinkhornWorkerBlend(
  left: { X: Float32Array; w: Float32Array },
  targets: { X: Float32Array; w: Float32Array; weight: number }[],
  params: SinkhornParams,
  onProgress?: (err: number) => void,
  useLog: boolean = false,
  schedule?: { start: number; end: number; steps: number } | null
): Promise<SinkhornResult> {
  const worker = new Worker(new URL("./worker/ot.worker.ts", import.meta.url), {
    type: "module",
  });
  const Ys = targets.map((t) => t.X);
  const Bs = targets.map((t) => t.w);
  const W = targets.map((t) => t.weight);
  const req = {
    mode: useLog ? "solveLogBlend" : "solveBlend",
    X: left.X,
    a: left.w,
    Ys,
    Bs,
    weights: W,
    epsilon: params.epsilon,
    maxIter: params.maxIter,
    tol: params.tol,
    schedule: schedule || null,
  };
  return new Promise((resolve, reject) => {
    worker.onmessage = (ev: MessageEvent<WorkerMsg>) => {
      const data = ev.data;
      if (data.kind === "progress") {
        onProgress?.(data.err);
      } else if (data.kind === "done") {
        worker.terminate();
        resolve({ T: data.T, iter: data.iter, err: data.err });
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(e);
    };
    // Do not transfer buffers that are needed by the UI after the call; cloning avoids detaching.
    worker.postMessage(req);
  });
}

export function displacementInterpolate(
  X: Float32Array,
  T: Float32Array,
  t: number
): Float32Array {
  const N = X.length / 2;
  const Z = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x0 = X[2 * i],
      y0 = X[2 * i + 1],
      x1 = T[2 * i],
      y1 = T[2 * i + 1];
    Z[2 * i] = (1 - t) * x0 + t * x1;
    Z[2 * i + 1] = (1 - t) * y0 + t * y1;
  }
  return Z;
}
