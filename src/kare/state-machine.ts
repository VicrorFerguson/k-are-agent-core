import { TERMINAL_TASK_STATES, type TaskState } from "./domain";

/** Explicit, auditable transition table for the K-ARE core loop. */
export const TRANSITIONS: Record<TaskState, TaskState[]> = {
  INTAKE: ["UNDERSTAND", "REJECTED", "FAILED"],
  UNDERSTAND: ["INSPECT", "FAILED", "REJECTED"],
  INSPECT: ["PLAN", "FAILED"],
  PLAN: ["AWAITING_APPROVAL", "CHANGE", "FAILED"],
  AWAITING_APPROVAL: ["CHANGE", "REJECTED"],
  CHANGE: ["TEST", "ROLLING_BACK", "FAILED"],
  TEST: ["VERIFY", "DIAGNOSE"],
  DIAGNOSE: ["CORRECT", "ROLLING_BACK", "FAILED"],
  CORRECT: ["TEST", "ROLLING_BACK", "FAILED"],
  VERIFY: ["RECORD", "DIAGNOSE"],
  RECORD: ["COMPLETED"],
  ROLLING_BACK: ["ROLLED_BACK", "FAILED"],
  ROLLED_BACK: [],
  COMPLETED: [],
  FAILED: [],
  REJECTED: [],
};

export function canTransition(from: TaskState, to: TaskState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(state: TaskState): boolean {
  return TERMINAL_TASK_STATES.includes(state);
}

export class IllegalTransitionError extends Error {
  constructor(from: TaskState, to: TaskState) {
    super(`Illegal task transition ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}