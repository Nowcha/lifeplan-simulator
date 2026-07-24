/** 編集可能プロフィール(household/events/assumptions)のlocalStorage永続化。 */
import type { Household, LifeEvent, Assumptions } from "../../../engine/types/index.js";
import { household as sampleHousehold, events as sampleEvents, assumptions as sampleAssumptions } from "./engine.js";

const STORAGE_KEY = "lifeplan-sim:profile:v1";

export interface EditableProfile {
  household: Household;
  events: LifeEvent[];
  assumptions: Assumptions;
}

/** react-hook-form の型パラメータとして使う別名(意味的にはEditableProfileと同一) */
export type ProfileFormValues = EditableProfile;

export function defaultProfile(): EditableProfile {
  return {
    household: structuredClone(sampleHousehold),
    events: structuredClone(sampleEvents),
    assumptions: structuredClone(sampleAssumptions)
  };
}

export function loadProfile(): EditableProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProfile();
    return JSON.parse(raw) as EditableProfile;
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile: EditableProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function resetProfile(): EditableProfile {
  localStorage.removeItem(STORAGE_KEY);
  return defaultProfile();
}
