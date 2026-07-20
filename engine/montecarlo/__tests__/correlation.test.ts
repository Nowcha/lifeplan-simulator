import { describe, expect, test } from "vitest";
import { cholesky, correlate } from "../correlation.js";

function multiplyByTranspose(L: number[][]): number[][] {
  const n = L.length;
  const result: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) sum += (L[i]?.[k] ?? 0) * (L[j]?.[k] ?? 0);
      const row = result[i];
      if (row) row[j] = sum;
    }
  }
  return result;
}

describe("cholesky", () => {
  test("空行列は空を返す", () => {
    expect(cholesky([])).toEqual([]);
  });

  test("単位行列のCholesky因子は単位行列", () => {
    const identity = [
      [1, 0],
      [0, 1]
    ];
    expect(cholesky(identity)).toEqual(identity);
  });

  test("L・Lᵀ が元の行列を再構成する(サンプルのassumptions.json相関行列)", () => {
    const matrix = [
      [1.0, 0.2, 0.1, 0.15],
      [0.2, 1.0, -0.1, 0.4],
      [0.1, -0.1, 1.0, 0.5],
      [0.15, 0.4, 0.5, 1.0]
    ];
    const L = cholesky(matrix);
    const reconstructed = multiplyByTranspose(L);
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix.length; j++) {
        expect(reconstructed[i]?.[j]).toBeCloseTo(matrix[i]?.[j] ?? 0, 9);
      }
    }
  });
});

describe("correlate", () => {
  test("単位行列のCholesky因子なら独立正規乱数をそのまま返す", () => {
    const L = cholesky([
      [1, 0],
      [0, 1]
    ]);
    expect(correlate(L, [0.5, -0.3])).toEqual([0.5, -0.3]);
  });

  test("2x2の既知の相関行列で手計算した値と一致する", () => {
    // corr = 0.6 → L = [[1,0],[0.6, 0.8]] (0.8 = sqrt(1-0.36))
    const L = cholesky([
      [1, 0.6],
      [0.6, 1]
    ]);
    const [z0, z1] = correlate(L, [1, 1]);
    expect(z0).toBeCloseTo(1, 9);
    expect(z1).toBeCloseTo(0.6 * 1 + 0.8 * 1, 9);
  });
});
