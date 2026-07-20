import { describe, expect, test } from "vitest";
import { createRng, standardNormal } from "../rng.js";

describe("createRng", () => {
  test("同じseedなら同じ数列を返す(再現性)", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  test("異なるseedなら異なる数列を返す", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a()).not.toBe(b());
  });

  test("常に[0,1)の範囲を返す", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("standardNormal", () => {
  test("大量サンプルの平均・標準偏差がN(0,1)に近い", () => {
    const rng = createRng(123);
    const n = 20000;
    const samples = Array.from({ length: n }, () => standardNormal(rng));
    const mean = samples.reduce((s, v) => s + v, 0) / n;
    const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    expect(mean).toBeGreaterThan(-0.05);
    expect(mean).toBeLessThan(0.05);
    expect(Math.sqrt(variance)).toBeGreaterThan(0.95);
    expect(Math.sqrt(variance)).toBeLessThan(1.05);
  });

  test("同じseedなら同じ正規乱数列を返す(再現性)", () => {
    const a = createRng(9);
    const b = createRng(9);
    const seqA = Array.from({ length: 5 }, () => standardNormal(a));
    const seqB = Array.from({ length: 5 }, () => standardNormal(b));
    expect(seqA).toEqual(seqB);
  });
});
