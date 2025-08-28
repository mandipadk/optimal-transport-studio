import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
export function encodeStateToUrl(state: any): string {
  const payload = {
    left: { X: Array.from(state.left.X), w: Array.from(state.left.w) },
    targets: state.targets.map((t: any) => ({
      X: Array.from(t.pts.X),
      w: Array.from(t.pts.w),
      weight: t.weight,
    })),
    epsilon: state.epsilon,
    maxIter: state.maxIter,
    tol: state.tol,
    schedule: state.schedule,
    useLog: state.useLog,
  };
  const s = compressToEncodedURIComponent(JSON.stringify(payload));
  const url = new URL(window.location.href);
  url.hash = s;
  return url.toString();
}
export function decodeStateFromUrl(): any | null {
  if (!window.location.hash) return null;
  try {
    const s = window.location.hash.slice(1);
    const js = JSON.parse(decompressFromEncodedURIComponent(s) || "null");
    if (!js) return null;
    return {
      left: { X: new Float32Array(js.left.X), w: new Float32Array(js.left.w) },
      targets: (js.targets || []).map((t: any) => ({
        pts: { X: new Float32Array(t.X), w: new Float32Array(t.w) },
        weight: t.weight,
        id: Math.random().toString(36).slice(2),
      })),
      epsilon: js.epsilon,
      maxIter: js.maxIter,
      tol: js.tol,
      schedule: js.schedule,
      useLog: js.useLog,
    };
  } catch {
    return null;
  }
}
