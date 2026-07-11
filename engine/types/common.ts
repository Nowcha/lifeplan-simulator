/** Design doc §2: common scalar types */

/** Integer yen. All monetary amounts in the engine are integer yen. */
export type Yen = number;

/** Decimal rate: 0.03 = 3% */
export type Rate = number;

/** Calendar year-month, e.g. "2026-07" */
export type YearMonth = string;

export type PersonId = string;
export type EventId = string;

/** Indexation mode attached to income/expense items */
export type Indexation = "inflation" | "wage" | "fixed";
