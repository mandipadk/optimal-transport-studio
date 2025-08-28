import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sinkhornWorkerSolve, sinkhornWorkerBlend, displacementInterpolate } from '../core/sinkhorn'

class MockWorker {
  public onmessage: ((ev: MessageEvent<any>) => void) | null = null
  public onerror: ((ev: any) => void) | null = null
  static lastTransfer: any[] | null = null
  constructor(_url: any, _opts: any) {}
  postMessage(req: any, transfer?: any[]) {
    MockWorker.lastTransfer = transfer || null
    // simulate one progress and then a done
    setTimeout(() => {
      this.onmessage && this.onmessage({ data: { kind: 'progress', err: 0.01 } } as any)
    }, 0)
    const N = req.a ? req.a.length : (req.X.length / 2)
    const M = req.b ? req.b.length : (req.Ys && req.Ys[0] ? req.Ys[0].length / 2 : 0)
    const res: any = {
      kind: 'done',
      T: new Float32Array(req.X),
      iter: 5,
      err: 1e-6,
    }
    if (req.computePlan) {
      res.P = new Float32Array(N * M)
      res.N = N
      res.M = M
    }
    setTimeout(() => {
      this.onmessage && this.onmessage({ data: res } as any)
    }, 1)
  }
  terminate() {}
}

describe('sinkhorn wrapper', () => {
  const origWorker = (globalThis as any).Worker
  beforeEach(() => {
    ;(globalThis as any).Worker = MockWorker as any
  })
  afterEach(() => {
    ;(globalThis as any).Worker = origWorker
    MockWorker.lastTransfer = null
  })

  it('displacementInterpolate behaves linearly', () => {
    const X = new Float32Array([0,0, 1,0])
    const T = new Float32Array([2,2, 4,2])
    const Z0 = displacementInterpolate(X, T, 0)
    const Z1 = displacementInterpolate(X, T, 1)
    const Zh = displacementInterpolate(X, T, 0.5)
    expect(Array.from(Z0)).toEqual(Array.from(X))
    expect(Array.from(Z1)).toEqual(Array.from(T))
    expect(Array.from(Zh)).toEqual([1,1, 2.5,1])
  })

  it('sinkhornWorkerSolve forwards progress and done', async () => {
    const left = { X: new Float32Array([0,0, 1,0]), w: new Float32Array([0.5, 0.5]) }
    const right = { X: new Float32Array([0,0, 1,0]), w: new Float32Array([0.5, 0.5]) }
    const onProgress = vi.fn()
    const res = await sinkhornWorkerSolve(left, right, { epsilon: 0.1, maxIter: 100, tol: 1e-6, computePlan: true }, onProgress)
    expect(onProgress).toHaveBeenCalled()
    expect(res.iter).toBe(5)
    expect(res.err).toBeCloseTo(1e-6)
    expect(Array.from(res.T)).toEqual(Array.from(left.X))
    expect(res.P).toBeTruthy()
    expect(res.N).toBe(2)
    expect(res.M).toBe(2)
    // verify transferables used
    expect(MockWorker.lastTransfer?.length).toBe(4)
  })

  it('sinkhornWorkerBlend forwards done and supports schedule', async () => {
    const left = { X: new Float32Array([0,0, 1,0]), w: new Float32Array([0.5, 0.5]) }
    const targets = [
      { X: new Float32Array([0,0, 1,0]), w: new Float32Array([0.5, 0.5]), weight: 0.2 },
      { X: new Float32Array([0,1, 1,1]), w: new Float32Array([0.5, 0.5]), weight: 0.8 },
    ]
    const onProgress = vi.fn()
    const res = await sinkhornWorkerBlend(left, targets, { epsilon: 0.1, maxIter: 100, tol: 1e-6 }, onProgress, false, { start: 0.2, end: 0.1, steps: 2 })
    expect(res.iter).toBe(5) // from mock
    expect(onProgress).toHaveBeenCalled()
    expect(res.T.length).toBe(left.X.length)
  })
})

