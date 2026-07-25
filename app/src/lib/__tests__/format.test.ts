import { describe, expect, test } from "vitest";
import { formatManYen, formatPercent, formatYen } from "../format";

describe("formatManYen", () => {
  test("万円単位に丸めて桁区切りを入れる", () => {
    expect(formatManYen(12_345_678)).toBe("1,235万円");
  });

  test("1万円未満は四捨五入する", () => {
    expect(formatManYen(15_000)).toBe("2万円");
    expect(formatManYen(14_999)).toBe("1万円");
  });

  test("負の金額は先頭にマイナスを付ける", () => {
    expect(formatManYen(-12_345_678)).toBe("-1,235万円");
  });

  test("0は0万円", () => {
    expect(formatManYen(0)).toBe("0万円");
  });

  test("負の少額でも -0万円 とは表示しない", () => {
    // 資産が -3,000円 のとき「-0万円」と出るとゼロなのか負なのか読めない
    expect(formatManYen(-3_000)).toBe("0万円");
  });
});

describe("formatYen", () => {
  test("円未満を丸めて桁区切りを入れる", () => {
    expect(formatYen(1_234_567.4)).toBe("1,234,567円");
  });

  test("負の金額も桁区切りされる", () => {
    expect(formatYen(-1_234_567)).toBe("-1,234,567円");
  });

  test("0に丸まる負の端数を -0円 と表示しない", () => {
    expect(formatYen(-0.4)).toBe("0円");
  });
});

describe("formatPercent", () => {
  test("小数の率をパーセント表記にする(既定は小数1桁)", () => {
    expect(formatPercent(0.023)).toBe("2.3%");
  });

  test("桁数を指定できる", () => {
    expect(formatPercent(0.0234, 2)).toBe("2.34%");
    expect(formatPercent(0.02, 0)).toBe("2%");
  });

  test("負の率も表現できる", () => {
    expect(formatPercent(-0.015)).toBe("-1.5%");
  });
});
