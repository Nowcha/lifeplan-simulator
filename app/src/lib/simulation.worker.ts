/**
 * シミュレーション本体をメインスレッド外で実行するWeb Worker。
 * サンプルプロフィール(household/events/assumptions/rules)は engine.ts 経由でのみ
 * 参照する — engine/・rules/・profile.sample/ への直接importは engine.ts に一本化する
 * (design doc §0)。メッセージを受け取るたびに再計算し、結果をpostMessageで返す。
 */
import { household, events, assumptions, rules, computeSimulation, type SimulationBundle } from "./engine.js";

self.onmessage = () => {
  const result: SimulationBundle = computeSimulation({ household, events, assumptions, rules });
  postMessage(result);
};
