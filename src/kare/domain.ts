import { z } from "zod";

/** ---------------------------------------------------------------- risk */
export const RiskClassSchema = z.enum(["low", "medium", "high", "critical"]);
export type RiskClass = z.infer<typeof RiskClassSchema>;

/** ------------------------------------------------------- task lifecycle */
export const TaskStateSchema = z.enum([
  "INTAKE",
  "UNDERSTAND",
  "INSPECT",
  "PLAN",
  "AWAITING_APPROVAL",
  "CHANGE",
  "TEST",
  "DIAGNOSE",
  "CORRECT",
  "VERIFY",
  "RECORD",
  "ROLLING_BACK",
  "ROLLED_BACK",
  "COMPLETED",
  "FAILED",
  "REJECTED",
]);
export type TaskState = z.infer<typeof TaskStateSchema>;

export const TERMINAL_TASK_STATES: TaskState[] = [
  "COMPLETED",
  "FAILED",
  "ROLLED_BACK",
  "REJECTED",
];

/** --------------------------------------------------------- capabilities */
export const CapabilityIdSchema = z
  .string()
  .min(3)
  .regex(/^[a-z][a-z0-9]*(?:\.[a-z0-9-]+)+$/, "capability ids use dot.notation");

export const AgentKindSchema = z.enum(["external-api", "internal", "mock"]);

export const HealthStateSchema = z.enum(["healthy", "degraded", "unavailable", "unknown"]);
export type HealthState = z.infer<typeof HealthStateSchema>;

/** Operational, versioned agent descriptor. Nothing here is a source constant. */
export const AgentDescriptorSchema = z.object({
  agentId: z.string().min(2),
  displayName: z.string().min(1),
  kind: AgentKindSchema,
  /** Marks adapters that are explicitly NOT a real integration. */
  isMock: z.boolean(),
  capabilities: z.array(CapabilityIdSchema).min(1),
  /** Declared scopes the caller must hold to invoke this agent. */
  requiredScopes: z.array(z.string().min(1)),
  /** Reference to a credential record; never a secret value. */
  credentialRef: z.string().min(1).nullable(),
  /** Endpoint is configuration, never hardcoded in source. */
  endpointRef: z.string().min(1).nullable(),
  policyRef: z.string().min(1),
  enabled: z.boolean(),
});
export type AgentDescriptor = z.infer<typeof AgentDescriptorSchema>;

/** ------------------------------------------------------------- policies */
export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1),
  initialBackoffMs: z.number().int().min(0),
  backoffMultiplier: z.number().min(1),
  retryableOutcomes: z.array(z.enum(["timeout", "unavailable", "transient"])),
});

export const CircuitPolicySchema = z.object({
  failureThreshold: z.number().int().min(1),
  openDurationMs: z.number().int().min(0),
  halfOpenProbes: z.number().int().min(1),
});

export const ExecutionPolicySchema = z.object({
  policyRef: z.string().min(1),
  timeoutMs: z.number().int().min(1),
  retry: RetryPolicySchema,
  circuit: CircuitPolicySchema,
  /** Degraded agents are only used when this is true. */
  allowDegradedRouting: z.boolean(),
});
export type ExecutionPolicy = z.infer<typeof ExecutionPolicySchema>;

export const CorrectionPolicySchema = z.object({
  /** Bounded self-correction budget. */
  maxCorrectionAttempts: z.number().int().min(0),
  /** Risk classes that must pass an approval gate before CHANGE. */
  approvalRequiredFor: z.array(RiskClassSchema),
  /** Risk classes that must roll back instead of auto-correcting. */
  rollbackRequiredFor: z.array(RiskClassSchema),
  allowDestructiveActions: z.boolean(),
});
export type CorrectionPolicy = z.infer<typeof CorrectionPolicySchema>;

/** ------------------------------------------------------- configuration */
export const ConfigProvenanceSchema = z.object({
  source: z.string().min(1),
  publishedAt: z.string().min(1),
  publishedBy: z.string().min(1),
  /** Published documents are immutable; a change requires a new revision. */
  immutable: z.literal(true),
});
export type ConfigProvenance = z.infer<typeof ConfigProvenanceSchema>;

export const ConfigDefaultsSchema = z.object({
  /** Policy used for candidate selection before the agent's own policy applies. */
  selectionPolicyRef: z.string().min(1),
});

export const CredentialPolicySchema = z.object({
  minSecretLength: z.number().int().min(1),
  allowedNamespaces: z.array(z.string().min(1)).min(1),
});
export type CredentialPolicy = z.infer<typeof CredentialPolicySchema>;

/** How much history the console reads back from the persistence store. */
export const PersistencePolicySchema = z.object({
  taskHistoryLimit: z.number().int().min(1),
  auditHistoryLimit: z.number().int().min(1),
});
export type PersistencePolicy = z.infer<typeof PersistencePolicySchema>;


/** Identity/scopes the server API boundary acts with (configuration, not source). */
export const ApiBoundarySchema = z.object({
  operatorActorId: z.string().min(1),
  operatorScopes: z.array(z.string().min(1)).min(1),
});
export type ApiBoundary = z.infer<typeof ApiBoundarySchema>;

/** Mock-transport behaviour is configuration, so no simulated value lives in source. */
export const SimulatedStepSchema = z.object({
  ok: z.boolean(),
  outcome: z.enum(["success", "timeout", "unavailable", "transient", "rejected"]),
  summary: z.string().min(1),
});
export type SimulatedStep = z.infer<typeof SimulatedStepSchema>;

export const SimulationSchema = z.object({
  agents: z.record(
    z.string().min(1),
    z.object({ health: HealthStateSchema, script: z.array(SimulatedStepSchema).min(1) }),
  ),
});

export const KareConfigSchema = z.object({
  configVersion: z.string().regex(/^kare-config\/v\d+$/, "configVersion must be kare-config/vN"),
  revision: z.number().int().min(1),
  provenance: ConfigProvenanceSchema,
  defaults: ConfigDefaultsSchema,
  credentials: CredentialPolicySchema,
  persistence: PersistencePolicySchema,

  apiBoundary: ApiBoundarySchema,
  agents: z.array(AgentDescriptorSchema),
  policies: z.array(ExecutionPolicySchema).min(1),
  correction: CorrectionPolicySchema,
  /** Capability -> ordered preferred agent ids (routing table is configuration). */
  routing: z.record(z.string(), z.array(z.string().min(1)).min(1)),
  simulation: SimulationSchema,
});
export type KareConfig = z.infer<typeof KareConfigSchema>;

/** ---------------------------------------------------------- task intake */
export const TaskRequestSchema = z.object({
  /** Idempotency key supplied by the caller (KNOW Stylist AI, operator UI, CI...). */
  requestId: z.string().min(8),
  capability: CapabilityIdSchema,
  objective: z.string().min(4).max(4000),
  risk: RiskClassSchema,
  actor: z.object({
    actorId: z.string().min(1),
    scopes: z.array(z.string().min(1)),
  }),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type TaskRequest = z.infer<typeof TaskRequestSchema>;

/** ------------------------------------------------------------- evidence */
export const EvidenceSchema = z.object({
  evidenceId: z.string(),
  kind: z.enum(["inspection", "test-run", "diff", "health-probe", "audit"]),
  label: z.string(),
  outcome: z.enum(["pass", "fail", "info"]),
  detail: z.string(),
  producedAt: z.string(),
  /** Where the evidence came from — provenance, not a claim. */
  producedBy: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export interface TimelineEntry {
  at: string;
  state: TaskState;
  note: string;
  attempt: number;
}

export interface TaskRecord {
  taskId: string;
  requestId: string;
  capability: string;
  objective: string;
  risk: RiskClass;
  actorId: string;
  state: TaskState;
  attempt: number;
  correctionsUsed: number;
  correctionBudget: number;
  routedAgentId: string | null;
  policyRef: string | null;
  evidence: Evidence[];
  timeline: TimelineEntry[];
  approval: {
    required: boolean;
    status: "not-required" | "pending" | "approved" | "rejected";
    decidedBy?: string;
  };
  rollback: {
    available: boolean;
    status: "none" | "in-progress" | "completed";
  };
  verdict: "unknown" | "pass" | "fail";
  createdAt: string;
  updatedAt: string;
}