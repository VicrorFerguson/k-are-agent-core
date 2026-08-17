export type KareErrorCode =
  | "config_missing"
  | "config_invalid"
  | "capability_unknown"
  | "agent_unavailable"
  | "unauthorized"
  | "invalid_input"
  | "timeout"
  | "circuit_open"
  | "budget_exhausted"
  | "approval_required"
  | "invariant_violation"
  | "credential_unavailable";

export class KareError extends Error {
  constructor(
    public readonly code: KareErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "KareError";
  }
}

export function isKareError(error: unknown): error is KareError {
  return error instanceof KareError;
}