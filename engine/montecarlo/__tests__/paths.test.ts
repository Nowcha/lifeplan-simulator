import { describe, expect, test } from "vitest";
import type { Assumptions } from "../../types/index.js";
import { createRng } from "../rng.js";
import { generateFactorPaths } from "../paths.js";

function baseAssumptions(overrides: Partial<Assumptions> = {}): Assumptions {
  return {
    simulation: { startYear: 2026, endAge: 65, paths: 100, seed: 1 },
    inflation: { mean: 0.015, volatility: 0.01 },
    wageGrowth: { mean: 0.02, volatility: 0.012 },
    assetClasses: [
      { id: "global-equity", expectedReturn: 0.05, volatility: 0.18 },
      { id: "bonds", expectedReturn: 0.015, volatility: 0.05 }
    ],
    correlationMatrix: { factors: [], matrix: [] },
    baseRate: { initial: 0.005, model: "manual", manualPath: [{ year: 2026, rate: 0.005 }] },
    ...overrides
  };
}

describe("generateFactorPaths", () => {
  test("startYear〜endYearの全年分のリターン配列を返す(資産クラスごと)", () => {
    const rng = createRng(1);
    const paths = generateFactorPaths(baseAssumptions(), 2026, 2030, rng);
    expect(paths.assetReturns["global-equity"]).toHaveLength(5);
    expect(paths.assetReturns.bonds).toHaveLength(5);
    expect(paths.baseRate).toHaveLength(5);
  });

  test("同じseedなら同じパスを返す(再現性)", () => {
    const pathsA = generateFactorPaths(baseAssumptions(), 2026, 2030, createRng(42));
    const pathsB = generateFactorPaths(baseAssumptions(), 2026, 2030, createRng(42));
    expect(pathsA).toEqual(pathsB);
  });

  test("manualモデルの基準金利は決定論パスと完全一致する(確率変動なし)", () => {
    const assumptions = baseAssumptions({
      baseRate: {
        initial: 0.005,
        model: "manual",
        manualPath: [
          { year: 2026, rate: 0.005 },
          { year: 2030, rate: 0.02 }
        ]
      }
    });
    const paths = generateFactorPaths(assumptions, 2026, 2030, createRng(1));
    expect(paths.baseRate).toEqual([0.005, 0.00875, 0.0125, 0.01625, 0.02]);
  });

  test("mean-revertingモデルの基準金利は0年目=initial、以降は確率的に変動する(乱数を変えると値が変わる)", () => {
    const assumptions = baseAssumptions({
      baseRate: { initial: 0.005, model: "mean-reverting", meanReversion: { speed: 0.2, longTermMean: 0.02, volatility: 0.01 } }
    });
    const pathsA = generateFactorPaths(assumptions, 2026, 2030, createRng(1));
    const pathsB = generateFactorPaths(assumptions, 2026, 2030, createRng(2));
    expect(pathsA.baseRate[0]).toBe(0.005);
    expect(pathsB.baseRate[0]).toBe(0.005);
    expect(pathsA.baseRate).not.toEqual(pathsB.baseRate);
  });

  test("mean-revertingモデルの基準金利は0未満にならない(下限0でフロア)", () => {
    const assumptions = baseAssumptions({
      baseRate: { initial: 0.001, model: "mean-reverting", meanReversion: { speed: 0.9, longTermMean: 0.0, volatility: 0.5 } }
    });
    const paths = generateFactorPaths(assumptions, 2026, 2060, createRng(1));
    for (const r of paths.baseRate) expect(r).toBeGreaterThanOrEqual(0);
  });

  test("相関行列に基づき資産クラス間の実現リターンに相関が生じる(強い正の相関設定で符号が概ね揃う)", () => {
    const assumptions = baseAssumptions({
      assetClasses: [
        { id: "a", expectedReturn: 0, volatility: 0.2 },
        { id: "b", expectedReturn: 0, volatility: 0.2 }
      ],
      correlationMatrix: {
        factors: ["a", "b"],
        matrix: [
          [1, 0.99],
          [0.99, 1]
        ]
      }
    });
    const paths = generateFactorPaths(assumptions, 2026, 2075, createRng(5));
    const a = paths.assetReturns.a ?? [];
    const b = paths.assetReturns.b ?? [];
    const sameSignCount = a.filter((v, i) => Math.sign(v) === Math.sign(b[i] ?? 0)).length;
    expect(sameSignCount / a.length).toBeGreaterThan(0.85);
  });

  test("資産リターンは対数正規(design doc §5): どんなzでも-100%を下回らない", () => {
    const assumptions = baseAssumptions({
      assetClasses: [{ id: "global-equity", expectedReturn: 0.05, volatility: 0.5 }] // 極端に高いvolatilityで裾を試す
    });
    const paths = generateFactorPaths(assumptions, 2026, 2125, createRng(1)); // 100年分、裾サンプルを稼ぐ
    for (const r of paths.assetReturns["global-equity"] ?? []) {
      expect(r).toBeGreaterThan(-1);
    }
  });

  test("大量サンプルの実現リターンの平均がexpectedReturnに収束する(対数正規のキャリブレーション)", () => {
    const assumptions = baseAssumptions({
      assetClasses: [{ id: "global-equity", expectedReturn: 0.05, volatility: 0.18 }],
      correlationMatrix: { factors: [], matrix: [] }
    });
    const rng = createRng(99);
    const samples: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const paths = generateFactorPaths(assumptions, 2026, 2026, rng);
      samples.push(paths.assetReturns["global-equity"]?.[0] ?? 0);
    }
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    expect(mean).toBeGreaterThan(0.04);
    expect(mean).toBeLessThan(0.06);
  });
});

describe("インフレ率・賃金上昇率の確率変動", () => {
  test("全年分の実現値を返す", () => {
    const paths = generateFactorPaths(baseAssumptions(), 2026, 2030, createRng(1));

    expect(paths.inflation).toHaveLength(5);
    expect(paths.wageGrowth).toHaveLength(5);
  });

  test("volatilityが0なら毎年meanと一致する(決定論パスと同じ挙動)", () => {
    const assumptions = baseAssumptions({
      inflation: { mean: 0.015, volatility: 0 },
      wageGrowth: { mean: 0.02, volatility: 0 }
    });

    const paths = generateFactorPaths(assumptions, 2026, 2030, createRng(1));

    expect(paths.inflation.every((r) => r === 0.015)).toBe(true);
    expect(paths.wageGrowth.every((r) => r === 0.02)).toBe(true);
  });

  test("volatilityが正なら年ごとに変動する", () => {
    const paths = generateFactorPaths(baseAssumptions(), 2026, 2060, createRng(7));

    expect(new Set(paths.inflation).size).toBeGreaterThan(1);
    expect(new Set(paths.wageGrowth).size).toBeGreaterThan(1);
  });

  test("実現値の平均はmeanの近傍に収まる", () => {
    const paths = generateFactorPaths(baseAssumptions(), 2026, 2525, createRng(3)); // 500年分
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

    // volatility 0.01 / sqrt(500) ≈ 0.00045 なので 0.002 の幅は十分緩い
    expect(mean(paths.inflation)).toBeCloseTo(0.015, 2);
    expect(mean(paths.wageGrowth)).toBeCloseTo(0.02, 2);
  });

  test("デフレ(マイナスのインフレ率)も引きうる", () => {
    // 正規分布なので下限を課していない。対数正規の資産リターンと違い、
    // インフレ率は素の率なのでマイナスに振れて良い。
    const assumptions = baseAssumptions({ inflation: { mean: 0.005, volatility: 0.02 } });
    const paths = generateFactorPaths(assumptions, 2026, 2225, createRng(11));

    expect(paths.inflation.some((r) => r < 0)).toBe(true);
  });

  test("相関行列に載せると資産クラスと連動する", () => {
    // インフレと株式を強い正の相関にすると、実現値の符号がそろいやすくなる
    const assumptions = baseAssumptions({
      correlationMatrix: {
        factors: ["global-equity", "inflation"],
        matrix: [
          [1, 0.9],
          [0.9, 1]
        ]
      }
    });
    const paths = generateFactorPaths(assumptions, 2026, 2225, createRng(5));

    const equity = paths.assetReturns["global-equity"] ?? [];
    const sameSide = paths.inflation.filter(
      (inf, i) => inf > 0.015 === (equity[i] ?? 0) > 0.05
    ).length;

    expect(sameSide / paths.inflation.length).toBeGreaterThan(0.7);
  });

  test("同じseedなら再現する", () => {
    const a = generateFactorPaths(baseAssumptions(), 2026, 2040, createRng(9));
    const b = generateFactorPaths(baseAssumptions(), 2026, 2040, createRng(9));

    expect(a.inflation).toEqual(b.inflation);
    expect(a.wageGrowth).toEqual(b.wageGrowth);
  });
});
