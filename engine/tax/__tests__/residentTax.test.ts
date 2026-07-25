/**
 * 住民税の非課税限度額・扶養控除・調整控除。
 *
 * 一次情報:
 * - 非課税限度額(東京23区=生活保護法1級地): 均等割・所得割とも非課税は
 *   「35万円×(本人・同一生計配偶者・扶養親族の合計人数)+31万円」以下、
 *   扶養親族がいない場合は45万円以下。所得割のみ非課税は「35万円×同人数+42万円」以下。
 *   判定上の扶養親族は16歳未満の者および控除対象扶養親族に限る。
 *   https://www.tax.metro.tokyo.lg.jp/kazei/life/kojin_ju (確認日 2026-07-25)
 * - 住民税の扶養控除(令和8年度以降): 16歳未満=なし、一般33万円、特定(19〜23歳未満)45万円。
 *   https://www.city.koto.lg.jp/060502/kurashi/zekin/kuminze/5105.html (確認日 2026-07-25)
 * - 調整控除の人的控除額の差: 基礎5万・配偶者5万・扶養 一般5万/特定18万。
 *   https://www.city.koto.lg.jp/060502/kurashi/zekin/kuminze/zeikoujo.html (確認日 2026-07-25)
 */

import { describe, expect, test } from "vitest";
import rules2026 from "../../../rules/2026.json";
import type { RuleSet } from "../../types/index.js";
import { computeResidentTax, nonTaxableThresholds } from "../residentTax.js";

const rules = (rules2026 as unknown as RuleSet).residentTax;
const PER_CAPITA = 5000; // 区民税3,000 + 都民税1,000 + 森林環境税1,000

describe("非課税限度額の算定", () => {
  test("単身(本人のみ)は均等割・所得割とも45万円", () => {
    // 35万×1 + 10万 = 45万。扶養親族がいないので加算なし
    expect(nonTaxableThresholds(1, rules.nonTaxable)).toEqual({ perCapita: 450000, incomeLevy: 450000 });
  });

  test("扶養親族がいると均等割は+21万、所得割は+32万される", () => {
    // 2人: 35万×2 + 10万 = 80万 → 均等割 101万 / 所得割 112万
    expect(nonTaxableThresholds(2, rules.nonTaxable)).toEqual({ perCapita: 1010000, incomeLevy: 1120000 });
    // 4人: 35万×4 + 10万 = 150万 → 均等割 171万 / 所得割 182万
    expect(nonTaxableThresholds(4, rules.nonTaxable)).toEqual({ perCapita: 1710000, incomeLevy: 1820000 });
  });

  test("所得割のしきい値は常に均等割より高い(均等割だけ課税される帯がある)", () => {
    for (const headcount of [2, 3, 5]) {
      const t = nonTaxableThresholds(headcount, rules.nonTaxable);
      expect(t.incomeLevy).toBeGreaterThan(t.perCapita);
    }
  });
});

describe("非課税判定(単身)", () => {
  const base = { socialInsurancePaid: 0, rules };

  test("合計所得45万円以下は全額非課税", () => {
    expect(computeResidentTax({ ...base, totalIncome: 450000 }).total).toBe(0);
  });

  test("45万円を超えると課税される", () => {
    expect(computeResidentTax({ ...base, totalIncome: 450001 }).total).toBeGreaterThan(0);
  });
});

describe("非課税判定(扶養親族あり)", () => {
  // 本人 + 16歳未満の子2人 = 3人 → 35万×3+10万 = 115万
  // 均等割非課税 136万以下 / 所得割非課税 147万以下
  const base = { socialInsurancePaid: 0, dependentAges: [5, 10], rules };

  test("16歳未満の子も人数に算入される(控除は無くても数える)", () => {
    // 単身なら45万で課税されるが、子2人がいるので136万まで全額非課税
    expect(computeResidentTax({ ...base, totalIncome: 1360000 }).total).toBe(0);
  });

  test("均等割のしきい値を超え所得割のしきい値以下なら、均等割だけ課税される", () => {
    const r = computeResidentTax({ ...base, totalIncome: 1400000 });

    expect(r.incomeLevy).toBe(0);
    expect(r.perCapita).toBe(PER_CAPITA);
    expect(r.total).toBe(PER_CAPITA);
  });

  test("所得割のしきい値を超えると両方課税される", () => {
    const r = computeResidentTax({ ...base, totalIncome: 1500000 });

    expect(r.incomeLevy).toBeGreaterThan(0);
    expect(r.perCapita).toBe(PER_CAPITA);
  });

  test("同一生計配偶者も人数に算入される", () => {
    // 本人 + 配偶者(所得0=同一生計配偶者) = 2人 → 均等割非課税 101万以下
    const withSpouse = { socialInsurancePaid: 0, spouseTotalIncome: 0, rules };

    expect(computeResidentTax({ ...withSpouse, totalIncome: 1010000 }).total).toBe(0);
    expect(computeResidentTax({ ...withSpouse, totalIncome: 1020000 }).total).toBeGreaterThan(0);
  });

  test("所得要件を超える配偶者は同一生計配偶者に当たらず、人数に入らない", () => {
    // 配偶者の合計所得が62万円超 → 単身扱いで45万が限度
    const r = computeResidentTax({ socialInsurancePaid: 0, spouseTotalIncome: 700000, totalIncome: 500000, rules });

    expect(r.total).toBeGreaterThan(0);
  });
});

describe("扶養控除と調整控除", () => {
  const base = { totalIncome: 6000000, socialInsurancePaid: 900000, rules };

  test("扶養控除の分だけ課税所得が下がる(一般33万・特定45万)", () => {
    const none = computeResidentTax(base);
    const general = computeResidentTax({ ...base, dependentAges: [17] });
    const specific = computeResidentTax({ ...base, dependentAges: [20] });

    expect(none.taxableIncome - general.taxableIncome).toBe(330000);
    expect(none.taxableIncome - specific.taxableIncome).toBe(450000);
  });

  test("16歳未満の子は控除に影響しない", () => {
    expect(computeResidentTax({ ...base, dependentAges: [10] }).taxableIncome).toBe(
      computeResidentTax(base).taxableIncome
    );
  });

  test("調整控除に扶養の人的控除差が乗る(一般5万・特定18万)", () => {
    // 課税所得200万円超なので調整控除 = {差の合計 -(課税所得-200万)}×5%、最低2,500円。
    // このケースは課税所得が高く最低額に張り付くため、差の増加は調整控除を動かさない。
    // 差そのものが効いていることは低所得ケースで確認する。
    const none = computeResidentTax(base);
    const specific = computeResidentTax({ ...base, dependentAges: [20] });

    expect(none.adjustmentCredit).toBe(2500);
    expect(specific.adjustmentCredit).toBe(2500);
  });

  test("課税所得200万円以下では扶養の人的控除差がそのまま調整控除を増やす", () => {
    // 合計所得250万・社保35万 → 課税所得は200万以下に収まる
    const low = { totalIncome: 2500000, socialInsurancePaid: 350000, rules };
    const none = computeResidentTax(low);
    const general = computeResidentTax({ ...low, dependentAges: [17] });
    const specific = computeResidentTax({ ...low, dependentAges: [20] });

    // 基礎5万のみ → 5万×5% = 2,500円
    expect(none.adjustmentCredit).toBe(2500);
    // +一般5万 → 10万×5% = 5,000円
    expect(general.adjustmentCredit).toBe(5000);
    // +特定18万 → 23万×5% = 11,500円
    expect(specific.adjustmentCredit).toBe(11500);
  });
});
