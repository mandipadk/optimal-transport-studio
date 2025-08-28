import { displacementInterpolate } from "../core/sinkhorn";
test("displacement interpolate identity", () => {
  const X = new Float32Array([0, 0, 1, 0]);
  const T = new Float32Array([0, 0, 1, 0]);
  const Z = displacementInterpolate(X, T, 0.5);
  expect(Array.from(Z)).toEqual([0, 0, 1, 0]);
});
