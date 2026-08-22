import type { AuditEntry } from "./audit";
import type { TaskRecord } from "./domain";

/**
 * Persistence PORT.
 *
 * The K-ARE domain model knows nothing about any specific database. It only
 * knows this write-through/read-back contract. Adapters live in
 * `src/kare/adapters/*` and are server-only.
 *
 * Nothing in this contract carries secret material: credentials are represented
 * by references (`credentialRef`) exactly as in the versioned configuration.
 */
export interface ConfigVersionRef {
  configVersion: string;
  revision: number;
  source: string;
  publishedAt: string | null;
  publishedBy: string | null;
}

export interface AgentRegistrationRecord {
  agentId: string;
  displayName: string;
  kind: string;
  isMock: boolean;
  capabilities: string[];
  requiredScopes: string[];
  /** Reference only — never a secret value. */
  credentialRef: string | null;
  endpointRef: string | null;
  policyRef: string;
  enabled: boolean;
  configVersion: string;
  configRevision: number;
}

export interface HealthObservationRecord {
  agentId: string;
  health: string;
  observedAt: string;
}

export interface TaskSnapshot {
  task: TaskRecord;
  config: ConfigVersionRef;
}

export interface KareStore {
  /** Adapter identity for provenance/audit ("none", "supabase", ...). */
  readonly kind: string;
  /** False when no persistence backend is configured. Never assumed true. */
  readonly configured: boolean;
  persistConfigVersion(ref: ConfigVersionRef): Promise<void>;
  persistAgents(agents: AgentRegistrationRecord[]): Promise<void>;
  persistHealth(observations: HealthObservationRecord[]): Promise<void>;
  persistTask(snapshot: TaskSnapshot): Promise<void>;
  persistAudit(entries: AuditEntry[]): Promise<void>;
  loadTasks(limit: number): Promise<TaskRecord[]>;
  loadAudit(limit: number): Promise<AuditEntry[]>;
}

export type PersistenceStatus = "not-configured" | "persisted" | "failed";

export interface PersistenceState {
  status: PersistenceStatus;
  store: string;
  at: string | null;
  detail: string | null;
}

/**
 * Default store when no persistence backend is configured. It never pretends a
 * write happened: every task it touches is reported as "not-configured".
 */
export class UnconfiguredStore implements KareStore {
  readonly kind = "none";
  readonly configured = false;
  async persistConfigVersion(): Promise<void> {}
  async persistAgents(): Promise<void> {}
  async persistHealth(): Promise<void> {}
  async persistTask(): Promise<void> {}
  async persistAudit(): Promise<void> {}
  async loadTasks(): Promise<TaskRecord[]> {
    return [];
  }
  async loadAudit(): Promise<AuditEntry[]> {
    return [];
  }
}
