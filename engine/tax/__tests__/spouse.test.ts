/**
 * 配偶者控除 / 配偶者特別控除。
 *
 * 一次情報:
 * - 所得税の配偶者特別控除額(令和8・9年分): 国税庁「令和8年4月 源泉所得税の改正の
 *   あらまし」(参考)改正後の配偶者特別控除額及び特定親族特別控除額の表。
 *   対象は配偶者の合計所得62万円超133万円以下。62万円超95万円以下は38/26/13万円。
 *   https://www.nta.go.jp/publication/pamph/gensen/2026kaisei.pdf (確認日 2026-07-26)
 * - 住民税の配偶者特別控除額: 江東区・所得控除の種類(令和8年度以降)。上限33万円。
 *   https://www.city.koto.lg.jp/060502/kurashi/zekin/kuminze/5105.html (確認日 2026-07-26)
 * - 同一生計配偶者の所得要件62万円以下(令和8年分): 同あらまし ⑶扶養親族等の所得要件の改正
 * - 老人控除対象配偶者(その年12/31現在70歳以上): 所得税48/32/16万円・住民税38/26/13万円。
 *   https://www.city.koto.lg.jp/060502/kurashi/zekin/kuminze/zeikoujo.html (確認日 2026-07-26)
 */

import { describe, expect, test } from "vitest";
import rules2026 from "../../../rules/2026.json";
import type { RuleSet } from "../../types/index.js";
import { spouseDeduction } from "../spouse.js";

const rules = rules2026 as unknown as RuleSet;
const it = rules.incomeTax;
const rt = rules.residentTax;

/** 本人の合計所得を900万円以下の帯に固定して、配偶者の所得だけを動かす */
const OWNER_LOW = 6_000_000;

function incomeTaxFor(spouseIncome: number | undefined, ownerIncome = OWNER_LOW) {
  return spouseDeduction(ownerIncome, spouseIncome, it.spouseDeduction, it.spouseSpecialDeduction);
}

function residentTaxFor(spouseIncome: number | undefined, ownerIncome = OWNER_LOW) {
  return spouseDeduction(ownerIncome, spouseIncome, rt.spouseDeduction, rt.spouseSpecialDeduction);
}

describe("配偶者がいない場合", () => {
  test("undefined なら控除なし", () => {
    expect(incomeTaxFor(undefined)).toEqual({ amount: 0, kind: "none" });
  });
});

describe("配偶者控除(所得要件以下)", () => {
  test("配偶者の合計所得62万円ちょうどまでは配偶者控除", () => {
    expect(incomeTaxFor(620_000)).toEqual({ amount: 380_000, kind: "ordinary" });
    expect(residentTaxFor(620_000)).toEqual({ amount: 330_000, kind: "ordinary" });
  });

  test("所得0の専業配偶者も配偶者控除", () => {
    expect(incomeTaxFor(0).kind).toBe("ordinary");
  });

  test("本人の合計所得で38/26/13万円と逓減する", () => {
    expect(incomeTaxFor(0, 9_000_000).amount).toBe(380_000);
    expect(incomeTaxFor(0, 9_000_001).amount).toBe(260_000);
    expect(incomeTaxFor(0, 9_500_001).amount).toBe(130_000);
    expect(incomeTaxFor(0, 10_000_001).amount).toBe(0);
  });
});

describe("配偶者特別控除(所得要件超〜133万円)", () => {
  test("62万円を1円でも超えると配偶者特別控除に切り替わる", () => {
    expect(incomeTaxFor(620_001)).toEqual({ amount: 380_000, kind: "special" });
  });

  test("62万円超95万円以下は38万円のまま(崖が無い)", () => {
    // 配偶者控除だけの実装では、ここで控除が0に落ちる崖ができていた
    expect(incomeTaxFor(950_000).amount).toBe(380_000);
  });

  test("所得税は95万円を超えると逓減しはじめる", () => {
    expect(incomeTaxFor(950_001).amount).toBe(360_000);
    expect(incomeTaxFor(1_000_000).amount).toBe(360_000);
    expect(incomeTaxFor(1_000_001).amount).toBe(310_000);
  });

  test("所得税の各帯の上限値(一次情報の表と一致)", () => {
    const expected: [number, number][] = [
      [950_000, 380_000],
      [1_000_000, 360_000],
      [1_050_000, 310_000],
      [1_100_000, 260_000],
      [1_150_000, 210_000],
      [1_200_000, 160_000],
      [1_250_000, 110_000],
      [1_300_000, 60_000],
      [1_330_000, 30_000]
    ];

    for (const [spouseIncome, amount] of expected) {
      expect(incomeTaxFor(spouseIncome).amount, `配偶者所得 ${spouseIncome}`).toBe(amount);
    }
  });

  test("133万円を超えると適用なし", () => {
    expect(incomeTaxFor(1_330_001)).toEqual({ amount: 0, kind: "none" });
  });

  test("本人の合計所得が1,000万円を超えると適用されない", () => {
    expect(incomeTaxFor(1_000_000, 10_000_001).amount).toBe(0);
  });

  test("本人の所得帯ごとの逓減(配偶者所得100万円超105万円以下の行)", () => {
    expect(incomeTaxFor(1_050_000, 9_000_000).amount).toBe(310_000);
    expect(incomeTaxFor(1_050_000, 9_000_001).amount).toBe(210_000);
    expect(incomeTaxFor(1_050_000, 9_500_001).amount).toBe(110_000);
  });
});

describe("住民税の配偶者特別控除", () => {
  test("上限は33万円で、100万円までは据え置き(所得税の36万円の段が無い)", () => {
    expect(residentTaxFor(620_001).amount).toBe(330_000);
    expect(residentTaxFor(950_001).amount).toBe(330_000);
    expect(residentTaxFor(1_000_000).amount).toBe(330_000);
  });

  test("100万円超は所得税と同額になる", () => {
    for (const spouseIncome of [1_050_000, 1_100_000, 1_150_000, 1_200_000, 1_250_000, 1_300_000, 1_330_000]) {
      expect(residentTaxFor(spouseIncome).amount, `配偶者所得 ${spouseIncome}`).toBe(
        incomeTaxFor(spouseIncome).amount
      );
    }
  });

  test("133万円を超えると適用なし", () => {
    expect(residentTaxFor(1_330_001).kind).toBe("none");
  });
});

describe("控除額は配偶者の所得が増えるほど単調に減る", () => {
  test("62万円から134万円まで、増えることはない", () => {
    let previous = Number.POSITIVE_INFINITY;

    for (let spouseIncome = 600_000; spouseIncome <= 1_340_000; spouseIncome += 10_000) {
      const amount = incomeTaxFor(spouseIncome).amount;
      expect(amount, `配偶者所得 ${spouseIncome}`).toBeLessThanOrEqual(previous);
      previous = amount;
    }
  });
});

describe("老人控除対象配偶者(70歳以上)", () => {
  const elderly = (spouseIncome: number, ownerIncome = OWNER_LOW) =>
    spouseDeduction(ownerIncome, spouseIncome, it.spouseDeduction, it.spouseSpecialDeduction, 70);

  test("70歳から割増される(所得税48万円)", () => {
    expect(spouseDeduction(OWNER_LOW, 0, it.spouseDeduction, it.spouseSpecialDeduction, 69)).toEqual({
      amount: 380_000,
      kind: "ordinary"
    });
    expect(elderly(0)).toEqual({ amount: 480_000, kind: "elderly" });
  });

  test("住民税は38万円", () => {
    expect(spouseDeduction(OWNER_LOW, 0, rt.spouseDeduction, rt.spouseSpecialDeduction, 70).amount).toBe(380_000);
  });

  test("本人の合計所得で48/32/16万円と逓減する", () => {
    expect(elderly(0, 9_000_000).amount).toBe(480_000);
    expect(elderly(0, 9_000_001).amount).toBe(320_000);
    expect(elderly(0, 9_500_001).amount).toBe(160_000);
    expect(elderly(0, 10_000_001).amount).toBe(0);
  });

  test("年齢が不明なら一般の配偶者控除として扱う", () => {
    expect(spouseDeduction(OWNER_LOW, 0, it.spouseDeduction, it.spouseSpecialDeduction).kind).toBe("ordinary");
  });

  test("所得要件を超えると年齢に関係なく配偶者特別控除になる(割増は無い)", () => {
    expect(elderly(620_001).kind).toBe("special");
    expect(elderly(620_001).amount).toBe(380_000);
  });
});
