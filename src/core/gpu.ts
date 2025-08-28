export async function hasWebGPU(): Promise<boolean> {
  return !!navigator.gpu;
}

export type GPUKernels = {
  kv: (
    X: Float32Array,
    Y: Float32Array,
    v: Float32Array,
    epsilon: number
  ) => Promise<Float32Array>;
  kTu: (
    X: Float32Array,
    Y: Float32Array,
    u: Float32Array,
    epsilon: number
  ) => Promise<Float32Array>;
};

export async function createKernels(): Promise<GPUKernels> {
  if (!navigator.gpu) throw new Error("WebGPU not supported");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("WebGPU adapter not found");
  const device = await adapter.requestDevice();

  const kvShader = /* wgsl */ `
  @group(0) @binding(0) var<storage, read> X : array<f32>;
  @group(0) @binding(1) var<storage, read> Y : array<f32>;
  @group(0) @binding(2) var<storage, read> v : array<f32>;
  @group(0) @binding(3) var<storage, read_write> outKv : array<f32>;
  @group(0) @binding(4) var<uniform> dims : vec4<f32>; // N, M, eps, _
  fn cost(ix:u32, jx:u32) -> f32 {
    let xi = X[ix*2u]; let yi = X[ix*2u+1u];
    let xj = Y[jx*2u]; let yj = Y[jx*2u+1u];
    let dx = xi - xj; let dy = yi - yj;
    return dx*dx + dy*dy;
  }
  @compute @workgroup_size(64)
  fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let N = u32(dims.x); let M = u32(dims.y); let eps = dims.z;
    let i = gid.x; if (i >= N) { return; }
    var sum: f32 = 0.0;
    for (var j: u32 = 0u; j < M; j = j + 1u) {
      let c = cost(i,j);
      let k = exp(-c / max(eps, 1e-6));
      sum = sum + k * v[j];
    }
    outKv[i] = sum;
  }`;

  const kTuShader = /* wgsl */ `
  @group(0) @binding(0) var<storage, read> X : array<f32>;
  @group(0) @binding(1) var<storage, read> Y : array<f32>;
  @group(0) @binding(2) var<storage, read> u : array<f32>;
  @group(0) @binding(3) var<storage, read_write> outKTu : array<f32>;
  @group(0) @binding(4) var<uniform> dims : vec4<f32>; // N, M, eps, _
  fn cost(ix:u32, jx:u32) -> f32 {
    let xi = X[ix*2u]; let yi = X[ix*2u+1u];
    let xj = Y[jx*2u]; let yj = Y[jx*2u+1u];
    let dx = xi - xj; let dy = yi - yj;
    return dx*dx + dy*dy;
  }
  @compute @workgroup_size(64)
  fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let N = u32(dims.x); let M = u32(dims.y); let eps = dims.z;
    let j = gid.x; if (j >= M) { return; }
    var sum: f32 = 0.0;
    for (var i: u32 = 0u; i < N; i = i + 1u) {
      let c = cost(i,j);
      let k = exp(-c / max(eps, 1e-6));
      sum = sum + k * u[i];
    }
    outKTu[j] = sum;
  }`;

  const kvModule = device.createShaderModule({ code: kvShader });
  const kTuModule = device.createShaderModule({ code: kTuShader });

  const makePipeline = (module: GPUShaderModule) =>
    device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });

  const kvPipeline = makePipeline(kvModule);
  const kTuPipeline = makePipeline(kTuModule);

  async function kv(
    Xarr: Float32Array,
    Yarr: Float32Array,
    varr: Float32Array,
    epsilon: number
  ): Promise<Float32Array> {
    const N = Xarr.length / 2,
      M = Yarr.length / 2;
    const X = device.createBuffer({
      size: Xarr.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const Y = device.createBuffer({
      size: Yarr.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const v = device.createBuffer({
      size: varr.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const out = device.createBuffer({
      size: N * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const dims = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(X, 0, Xarr.buffer);
    device.queue.writeBuffer(Y, 0, Yarr.buffer);
    device.queue.writeBuffer(v, 0, varr.buffer);
    const dimsArr = new Float32Array([N, M, epsilon, 0]);
    device.queue.writeBuffer(dims, 0, dimsArr.buffer);

    const bind = device.createBindGroup({
      layout: kvPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: X } },
        { binding: 1, resource: { buffer: Y } },
        { binding: 2, resource: { buffer: v } },
        { binding: 3, resource: { buffer: out } },
        { binding: 4, resource: { buffer: dims } },
      ],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(kvPipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(Math.ceil(N / 64));
    pass.end();
    const read = device.createBuffer({
      size: N * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    encoder.copyBufferToBuffer(out, 0, read, 0, N * 4);
    device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const arr = new Float32Array(read.getMappedRange().slice(0));
    read.unmap();
    return arr;
  }

  async function kTu(
    Xarr: Float32Array,
    Yarr: Float32Array,
    uarr: Float32Array,
    epsilon: number
  ): Promise<Float32Array> {
    const N = Xarr.length / 2,
      M = Yarr.length / 2;
    const X = device.createBuffer({
      size: Xarr.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const Y = device.createBuffer({
      size: Yarr.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const u = device.createBuffer({
      size: uarr.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const out = device.createBuffer({
      size: M * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const dims = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(X, 0, Xarr.buffer);
    device.queue.writeBuffer(Y, 0, Yarr.buffer);
    device.queue.writeBuffer(u, 0, uarr.buffer);
    const dimsArr = new Float32Array([N, M, epsilon, 0]);
    device.queue.writeBuffer(dims, 0, dimsArr.buffer);

    const bind = device.createBindGroup({
      layout: kTuPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: X } },
        { binding: 1, resource: { buffer: Y } },
        { binding: 2, resource: { buffer: u } },
        { binding: 3, resource: { buffer: out } },
        { binding: 4, resource: { buffer: dims } },
      ],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(kTuPipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(Math.ceil(M / 64));
    pass.end();
    const read = device.createBuffer({
      size: M * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    encoder.copyBufferToBuffer(out, 0, read, 0, M * 4);
    device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const arr = new Float32Array(read.getMappedRange().slice(0));
    read.unmap();
    return arr;
  }

  return { kv, kTu };
}
