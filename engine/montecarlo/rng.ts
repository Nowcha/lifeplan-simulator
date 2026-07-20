/**
 * Seeded PRNG (design doc §9: "モンテカルロ: シード固定で結果が再現すること").
 * engine/ 配下は Math.random() 直参照禁止(ESLint no-restricted-properties)
 * なので、RNGは呼び出し側が assumptions.simulation.seed から生成して注入する。
 * mulberry32: 32bit状態1つだけの軽量PRNG、統計的検定に耐える品質ではないが
 * モンテカルロの再現性確保が目的なので十分。
 */

export type Rng = () => number;

/** Returns a function producing uniform [0, 1) values, deterministic for a given seed */
export function createRng(seed: number): Rng {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal N(0,1) via Box-Muller, consuming two uniforms per call */
export function standardNormal(rng: Rng): number {
  // avoid log(0): uniforms are [0,1), so u1 could be exactly 0
  let u1 = rng();
  while (u1 === 0) u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
