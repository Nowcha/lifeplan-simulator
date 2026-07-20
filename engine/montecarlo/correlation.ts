/**
 * Cholesky decomposition (design doc §5 Assumptions.correlationMatrix):
 * factors a lower-triangular L such that L·Lᵀ = matrix, used to transform
 * independent standard normals z into correlated normals via L·z. The
 * matrix is assumed symmetric positive semi-definite, as required by the
 * design doc's schema comment — this is profile data, trusted rather than
 * re-validated here (consistent with other cross-reference fields in the
 * engine, e.g. buildCreditGroups in pipeline.ts).
 */

/** Lower-triangular Cholesky factor of a symmetric positive semi-definite matrix. Empty input returns empty output. */
export function cholesky(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += (L[i]?.[k] ?? 0) * (L[j]?.[k] ?? 0);
      }
      const row = L[i];
      if (!row) continue;
      if (i === j) {
        row[j] = Math.sqrt(Math.max(0, (matrix[i]?.[i] ?? 0) - sum));
      } else {
        const diag = L[j]?.[j] ?? 0;
        row[j] = diag === 0 ? 0 : ((matrix[i]?.[j] ?? 0) - sum) / diag;
      }
    }
  }

  return L;
}

/** Transform independent standard normals into correlated normals via L·z */
export function correlate(choleskyFactor: number[][], independentNormals: number[]): number[] {
  return choleskyFactor.map((row) => row.reduce((sum, l, k) => sum + l * (independentNormals[k] ?? 0), 0));
}
