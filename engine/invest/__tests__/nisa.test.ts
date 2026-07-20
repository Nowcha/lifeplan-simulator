import { describe, expect, test } from "vitest";
import type { NisaRules } from "../../types/index.js";
import { capNisaContribution, recordNisaContribution, restoreNisaQuota, type NisaState } from "../nisa.js";

const rules: NisaRules = {
  lifetimeCap: 18000000,
  growthLifetimeCap: 12000000,
  annualTsumitate: 1200000,
  annualGrowth: 2400000,
  quotaRestoration: "next-year-cost-basis",
  _source: { url: "https://www.fsa.go.jp/policy/nisa2/know/index.html", confirmedOn: "2026-07-20" }
};

const emptyState: NisaState = { lifetimeUsed: 0, growthUsed: 0 };

describe("capNisaContribution", () => {
  test("年間枠・生涯枠に余裕があればrequestedをそのまま通す", () => {
    expect(capNisaContribution("nisa-tsumitate", 500000, 0, emptyState, rules)).toBe(500000);
  });

  test("つみたて枠は年間枠(120万)でキャップされる", () => {
    expect(capNisaContribution("nisa-tsumitate", 2000000, 0, emptyState, rules)).toBe(1200000);
  });

  test("成長枠は年間枠(240万)でキャップされる", () => {
    expect(capNisaContribution("nisa-growth", 3000000, 0, emptyState, rules)).toBe(2400000);
  });

  test("当年既消化分(annualUsedSoFar)を差し引いた残り年間枠でキャップされる", () => {
    expect(capNisaContribution("nisa-tsumitate", 1000000, 1000000, emptyState, rules)).toBe(200000);
  });

  test("annualUsedSoFarが年間枠を超えていても残り枠は0未満にならない", () => {
    expect(capNisaContribution("nisa-tsumitate", 500000, 5000000, emptyState, rules)).toBe(0);
  });

  test("生涯枠の残りが年間枠より小さければ生涯枠でキャップされる", () => {
    const state: NisaState = { lifetimeUsed: 17800000, growthUsed: 0 };
    expect(capNisaContribution("nisa-tsumitate", 1200000, 0, state, rules)).toBe(200000);
  });

  test("lifetimeUsedが生涯枠を超えていても残り枠は0未満にならない", () => {
    const state: NisaState = { lifetimeUsed: 19000000, growthUsed: 0 };
    expect(capNisaContribution("nisa-tsumitate", 500000, 0, state, rules)).toBe(0);
  });

  test("成長枠は生涯枠(1800万)に加えて成長サブ枠(1200万)でもキャップされる", () => {
    const state: NisaState = { lifetimeUsed: 5000000, growthUsed: 11800000 };
    expect(capNisaContribution("nisa-growth", 2400000, 0, state, rules)).toBe(200000);
  });

  test("つみたて枠は成長サブ枠の影響を受けない", () => {
    const state: NisaState = { lifetimeUsed: 11800000, growthUsed: 11800000 };
    // growth sub-cap room is only 200,000 but tsumitate must ignore it
    expect(capNisaContribution("nisa-tsumitate", 1200000, 0, state, rules)).toBe(1200000);
  });

  test("requestedが0または負ならキャップ後も0を超えない", () => {
    expect(capNisaContribution("nisa-tsumitate", 0, 0, emptyState, rules)).toBe(0);
    expect(capNisaContribution("nisa-tsumitate", -100, 0, emptyState, rules)).toBe(0);
  });
});

describe("recordNisaContribution", () => {
  test("つみたて拠出はlifetimeUsedのみ増加させる", () => {
    const next = recordNisaContribution("nisa-tsumitate", 300000, emptyState);
    expect(next).toEqual({ lifetimeUsed: 300000, growthUsed: 0 });
  });

  test("成長拠出はlifetimeUsedとgrowthUsedを両方増加させる", () => {
    const next = recordNisaContribution("nisa-growth", 500000, emptyState);
    expect(next).toEqual({ lifetimeUsed: 500000, growthUsed: 500000 });
  });

  test("既存残高に積み上げる", () => {
    const state: NisaState = { lifetimeUsed: 1000000, growthUsed: 400000 };
    expect(recordNisaContribution("nisa-tsumitate", 200000, state)).toEqual({
      lifetimeUsed: 1200000,
      growthUsed: 400000
    });
    expect(recordNisaContribution("nisa-growth", 200000, state)).toEqual({
      lifetimeUsed: 1200000,
      growthUsed: 600000
    });
  });
});

describe("restoreNisaQuota", () => {
  test("つみたて売却分の簿価だけlifetimeUsedを減らしgrowthUsedは変わらない", () => {
    const state: NisaState = { lifetimeUsed: 2000000, growthUsed: 500000 };
    const next = restoreNisaQuota(state, { tsumitate: 300000, growth: 0 });
    expect(next).toEqual({ lifetimeUsed: 1700000, growthUsed: 500000 });
  });

  test("成長売却分の簿価はlifetimeUsedとgrowthUsedを両方減らす", () => {
    const state: NisaState = { lifetimeUsed: 2000000, growthUsed: 500000 };
    const next = restoreNisaQuota(state, { tsumitate: 0, growth: 300000 });
    expect(next).toEqual({ lifetimeUsed: 1700000, growthUsed: 200000 });
  });

  test("簿価合計がlifetimeUsedを上回っても0未満にはならない", () => {
    const state: NisaState = { lifetimeUsed: 100000, growthUsed: 50000 };
    const next = restoreNisaQuota(state, { tsumitate: 500000, growth: 0 });
    expect(next.lifetimeUsed).toBe(0);
  });

  test("growth簿価がgrowthUsedを上回っても0未満にはならない", () => {
    const state: NisaState = { lifetimeUsed: 1000000, growthUsed: 100000 };
    const next = restoreNisaQuota(state, { tsumitate: 0, growth: 500000 });
    expect(next.growthUsed).toBe(0);
  });
});

/**
 * Deterministic PRNG (mulberry32) — engine/ tests are covered by the same
 * no-Math.random lint rule as engine/ source, so a seeded generator is used
 * instead to keep the property tests reproducible.
 */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("NISA quota invariants (property test)", () => {
  test("拠出と枠復活を繰り返しても生涯枠・成長枠・年間枠を超過しない", () => {
    const random = mulberry32(20260720);
    const pickAccount = (): "nisa-tsumitate" | "nisa-growth" =>
      random() < 0.5 ? "nisa-tsumitate" : "nisa-growth";

    for (let trial = 0; trial < 50; trial++) {
      let state: NisaState = { lifetimeUsed: 0, growthUsed: 0 };

      for (let year = 0; year < 20; year++) {
        let tsumitateUsedThisYear = 0;
        let growthUsedThisYear = 0;
        const soldCostBasis = { tsumitate: 0, growth: 0 };

        for (let step = 0; step < 6; step++) {
          const account = pickAccount();
          const requested = Math.floor(random() * 3000000);
          const annualUsedSoFar = account === "nisa-tsumitate" ? tsumitateUsedThisYear : growthUsedThisYear;
          const capped = capNisaContribution(account, requested, annualUsedSoFar, state, rules);

          expect(capped).toBeGreaterThanOrEqual(0);
          state = recordNisaContribution(account, capped, state);
          if (account === "nisa-tsumitate") {
            tsumitateUsedThisYear += capped;
          } else {
            growthUsedThisYear += capped;
          }

          expect(state.lifetimeUsed).toBeLessThanOrEqual(rules.lifetimeCap);
          expect(state.growthUsed).toBeLessThanOrEqual(rules.growthLifetimeCap);
          expect(state.growthUsed).toBeLessThanOrEqual(state.lifetimeUsed);
        }

        // Simulate a sale of some fraction of held cost basis, restored next year.
        soldCostBasis.tsumitate = Math.floor(random() * (state.lifetimeUsed - state.growthUsed));
        soldCostBasis.growth = Math.floor(random() * state.growthUsed);
        state = restoreNisaQuota(state, soldCostBasis);

        expect(state.lifetimeUsed).toBeGreaterThanOrEqual(0);
        expect(state.growthUsed).toBeGreaterThanOrEqual(0);
        expect(state.growthUsed).toBeLessThanOrEqual(state.lifetimeUsed);
      }
    }
  });
});
