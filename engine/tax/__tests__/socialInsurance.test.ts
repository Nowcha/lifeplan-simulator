/**
 * 標準報酬月額の等級境界・端数処理・賞与上限のテスト。
 * 根拠: 協会けんぽ東京支部 令和8年度保険料額表
 * https://www.kyoukaikenpo.or.jp/assets/R8_13tokyo.pdf
 */

import { describe, expect, test } from "vitest";
import rules2026 from "../../../rules/2026.json";
import type { RuleSet } from "../../types/index.js";
import {
  bonusPremiums,
  employmentInsurance,
  lookupStandardMonthly,
  monthlyPremiums,
  pensionStandardMonthly
} from "../socialInsurance.js";

const si = (rules2026 as RuleSet).socialInsurance;

describe("標準報酬月額の等級マッピング(境界値)", () => {
  test.each([
    // [報酬月額, 期待される標準報酬月額]
    [0, 58000], // 1等級 下限
    [62999, 58000], // 1等級 上限
    [63000, 68000], // 2等級 下限
    [92999, 88000], // 4等級 上限
    [93000, 98000], // 5等級 下限
    [334000, 340000], // 24等級 (330,000〜350,000)
    [634999, 620000], // 34等級 上限
    [635000, 650000], // 35等級 下限
    [1354999, 1330000], // 49等級 上限
    [1355000, 1390000], // 50等級 下限
    [3000000, 1390000] // 50等級 (上限なし)
  ])("報酬月額 %i円 → 標準報酬 %i円", (pay, expected) => {
    expect(lookupStandardMonthly(pay, si)).toBe(expected);
  });
});

describe("厚生年金の標準報酬月額(1〜32等級への読み替え)", () => {
  test.each([
    [58000, 88000], // 健保1等級 → 厚年下限88,000
    [88000, 88000],
    [650000, 650000], // 厚年上限
    [680000, 650000], // 健保36等級 → 厚年は650,000のまま
    [1390000, 650000]
  ])("健保標準報酬 %i円 → 厚年標準報酬 %i円", (health, expected) => {
    expect(pensionStandardMonthly(health, si)).toBe(expected);
  });
});

describe("被保険者負担分の端数処理(50銭以下切捨て・50銭超切上げ)", () => {
  test("健保 標準報酬830,000: 830,000×9.85%/2 = 40,877.5 → 40,877 (ちょうど50銭は切捨て)", () => {
    const p = monthlyPremiums({ monthlyPay: 830000, isCareInsured: false, rules: si });
    expect(p.health).toBe(40877);
  });

  test("雇用保険 333,333×0.5% = 1,666.665 → 1,667 (50銭超は切上げ)", () => {
    expect(employmentInsurance(333333, si)).toBe(1667);
  });

  test("介護保険 40歳以上: 標準報酬500,000 → 500,000×1.62%/2 = 4,050", () => {
    const p = monthlyPremiums({ monthlyPay: 500000, isCareInsured: true, rules: si });
    expect(p.care).toBe(4050);
  });

  test("40歳未満は介護保険なし", () => {
    const p = monthlyPremiums({ monthlyPay: 500000, isCareInsured: false, rules: si });
    expect(p.care).toBe(0);
  });
});

describe("賞与の保険料(標準賞与額と上限)", () => {
  test("賞与1,000,500円 → 標準賞与額1,000,000円(千円未満切捨て)", () => {
    const b = bonusPremiums({
      bonusPayment: 1000500,
      healthBonusCumulative: 0,
      isCareInsured: false,
      rules: si
    });
    expect(b.standardBonus).toBe(1000000);
    // 健保 1,000,000×9.85%/2 = 49,250
    expect(b.health).toBe(49250);
    // 厚年 1,000,000×18.3%/2 = 91,500
    expect(b.pension).toBe(91500);
  });

  test("厚年は1回150万円で頭打ち: 賞与200万 → 厚年分は150万×18.3%/2 = 137,250", () => {
    const b = bonusPremiums({
      bonusPayment: 2000000,
      healthBonusCumulative: 0,
      isCareInsured: false,
      rules: si
    });
    expect(b.pension).toBe(137250);
    // 健保側は200万全額が対象(年度累計573万まで)
    expect(b.health).toBe(98500); // 2,000,000×9.85%/2
  });

  test("健保は年度累計573万で頭打ち: 累計500万+賞与300万 → 対象は73万のみ", () => {
    const b = bonusPremiums({
      bonusPayment: 3000000,
      healthBonusCumulative: 5000000,
      isCareInsured: false,
      rules: si
    });
    // 730,000×9.85%/2 = 35,952.5 → 35,952
    expect(b.health).toBe(35952);
    // 厚年は年度累計と無関係(月150万上限のみ)
    expect(b.pension).toBe(137250);
  });
});
