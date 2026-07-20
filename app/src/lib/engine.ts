/**
 * UIとエンジンの境界(design doc §0: エンジンとUIの完全分離)。
 * このファイルだけがリポジトリルートの engine/ ・ rules/ ・ profile.sample/
 * を直接importする — 他のUIコードは本ファイル経由でのみ結果を得る。
 */

import type { Household, LifeEvent, Assumptions, RuleSet, SimulationResult } from "../../../engine/types/index.js";
import { runDeterministic } from "../../../engine/pipeline.js";
import { runMonteCarlo } from "../../../engine/montecarlo/run.js";
import { runSensitivity, type SensitivityFactor } from "../../../engine/montecarlo/sensitivity.js";

import sampleHousehold from "../../../profile.sample/household.json";
import sampleEvents from "../../../profile.sample/events.json";
import sampleAssumptions from "../../../profile.sample/assumptions.json";
import rules2026 from "../../../rules/2026.json";

export const household = sampleHousehold as unknown as Household;
export const events = sampleEvents as unknown as LifeEvent[];
export const assumptions = sampleAssumptions as unknown as Assumptions;
export const rules = rules2026 as unknown as RuleSet;

export interface SimulationBundle {
  deterministic: SimulationResult;
  monteCarlo: ReturnType<typeof runMonteCarlo>;
  sensitivity: SensitivityFactor[];
}

/**
 * ブラウザのメインスレッドで同期実行するため、assumptions.json本来のpaths
 * (10,000)は使わず縮小する — 10,000パスは実測で約3.7秒UIをブロックする。
 * 感度分析は要因数×2回モンテカルロを回すためさらに絞る。将来的にWeb
 * Workerへオフロードすれば本来のpaths数に戻せる(design doc §0: エンジンは
 * ブラウザAPI非依存でWeb Workerにそのまま載る設計)。
 */
const UI_MONTE_CARLO_PATHS = 500;
const UI_SENSITIVITY_PATHS = 150;

/** Runs the deterministic path, the full Monte Carlo summary, and sensitivity in one pass */
export function runSimulation(): SimulationBundle {
  const deterministic = runDeterministic(household, events, assumptions, rules);

  const monteCarloAssumptions: Assumptions = {
    ...assumptions,
    simulation: { ...assumptions.simulation, paths: UI_MONTE_CARLO_PATHS }
  };
  const sensitivityAssumptions: Assumptions = {
    ...assumptions,
    simulation: { ...assumptions.simulation, paths: UI_SENSITIVITY_PATHS }
  };

  const monteCarlo = runMonteCarlo(household, events, monteCarloAssumptions, rules);
  const sensitivity = runSensitivity(household, events, sensitivityAssumptions, rules);
  return { deterministic, monteCarlo, sensitivity };
}
