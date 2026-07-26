/**
 * ゴールデンテスト (設計書§9): 給与所得者の手取り・所得税・住民税・社保を
 * 一次情報の計算方法から手導出した期待値と突合する。許容誤差 ±1,000円。
 *
 * 前提: 2026年(令和8年分)・東京都・協会けんぽ・40歳未満・賞与なし(月給のみ)
 *
 * 一次情報:
 * - 所得税速算表: https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm
 * - 令和8年度税制改正(基礎控除104/67/62万・給与所得控除最低74万・配偶者所得要件62万):
 *   https://www.nta.go.jp/publication/pamph/gensen/2026kaisei.pdf
 * - 協会けんぽ東京 令和8年度保険料額表(健保9.85%・介護1.62%・支援金0.23%・厚年18.3%):
 *   https://www.kyoukaikenpo.or.jp/assets/R8_13tokyo.pdf
 * - 雇用保険 令和8年度 労働者負担0.5%(一般): https://www.mhlw.go.jp/content/001692566.pdf
 * - 住民税(所得割10%・均等割5,000円・調整控除): https://www.tax.metro.tokyo.lg.jp/kazei/kojin_ju.html
 */

import { describe, expect, test } from "vitest";
import rules2026 from "../../../rules/2026.json";
import type { RuleSet, Yen } from "../../types/index.js";
import { salaryIncome } from "../salaryIncome.js";
import { computeIncomeTax } from "../incomeTax.js";
import { computeResidentTax } from "../residentTax.js";
import { employmentInsurance, monthlyPremiums } from "../socialInsurance.js";

const rules = rules2026 as RuleSet;
const TOLERANCE = 1000;

function expectWithin(actual: Yen, expected: Yen): void {
  expect(Math.abs(actual - expected), `actual=${actual} expected=${expected}`).toBeLessThanOrEqual(
    TOLERANCE
  );
}

/** 月給のみ(賞与なし)・40歳未満の年間社会保険料 */
function annualSocialInsurance(monthlyPay: Yen): Yen {
  const premiums = monthlyPremiums({
    monthlyPay,
    isCareInsured: false,
    rules: rules.socialInsurance
  });
  return (premiums.total + employmentInsurance(monthlyPay, rules.socialInsurance)) * 12;
}

interface GoldenCase {
  name: string;
  monthlyPay: Yen;
  /** 導出過程はテスト下部の各コメント参照 */
  expected: {
    socialInsurance: Yen;
    salaryIncome: Yen;
    incomeTax: Yen;
    residentTax: Yen;
    net: Yen;
  };
}

/*
 * ケース1: 年収400万 (月333,333円 → 年3,999,996円)
 *   標準報酬月額340,000 (330,000〜350,000): 健保 340,000×9.85%/2=16,745
 *   支援金 340,000×0.23%/2=391 / 厚年 340,000×18.3%/2=31,110
 *   雇用 333,333×0.5%=1,666.665→1,667 / 月計49,913 → 年598,956
 *   給与所得: A=floor(3,999,996/4)→999,000(千円未満切捨)、999,000×3.2−440,000=2,756,800
 *   所得税: 基礎控除104万(所得≤489万) 課税所得=2,756,800−598,956−1,040,000=1,117,844→1,117,000
 *     5%=55,850 ×1.021=57,022.85→57,000 (100円未満切捨)
 *   住民税: 基礎控除43万 課税=1,727,844→1,727,000 調整控除2,500(区1,500/都1,000)
 *     区: 103,620−1,500→102,100 都: 69,080−1,000→68,000 +均等割5,000 = 175,100
 *   手取り = 3,999,996−598,956−57,000−175,100 = 3,168,940
 *
 * ケース2: 年収600万 (月500,000円)
 *   標準報酬500,000: 健保24,625 支援金575 厚年45,750 雇用2,500 → 年881,400
 *   給与所得: A=1,500,000 ×3.2−440,000=4,360,000
 *   所得税: 課税=4,360,000−881,400−1,040,000=2,438,600→2,438,000
 *     10%−97,500=146,300 ×1.021=149,372.3→149,300
 *   住民税: 課税=3,048,600→3,048,000 調整2,500
 *     区: 182,880−1,500→181,300 都: 121,920−1,000→120,900 +5,000 = 307,200
 *   手取り = 6,000,000−881,400−149,300−307,200 = 4,662,100
 *
 * ケース3: 年収800万 (月666,666円 → 年7,999,992円)
 *   標準報酬680,000(健保)/650,000(厚年上限): 健保33,490 支援金782 厚年59,475
 *   雇用 666,666×0.5%=3,333.33→3,333 / 月計97,080 → 年1,164,960
 *   給与所得: 7,999,992×90%−1,100,000=6,099,992.8→6,099,992
 *   所得税: 基礎控除67万(489万<所得≤655万) 課税=6,099,992−1,164,960−670,000=4,265,032→4,265,000
 *     20%−427,500=425,500 ×1.021=434,435.5→434,400
 *   住民税: 課税=4,505,032→4,505,000 調整2,500
 *     区: 270,300−1,500→268,800 都: 180,200−1,000→179,200 +5,000 = 453,000
 *   手取り = 7,999,992−1,164,960−434,400−453,000 = 5,947,632
 *
 * ケース4: 年収1000万 (月833,333円 → 年9,999,996円)
 *   標準報酬830,000/650,000: 健保 830,000×9.85%/2=40,877.5→40,877(50銭以下切捨)
 *   支援金954.5→954 厚年59,475 雇用4,166.665→4,167 / 月計105,473 → 年1,265,676
 *   給与所得: 9,999,996−1,950,000=8,049,996
 *   所得税: 基礎控除62万(655万超) 課税=8,049,996−1,265,676−620,000=6,164,320→6,164,000
 *     20%−427,500=805,300 ×1.021=822,211.3→822,200
 *   住民税: 課税=6,354,320→6,354,000 調整2,500
 *     区: 381,240−1,500→379,700 都: 254,160−1,000→253,100 +5,000 = 637,800
 *   手取り = 9,999,996−1,265,676−822,200−637,800 = 7,274,320
 *
 * ケース5: 年収1500万 (月1,250,000円)
 *   標準報酬1,270,000/650,000: 健保 62,547.5→62,547 支援金1,460.5→1,460
 *   厚年59,475 雇用6,250 / 月計129,732 → 年1,556,784
 *   給与所得: 15,000,000−1,950,000=13,050,000
 *   所得税: 課税=13,050,000−1,556,784−620,000=10,873,216→10,873,000
 *     33%−1,536,000=2,052,090 ×1.021=2,095,183.89→2,095,100
 *   住民税: 課税=11,063,216→11,063,000 調整2,500
 *     区: 663,780−1,500→662,200 都: 442,520−1,000→441,500 +5,000 = 1,108,700
 *   手取り = 15,000,000−1,556,784−2,095,100−1,108,700 = 10,239,416
 */
const goldenCases: GoldenCase[] = [
  {
    name: "年収400万",
    monthlyPay: 333333,
    expected: {
      socialInsurance: 598956,
      salaryIncome: 2756800,
      incomeTax: 57000,
      residentTax: 175100,
      net: 3168940
    }
  },
  {
    name: "年収600万",
    monthlyPay: 500000,
    expected: {
      socialInsurance: 881400,
      salaryIncome: 4360000,
      incomeTax: 149300,
      residentTax: 307200,
      net: 4662100
    }
  },
  {
    name: "年収800万",
    monthlyPay: 666666,
    expected: {
      socialInsurance: 1164960,
      salaryIncome: 6099992,
      incomeTax: 434400,
      residentTax: 453000,
      net: 5947632
    }
  },
  {
    name: "年収1000万",
    monthlyPay: 833333,
    expected: {
      socialInsurance: 1265676,
      salaryIncome: 8049996,
      incomeTax: 822200,
      residentTax: 637800,
      net: 7274320
    }
  },
  {
    name: "年収1500万",
    monthlyPay: 1250000,
    expected: {
      socialInsurance: 1556784,
      salaryIncome: 13050000,
      incomeTax: 2095100,
      residentTax: 1108700,
      net: 10239416
    }
  }
];

describe("ゴールデンテスト: 独身・東京・協会けんぽ・40歳未満 (2026年)", () => {
  for (const c of goldenCases) {
    test(c.name, () => {
      const gross = c.monthlyPay * 12;
      const si = annualSocialInsurance(c.monthlyPay);
      expectWithin(si, c.expected.socialInsurance);

      const income = salaryIncome(gross, rules.incomeTax);
      expectWithin(income, c.expected.salaryIncome);

      const incomeTax = computeIncomeTax({
        totalIncome: income,
        socialInsurancePaid: si,
        rules: rules.incomeTax
      });
      expectWithin(incomeTax.tax, c.expected.incomeTax);

      const residentTax = computeResidentTax({
        totalIncome: income,
        socialInsurancePaid: si,
        rules: rules.residentTax
      });
      expectWithin(residentTax.total, c.expected.residentTax);

      const net = gross - si - incomeTax.tax - residentTax.total;
      expectWithin(net, c.expected.net);
    });
  }

  /*
   * ケース6: 年収600万 + 配偶者(所得0) — 配偶者控除あり
   *   社保はケース2と同一(年881,400)
   *   所得税: 配偶者控除38万(本人所得≤900万・配偶者所得≤62万)
   *     課税=4,360,000−881,400−1,040,000−380,000=2,058,600→2,058,000
   *     10%−97,500=108,300 ×1.021=110,574.3→110,500
   *   住民税: 配偶者控除33万 課税=2,718,600→2,718,000
   *     調整控除: 人的控除差=基礎5万+配偶者5万=10万、課税>200万 →
   *       (100,000−718,000)<0 → 下限2,500円 (区1,500/都1,000)
   *     区: 163,080−1,500→161,500 都: 108,720−1,000→107,700 +5,000 = 274,200
   *   手取り = 6,000,000−881,400−110,500−274,200 = 4,733,900
   */
  test("年収600万 + 配偶者控除(配偶者所得0)", () => {
    const gross = 500000 * 12;
    const si = annualSocialInsurance(500000);
    const income = salaryIncome(gross, rules.incomeTax);

    const incomeTax = computeIncomeTax({
      totalIncome: income,
      socialInsurancePaid: si,
      spouseTotalIncome: 0,
      rules: rules.incomeTax
    });
    expectWithin(incomeTax.tax, 110500);
    expect(incomeTax.deductions.spouse).toBe(380000);

    const residentTax = computeResidentTax({
      totalIncome: income,
      socialInsurancePaid: si,
      spouseTotalIncome: 0,
      rules: rules.residentTax
    });
    expectWithin(residentTax.total, 274200);

    const net = gross - si - incomeTax.tax - residentTax.total;
    expectWithin(net, 4733900);
  });

  /**
   * 配偶者控除の所得要件(62万円)を超えた先は配偶者特別控除が引き継ぐため、控除額に
   * 崖はできない。133万円を超えて初めて適用がなくなる。
   * 一次情報: 国税庁「令和8年4月 源泉所得税の改正のあらまし」(参考)改正後の
   * 配偶者特別控除額の表 https://www.nta.go.jp/publication/pamph/gensen/2026kaisei.pdf
   */
  test("配偶者の所得が62万円を超えても控除は崖にならず、133万円超で消える", () => {
    const gross = 500000 * 12;
    const si = annualSocialInsurance(500000);
    const income = salaryIncome(gross, rules.incomeTax);
    const spouseDeductionAt = (spouseTotalIncome: Yen): Yen =>
      computeIncomeTax({ totalIncome: income, socialInsurancePaid: si, spouseTotalIncome, rules: rules.incomeTax })
        .deductions.spouse;

    // 62万円ちょうどは配偶者控除、1円超えると配偶者特別控除。どちらも38万円
    expect(spouseDeductionAt(620000)).toBe(380000);
    expect(spouseDeductionAt(620001)).toBe(380000);
    // 95万円を超えてから逓減が始まる
    expect(spouseDeductionAt(950000)).toBe(380000);
    expect(spouseDeductionAt(950001)).toBe(360000);
    // 133万円が上限
    expect(spouseDeductionAt(1330000)).toBe(30000);
    expect(spouseDeductionAt(1330001)).toBe(0);
  });
});
