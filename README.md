# Optimal‑Transport Studio

Interactive **entropic OT (Sinkhorn)** playground with:

- **Multi‑target blend (3+)**: compute maps to several targets and blend by weights
- **Plan heatmap** (optional) for small problems
- **WebGPU path** (experimental) for larger N (falls back to CPU worker automatically)
- **Draw‑your‑own** mass with a brush and sample points from it
- **GIF/MP4 export** of the interpolation using FFmpeg.wasm
- **Regularization schedules** (epsilon annealing) and **log‑domain** solver to handle tiny ε

# Understand: Optimal Transport

**Optimal Transport** is a mathematical framework for finding the most efficient way to move mass from one distribution to another. Think of it as solving the problem: "How can we rearrange particles from configuration A to configuration B while minimizing the total cost of movement?"

In this studio, we work with **2D point clouds** where each point represents a particle with some mass. The goal is to find a **transport map** that tells us where each particle should move to transform one distribution into another.

**Key concepts:**

- **Source distribution**: Your initial set of points (what you start with)
- **Target distribution**: Your desired final arrangement of points
- **Cost function**: How expensive it is to move a particle from one location to another (we use squared Euclidean distance)
- **Transport map**: The function T(x) that tells you where each source point x should move
- **Transport plan**: A matrix showing how much mass flows between each source-target pair

# Understand: Our Approach (Easy Terms)

We use the **Sinkhorn algorithm** (also called **entropic optimal transport**) to solve the optimal transport problem. This is a popular method because it's fast and works well in practice.

**The basic idea:**

1. **Regularization**: Instead of finding the exact optimal solution (which is hard), we add a "smoothness" parameter called epsilon (ε) that makes the problem easier to solve
2. **Iterative updates**: The algorithm alternates between updating two sets of variables (called dual potentials) until they converge to a good solution
3. **Barycentric map**: Once we have the solution, we compute where each source point should move by taking a weighted average of all target points

**Key terms explained:**

- **Epsilon (ε)**: Controls the "fuzziness" of the transport. Small ε gives sharper, more precise transport but is harder to compute
- **Dual potentials**: Mathematical variables (u and v) that the algorithm optimizes to find the transport plan
- **Convergence**: When the algorithm has found a stable solution and stops improving
- **Barycentric coordinates**: A way to express a point as a weighted combination of other points

**What makes our implementation special:**

- **Multi-target blending**: Transport to several targets simultaneously and blend the results
- **Log-domain solver**: Handles very small ε values without numerical issues
- **WebGPU acceleration**: Uses your graphics card to solve larger problems faster
- **Interactive drawing**: Draw your own mass distributions with a brush tool

# Understand: Our Approach (Detailed and Technical)

**Entropic Optimal Transport & Sinkhorn Algorithm:**

We solve the regularized optimal transport problem:
$$\min_{P \in \Pi(a,b)} \langle C, P \rangle + \epsilon H(P)$$

where $C_{ij}$ is the cost matrix (squared Euclidean distances), $\Pi(a,b)$ are transport plans with marginals $a,b$, and $H(P) = -\sum_{ij} P_{ij} \log P_{ij}$ is the entropic regularizer.

**Sinkhorn Iterations:**
The algorithm alternates between updating dual variables:

1. Variable 1: $u^{(k+1)}_i = \frac{a_i}{\sum_j K_{ij} v^{(k)}_j}$ (row scaling)
2. Variable 2: $v^{(k+1)}_j = \frac{b_j}{\sum_i K_{ij} u^{(k+1)}_i}$ (column scaling)

where $K_{ij} = \exp(-C_{ij}/\epsilon)$ is the Gibbs kernel.

**Barycentric Transport Map:**
Instead of computing the full plan $P = \text{diag}(u) K \text{diag}(v)$, we directly compute the barycentric map:
$$T_i = \frac{\sum_j K_{ij} v_j Y_j}{\sum_j K_{ij} v_j}$$

This gives us the transported location for each source point $X_i$.

**Log-Domain Stability:**
For small $\epsilon$, we work in log-space with potentials $f = \epsilon \log u$ and $g = \epsilon \log v$:

$f_i^{(k+1)} = \log a_i - \text{LSE}_j(g_j^{(k)} - C_{ij})/\epsilon + \log b_j)$

And, 

$g_j^{(k+1)} = \log b_j - \text{LSE}_i(f_i^{(k+1)} - C_{ij})/\epsilon + \log a_i)$

where LSE is the log-sum-exp operation for numerical stability.

**Multi-Target Blending:**
For multiple targets with weights $w_k$:

1. Compute individual transport maps $T_k(X)$ to each target $Y_k$
2. Blend: $T(X) = \sum_k w_k T_k(X)$ with $\sum_k w_k = 1$

**Epsilon Annealing:**
We support regularization schedules that gradually decrease $\epsilon$ from a large initial value to the target value, improving convergence for small regularization parameters.

**WebGPU Implementation:**
The GPU kernels compute the expensive matrix-vector products $Kv$ and $K^T u$ in parallel using compute shaders, significantly accelerating the Sinkhorn iterations for large point clouds (N, M > 1000).

## Quickstart

```bash
npm i
npm run dev
# open http://localhost:5173
```

Build & preview:

```bash
npm run build
npm run preview
```

## Notes

- Keep N, M ~ 200–600 for CPU path. Try the **WebGPU** toggle if the browser supports it.
- **Plan heatmap** is only computed when enabled and when N×M ≤ 65k (configurable).

## Export

The first export loads the FFmpeg core into the browser. Expect a short delay before encoding.

## License

Apache‑2.0
