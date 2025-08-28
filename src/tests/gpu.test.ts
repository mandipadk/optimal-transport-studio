import { describe, it, expect } from "vitest";
import { hasWebGPU, createKernels } from "../core/gpu";

describe("gpu: feature detection", () => {
  it("returns false when navigator or gpu missing", async () => {
    // Mock navigator as undefined
    Object.defineProperty(globalThis, "navigator", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(await hasWebGPU()).toBe(false);

    // Mock navigator without gpu
    Object.defineProperty(globalThis, "navigator", {
      value: {} as any,
      writable: true,
      configurable: true,
    });
    expect(await hasWebGPU()).toBe(false);
  });

  it("createKernels rejects without WebGPU", async () => {
    // Mock navigator without gpu
    Object.defineProperty(globalThis, "navigator", {
      value: {} as any,
      writable: true,
      configurable: true,
    });
    await expect(createKernels()).rejects.toThrow(/WebGPU not supported/i);
  });
});
