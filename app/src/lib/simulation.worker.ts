/**
 * シミュレーション本体をメインスレッド外で実行するWeb Worker。
 * engine/・rules/・profile.sample/ への直接importは engine.ts に一本化する
 * (design doc §0)。メインスレッドから渡された SimulationInput を計算し、
 * 結果をpostMessageで返す。
 */
import { computeSimulation, type SimulationBundle, type SimulationInput } from "./engine.js";

self.onmessage = (event: MessageEvent<SimulationInput>) => {
  const result: SimulationBundle = computeSimulation(event.data);
  postMessage(result);
};
