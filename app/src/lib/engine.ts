/**
 * UIとエンジンの境界(design doc §0: エンジンとUIの完全分離)。
 * このファイルだけがリポジトリルートの engine/ ・ rules/ ・ profile.sample/
 * を直接importする — 他のUIコードは本ファイル経由でのみ結果を得る。
 */

import type { Household, LifeEvent, Assumptions, EducationCosts, RuleSet, SimulationResult } from "../../../engine/types/index.js";
import { runDeterministic } from "../../../engine/pipeline.js";
import { runMonteCarlo } from "../../../engine/montecarlo/run.js";
import { runSensitivity, type SensitivityFactor } from "../../../engine/montecarlo/sensitivity.js";

import sampleHousehold from "../../../profile.sample/household.json";
import sampleEvents from "../../../profile.sample/events.json";
import sampleAssumptions from "../../../profile.sample/assumptions.json";
import rules2026 from "../../../rules/2026.json";
import educationCosts from "../../../rules/education-costs.json";

import SimulationWorker from "./simulation.worker.ts?worker";

export const household = sampleHousehold as unknown as Household;
export const events = sampleEvents as unknown as LifeEvent[];
export const assumptions = sampleAssumptions as unknown as Assumptions;
/**
 * rules/education-costs.json(文科省統計ベース、年次非依存)は rules/<year>.json とは
 * 別ファイルなので、ここでRuleSetにマージする(scripts/demo.tsと同じ方式)。
 */
export const rules: RuleSet = {
  ...(rules2026 as unknown as RuleSet),
  educationCosts: educationCosts as unknown as EducationCosts
};

export interface SimulationBundle {
  deterministic: SimulationResult;
  monteCarlo: ReturnType<typeof runMonteCarlo>;
  sensitivity: SensitivityFactor[];
}

export interface SimulationInput {
  household: Household;
  events: LifeEvent[];
  assumptions: Assumptions;
  rules: RuleSet;
}

/**
 * デターミニスティックパス・モンテカルロ・感度分析をすべて実行する(同期・重い計算)。
 * assumptions本来のpaths(design doc既定10,000)をそのまま使う — メインスレッドを
 * ブロックしないよう、このモジュールを直接importするのは simulation.worker.ts のみ
 * (design doc §0: エンジンはブラウザAPI非依存でWeb Workerにそのまま載る設計)。
 */
export function computeSimulation(input: SimulationInput): SimulationBundle {
  const { household, events, assumptions, rules } = input;
  const deterministic = runDeterministic(household, events, assumptions, rules);
  const monteCarlo = runMonteCarlo(household, events, assumptions, rules);
  const sensitivity = runSensitivity(household, events, assumptions, rules);
  return { deterministic, monteCarlo, sensitivity };
}

/** Web Worker上で指定プロフィールのシミュレーションを実行し、メインスレッドをブロックしない */
export function runSimulationInWorker(input: SimulationInput): Promise<SimulationBundle> {
  return new Promise((resolve, reject) => {
    const worker = new SimulationWorker();

    worker.onmessage = (event: MessageEvent<SimulationBundle>) => {
      resolve(event.data);
      worker.terminate();
    };
    worker.onerror = (event: ErrorEvent) => {
      reject(new Error(event.message || "シミュレーションWorkerでエラーが発生しました"));
      worker.terminate();
    };

    worker.postMessage(input);
  });
}
