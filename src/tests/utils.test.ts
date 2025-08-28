// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { encodeStateToUrl, decodeStateFromUrl } from "../core/utils";

describe("utils: encode/decode state", () => {
  it("roundtrips state via URL hash", () => {
    const left = {
      X: new Float32Array([0.1, -0.2, 0.5, 0.6]),
      w: new Float32Array([0.25, 0.75]),
    };
    const targets = [
      {
        pts: {
          X: new Float32Array([0.2, 0.1, -0.4, 0.7]),
          w: new Float32Array([0.6, 0.4]),
        },
        weight: 1,
        id: "t1",
      },
      {
        pts: {
          X: new Float32Array([0.8, -0.5, 0.0, 0.0]),
          w: new Float32Array([0.5, 0.5]),
        },
        weight: 2,
        id: "t2",
      },
    ];
    const state = {
      left,
      targets,
      epsilon: 0.05,
      maxIter: 123,
      tol: 1e-7,
      schedule: { start: 0.2, end: 0.05, steps: 3 },
      useLog: true,
    };
    const url = encodeStateToUrl(state);
    // Take hash from encoded URL and set window.location.hash before decoding
    const hash = new URL(url).hash;
    window.location.hash = hash;
    const back = decodeStateFromUrl();
    expect(back).toBeTruthy();
    expect(Array.from(back!.left.X)).toEqual(Array.from(left.X));
    expect(Array.from(back!.left.w)).toEqual(Array.from(left.w));
    expect(back!.targets.length).toBe(2);
    expect(Array.from(back!.targets[0].pts.X)).toEqual(
      Array.from(targets[0].pts.X)
    );
    expect(Array.from(back!.targets[0].pts.w)).toEqual(
      Array.from(targets[0].pts.w)
    );
    expect(back!.targets[0].weight).toBe(1);
    expect(typeof back!.targets[0].id).toBe("string");
    expect(back!.epsilon).toBeCloseTo(0.05);
    expect(back!.maxIter).toBe(123);
    expect(back!.tol).toBeCloseTo(1e-7);
    expect(back!.schedule).toEqual({ start: 0.2, end: 0.05, steps: 3 });
    expect(back!.useLog).toBe(true);
  });
});
