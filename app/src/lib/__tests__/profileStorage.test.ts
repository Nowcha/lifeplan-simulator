import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { defaultProfile, loadProfile, resetProfile, saveProfile } from "../profileStorage";

const STORAGE_KEY = "lifeplan-sim:profile:v1";

/** node環境にはlocalStorageが無いため、テスト用の最小実装を差し込む */
function createLocalStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, value)
  };
}

beforeEach(() => {
  globalThis.localStorage = createLocalStorageStub();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("defaultProfile", () => {
  test("サンプルプロフィールの世帯・イベント・前提を返す", () => {
    const profile = defaultProfile();

    expect(profile.household.persons.length).toBeGreaterThan(0);
    expect(Array.isArray(profile.events)).toBe(true);
    expect(profile.assumptions.simulation.paths).toBeGreaterThan(0);
  });

  test("呼び出しごとに独立したコピーを返す(編集がサンプルへ漏れない)", () => {
    const first = defaultProfile();
    first.household.persons[0]!.retirementAge = 99;

    expect(defaultProfile().household.persons[0]?.retirementAge).not.toBe(99);
  });
});

describe("loadProfile", () => {
  test("保存が無いときはサンプルにフォールバックする", () => {
    expect(loadProfile()).toEqual(defaultProfile());
  });

  test("保存済みプロフィールを読み戻す", () => {
    const profile = defaultProfile();
    profile.household.persons[0]!.retirementAge = 62;
    saveProfile(profile);

    expect(loadProfile().household.persons[0]?.retirementAge).toBe(62);
  });

  test("壊れたJSONが入っていても例外を投げずサンプルへフォールバックする", () => {
    localStorage.setItem(STORAGE_KEY, "{壊れたJSON");

    expect(loadProfile()).toEqual(defaultProfile());
  });
});

describe("resetProfile", () => {
  test("保存を消してサンプルを返す", () => {
    const profile = defaultProfile();
    profile.household.persons[0]!.retirementAge = 62;
    saveProfile(profile);

    const reset = resetProfile();

    expect(reset).toEqual(defaultProfile());
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
