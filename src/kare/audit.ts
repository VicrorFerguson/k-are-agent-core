export interface AuditEntry {
  auditId: string;
  at: string;
  actorId: string;
  action: string;
  subject: string;
  outcome: "allowed" | "denied" | "recorded";
  /** Provenance metadata only. Never secret material. */
  metadata: Record<string, string | number | boolean | null>;
}

const SECRET_LIKE_KEYS = /(secret|token|password|apikey|api_key|key|authorization|bearer)/i;

/** Defence in depth: strip anything that looks like secret material before recording. */
export function redactMetadata(
  metadata: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SECRET_LIKE_KEYS.test(key) && !/ref$/i.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (value === null) out[key] = null;
    else if (["string", "number", "boolean"].includes(typeof value))
      out[key] = value as string | number | boolean;
    else out[key] = JSON.stringify(value).slice(0, 512);
  }
  return out;
}

export interface AuditSink {
  record(entry: Omit<AuditEntry, "auditId" | "at">): AuditEntry;
  list(): AuditEntry[];
}

export class InMemoryAuditSink implements AuditSink {
  private entries: AuditEntry[] = [];
  private seq = 0;

  record(entry: Omit<AuditEntry, "auditId" | "at">): AuditEntry {
    const full: AuditEntry = {
      ...entry,
      metadata: redactMetadata(entry.metadata),
      auditId: `aud_${(++this.seq).toString().padStart(5, "0")}`,
      at: new Date().toISOString(),
    };
    this.entries.push(full);
    return full;
  }

  list(): AuditEntry[] {
    return [...this.entries].reverse();
  }
}