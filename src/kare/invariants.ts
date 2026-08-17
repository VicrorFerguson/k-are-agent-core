/**
 * PROTECTED ARCHITECTURAL INVARIANTS.
 *
 * These are the ONLY source-level constants allowed to encode behaviour.
 * They exist for security/architecture reasons and MUST NOT be overridable by
 * registry configuration, policy documents, environment variables or user input.
 *
 * Everything operational (endpoints, timeouts, retry counts, thresholds, model
 * names, prompts, business rules) lives in versioned configuration instead.
 */
export const PROTECTED_INVARIANTS = {
  /** JARVIS is an EXTERNAL system. No JARVIS source, runtime or filesystem may live in K-ARE. */
  JARVIS_IS_EXTERNAL_API_ONLY: true,
  /** KNOW Stylist AI may never call JARVIS directly; it must go through the K-ARE Agent Gateway. */
  KNOW_MUST_NOT_CALL_JARVIS_DIRECTLY: true,
  /** Raw secret values are never persisted by the application; only references/metadata. */
  SECRETS_STORED_BY_REFERENCE_ONLY: true,
  /** Secrets are never written to chat, logs, telemetry, source or ordinary config. */
  SECRETS_EXCLUDED_FROM_LOGS_AND_CHAT: true,
  /** Missing required configuration fails closed. Never fall back to a guessed default. */
  FAIL_CLOSED_ON_MISSING_CONFIG: true,
  /** A task may only be marked VERIFIED when execution evidence exists. */
  EVIDENCE_REQUIRED_FOR_PASS: true,
  /** Self-correction is bounded; unbounded autonomous retry loops are forbidden. */
  SELF_CORRECTION_MUST_BE_BOUNDED: true,
  /** High-risk operations require an explicit approval gate. */
  HIGH_RISK_REQUIRES_APPROVAL: true,
  /** Destructive autonomous actions are disabled by default. */
  NO_DESTRUCTIVE_AUTONOMY_BY_DEFAULT: true,
  /** No arbitrary code execution derived from untrusted input. */
  NO_ARBITRARY_CODE_EXECUTION: true,
} as const;

export type ProtectedInvariantKey = keyof typeof PROTECTED_INVARIANTS;

export const PROTECTED_INVARIANT_KEYS = Object.keys(
  PROTECTED_INVARIANTS,
) as ProtectedInvariantKey[];

export class InvariantViolationError extends Error {
  constructor(
    public readonly invariant: ProtectedInvariantKey | string,
    message: string,
  ) {
    super(`[invariant:${invariant}] ${message}`);
    this.name = "InvariantViolationError";
  }
}

/** Guard used by the registry/policy loader: config may not shadow an invariant key. */
export function assertDoesNotOverrideInvariants(keys: Iterable<string>): void {
  for (const key of keys) {
    if ((PROTECTED_INVARIANTS as Record<string, unknown>)[key] !== undefined) {
      throw new InvariantViolationError(
        key,
        "configuration attempted to override a protected architectural invariant",
      );
    }
  }
}