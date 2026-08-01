/**
 * Cholesky decomposition (design doc §5 Assumptions.correlationMatrix):
 * factors a lower-triangular L such that L·Lᵀ = matrix, used to transform
 * independent standard normals z into correlated normals via L·z. The
 * Invalid matrices are rejected before decomposition. Silently coercing an
 * asymmetric or indefinite user-supplied matrix would produce shocks with a
 * different correlation structure from the one shown in the editor.
 */

const MATRIX_TOLERANCE = 1e-12;

/** Validate a correlation matrix (square, symmetric, unit diagonal and positive definite). */
export function validateCorrelationMatrix(matrix: number[][]): void {
  const size = matrix.length;
  if (matrix.some((row) => row.length !== size)) {
    throw new Error("Correlation matrix must be square");
  }

  for (let rowIndex = 0; rowIndex < size; rowIndex++) {
    for (let columnIndex = 0; columnIndex < size; columnIndex++) {
      const value = matrix[rowIndex]?.[columnIndex];
      if (value === undefined || !Number.isFinite(value) || value < -1 || value > 1) {
        throw new Error("Correlation matrix values must be finite numbers between -1 and 1");
      }
      if (rowIndex === columnIndex && Math.abs(value - 1) > MATRIX_TOLERANCE) {
        throw new Error("Correlation matrix diagonal values must be 1");
      }
      const mirrored = matrix[columnIndex]?.[rowIndex];
      if (mirrored === undefined || Math.abs(value - mirrored) > MATRIX_TOLERANCE) {
        throw new Error("Correlation matrix must be symmetric");
      }
    }
  }
}

/** Lower-triangular Cholesky factor of a symmetric positive-definite correlation matrix. Empty input returns empty output. */
export function cholesky(matrix: number[][]): number[][] {
  validateCorrelationMatrix(matrix);
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
        const residual = (matrix[i]?.[i] ?? 0) - sum;
        if (residual <= MATRIX_TOLERANCE) {
          throw new Error("Correlation matrix must be positive definite");
        }
        row[j] = Math.sqrt(residual);
      } else {
        const diag = L[j]?.[j] ?? 0;
        row[j] = ((matrix[i]?.[j] ?? 0) - sum) / diag;
      }
    }
  }

  return L;
}

/** Transform independent standard normals into correlated normals via L·z */
export function correlate(choleskyFactor: number[][], independentNormals: number[]): number[] {
  return choleskyFactor.map((row) => row.reduce((sum, l, k) => sum + l * (independentNormals[k] ?? 0), 0));
}
