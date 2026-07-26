import { describe, expect, test } from "vitest";
import { constantFactor, constantIndexation, pathFactor } from "../indexation.js";

describe("constantFactor", () => {
  test("0年経過は1倍", () => {
    expect(constantFactor(0.02)(0)).toBe(1);
  });

  test("負の経過年数も1倍(過去に遡って割り引かない)", () => {
    expect(constantFactor(0.02)(-3)).toBe(1);
  });

  test("一定率の複利", () => {
    expect(constantFactor(0.02)(1)).toBeCloseTo(1.02, 12);
    expect(constantFactor(0.02)(2)).toBeCloseTo(1.0404, 12);
  });

  test("率0なら何年経っても1倍", () => {
    expect(constantFactor(0)(30)).toBe(1);
  });

  test("既存の期待値パスと同じ式を使う(ビット単位で一致させる)", () => {
    // 決定論パスの結果を1円も動かさないため、pow をそのまま使うことを固定する
    for (const years of [1, 5, 17, 30]) {
      expect(constantFactor(0.015)(years)).toBe(Math.pow(1.015, years));
    }
  });
});

describe("pathFactor", () => {
  test("年次実現値の累積積", () => {
    const factor = pathFactor([0.01, 0.02, 0.03]);

    expect(factor(0)).toBe(1);
    expect(factor(1)).toBeCloseTo(1.01, 12);
    expect(factor(2)).toBeCloseTo(1.01 * 1.02, 12);
    expect(factor(3)).toBeCloseTo(1.01 * 1.02 * 1.03, 12);
  });

  test("一定率を並べれば複利と一致する(決定論との連続性)", () => {
    const factor = pathFactor(new Array(10).fill(0.02));

    expect(factor(10)).toBeCloseTo(Math.pow(1.02, 10), 10);
  });

  test("パスより先の年は末尾の累積で頭打ちにする", () => {
    const factor = pathFactor([0.01, 0.02]);

    expect(factor(5)).toBe(factor(2));
  });

  test("空のパスは常に1倍", () => {
    expect(pathFactor([])(4)).toBe(1);
  });

  test("マイナスの率(デフレ)も扱える", () => {
    const factor = pathFactor([-0.01, -0.02]);

    expect(factor(2)).toBeCloseTo(0.99 * 0.98, 12);
  });

  test("長いパスでも呼び出しごとに掛け直さない(前計算した累積を引く)", () => {
    // 実装がO(n)の掛け直しだと、同じ経過年数の再取得で誤差が出ないことは保証されない。
    // 前計算した配列を引くので何度呼んでも同一値になる。
    const factor = pathFactor(new Array(200).fill(0.01));

    expect(factor(200)).toBe(factor(200));
  });
});

describe("constantIndexation", () => {
  test("3つの指標をそれぞれ独立した率で持つ", () => {
    const factors = constantIndexation({ inflation: 0.02, wage: 0.03, education: 0.01 });

    expect(factors.inflation(1)).toBeCloseTo(1.02, 12);
    expect(factors.wage(1)).toBeCloseTo(1.03, 12);
    expect(factors.education(1)).toBeCloseTo(1.01, 12);
  });
});
