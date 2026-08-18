import { z } from "zod";
import type { AuditSink } from "./audit";
import type { CredentialPolicy } from "./domain";
import { KareError } from "./errors";

/**
 * CREDENTIAL GATEWAY (MVP).
 *
 * The application NEVER stores raw secret values: it stores a reference plus
 * metadata. The raw value is handed to a SecretManager abstraction. In this MVP
 * no external secret manager is configured, so the default manager is an
 * explicitly-labelled ephemeral in-process manager that discards values on
 * restart. This is NOT a production secret manager and never claims to be.
 */
export const CredentialRequestSchema = z.object({
  provider: z.string().min(2).max(64),
  label: z.string().min(2).max(120),
  /** Namespace/workspace the credential is scoped to. */
  namespace: z.string().min(2).max(64),
  secret: z.string().min(8).max(8192),
  actorId: z.string().min(1),
});
export type CredentialRequest = z.infer<typeof CredentialRequestSchema>;

export interface CredentialRecord {
  credentialRef: string;
  provider: string;
  label: string;
  namespace: string;
  /** Non-reversible fingerprint for operator recognition. Not the secret. */
  fingerprint: string;
  managerKind: string;
  managerIsEphemeral: boolean;
  createdBy: string;
  createdAt: string;
  health: "unknown" | "healthy" | "invalid" | "unreachable";
  lastCheckedAt: string | null;
}

export interface SecretManager {
  readonly kind: string;
  /** True when this manager does not durably/securely persist values. */
  readonly isEphemeral: boolean;
  put(namespace: string, ref: string, secret: string): Promise<void>;
  has(namespace: string, ref: string): Promise<boolean>;
}

/** MVP default. Labelled as ephemeral so no caller can mistake it for a vault. */
export class EphemeralSecretManager implements SecretManager {
  readonly kind = "ephemeral-in-process (MVP, not a secret vault)";
  readonly isEphemeral = true;
  private store = new Map<string, string>();
  async put(namespace: string, ref: string, secret: string) {
    this.store.set(`${namespace}/${ref}`, secret);
  }
  async has(namespace: string, ref: string) {
    return this.store.has(`${namespace}/${ref}`);
  }
}

/** Provider-agnostic validation + health check hook (configuration-driven). */
export interface CredentialValidator {
  validate(input: {
    provider: string;
    secret: string;
    /** Threshold supplied by configuration; never a source constant. */
    minSecretLength: number;
  }): Promise<{ ok: boolean; reason?: string }>;
}

export function fingerprint(secret: string): string {
  let hash = 2166136261;
  for (let i = 0; i < secret.length; i++) {
    hash ^= secret.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fp_${(hash >>> 0).toString(16)}·${secret.length}`;
}

export class CredentialGateway {
  private records = new Map<string, CredentialRecord>();
  private seq = 0;

  constructor(
    private readonly manager: SecretManager,
    private readonly audit: AuditSink,
    private readonly validator: CredentialValidator,
    /** Credential policy comes from the versioned configuration authority. */
    private readonly policy: () => CredentialPolicy,
  ) {}

  async connect(input: unknown): Promise<CredentialRecord> {
    const parsed = CredentialRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new KareError("invalid_input", "Credential request failed validation.", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const req = parsed.data;

    const policy = this.policy();
    if (!policy.allowedNamespaces.includes(req.namespace)) {
      this.audit.record({
        actorId: req.actorId,
        action: "credential.connect",
        subject: req.namespace,
        outcome: "denied",
        metadata: { provider: req.provider, reason: "namespace not allowed by policy" },
      });
      throw new KareError("unauthorized", `Namespace "${req.namespace}" is not allowed.`, {
        allowedNamespaces: policy.allowedNamespaces,
      });
    }

    const validation = await this.validator.validate({
      provider: req.provider,
      secret: req.secret,
      minSecretLength: policy.minSecretLength,
    });
    if (!validation.ok) {
      this.audit.record({
        actorId: req.actorId,
        action: "credential.connect",
        subject: req.provider,
        outcome: "denied",
        metadata: { provider: req.provider, reason: validation.reason ?? "validation failed" },
      });
      throw new KareError("credential_unavailable", "Credential failed validation.", {
        reason: validation.reason ?? null,
      });
    }

    const credentialRef = `cred_${req.namespace}_${req.provider}_${++this.seq}`;
    await this.manager.put(req.namespace, credentialRef, req.secret);

    const record: CredentialRecord = {
      credentialRef,
      provider: req.provider,
      label: req.label,
      namespace: req.namespace,
      fingerprint: fingerprint(req.secret),
      managerKind: this.manager.kind,
      managerIsEphemeral: this.manager.isEphemeral,
      createdBy: req.actorId,
      createdAt: new Date().toISOString(),
      health: validation.ok ? "healthy" : "invalid",
      lastCheckedAt: new Date().toISOString(),
    };
    this.records.set(credentialRef, record);

    this.audit.record({
      actorId: req.actorId,
      action: "credential.connect",
      subject: credentialRef,
      outcome: "recorded",
      metadata: {
        provider: req.provider,
        namespace: req.namespace,
        credentialRef,
        fingerprint: record.fingerprint,
        managerKind: this.manager.kind,
        managerIsEphemeral: this.manager.isEphemeral,
        validated: validation.ok,
        reason: validation.reason ?? null,
      },
    });

    return record;
  }

  list(): CredentialRecord[] {
    return [...this.records.values()];
  }

  get(ref: string): CredentialRecord | undefined {
    return this.records.get(ref);
  }

  async isUsable(ref: string): Promise<boolean> {
    const record = this.records.get(ref);
    if (!record) return false;
    return record.health === "healthy" && (await this.manager.has(record.namespace, ref));
  }
}