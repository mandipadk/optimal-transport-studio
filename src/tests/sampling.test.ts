// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  randomPointCloud,
  normalizeWeights,
  samplePointsFromImage,
} from "../core/sampling";

describe("sampling: randomPointCloud", () => {
  it("returns arrays of expected sizes and normalized weights", () => {
    const { X, w } = randomPointCloud(5, 42);
    expect(X.length).toBe(10);
    expect(w.length).toBe(5);
    const sum = Array.from(w).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
  it("is deterministic for a given seed", () => {
    const a = randomPointCloud(6, 1234);
    const b = randomPointCloud(6, 1234);
    expect(Array.from(a.X)).toEqual(Array.from(b.X));
    expect(Array.from(a.w)).toEqual(Array.from(b.w));
  });
});

describe("sampling: normalizeWeights", () => {
  it("normalizes to sum = 1", () => {
    const w = new Float32Array([2, 3, 5]);
    const out = normalizeWeights(w);
    const sum = Array.from(out).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(out.length).toBe(3);
  });
  it("returns input when sum <= 0", () => {
    const w = new Float32Array([0, 0, 0]);
    const out = normalizeWeights(w);
    // identity behavior
    expect(out).toBe(w);
  });
});

describe("sampling: samplePointsFromImage", () => {
  const origImage = (globalThis as any).Image;
  const restoreFns: Array<() => void> = [];
  afterEach(() => {
    restoreFns.splice(0).forEach((f) => f());
    (globalThis as any).Image = origImage;
  });

  it("produces N points and uniform weights from image", async () => {
    // Stub Image and canvas 2D context
    class FakeImage {
      src = "";
      decode() {
        return Promise.resolve();
      }
    }
    (globalThis as any).Image = FakeImage;

    const fakeCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
        const W = 128,
          H = 128;
        // Create a simple gradient: brighter towards bottom-right
        const data = new Uint8ClampedArray(W * H * 4);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const idx = 4 * (y * W + x);
            const val = Math.floor(255 * ((x + y) / (W + H)));
            data[idx] = val;
            data[idx + 1] = val;
            data[idx + 2] = val;
            data[idx + 3] = 255;
          }
        }
        return { data };
      }),
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      putImageData: vi.fn(),
      font: "" as any,
      strokeStyle: "" as any,
      fillStyle: "" as any,
    } as unknown as CanvasRenderingContext2D;

    const origCreate = document.createElement;
    restoreFns.push(() => (document.createElement = origCreate));
    document.createElement = ((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => fakeCtx,
          toBlob: (cb: any) => cb(new Blob()),
          style: {},
        } as any;
      }
      return origCreate.call(document, tag);
    }) as any;

    const n = 50;
    const { X, w } = await samplePointsFromImage("fake://image", n);
    expect(X.length).toBe(2 * n);
    expect(w.length).toBe(n);
    const sum = Array.from(w).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
});
