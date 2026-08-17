import { KareConfigSchema, type ExecutionPolicy, type KareConfig } from "./domain";
import { KareError } from "./errors";
import { assertDoesNotOverrideInvariants } from "./invariants";

/**
 * Configuration/policy abstraction.
 *
 * K-ARE reads ALL mutable operational behaviour from a versioned configuration
 * document supplied by a provider. There is no source-level default: a missing
 * or invalid document fails closed (PROTECTED_INVARIANTS.FAIL_CLOSED_ON_MISSING_CONFIG).
 */
export interface ConfigProvider {
  /** Returns the raw, unvalidated configuration document, or null when absent. */
  load(): unknown | null;
  /** Human-readable provenance of the document (file, env, db revision...). */
  readonly source: string;
}

export class StaticConfigProvider implements ConfigProvider {
  constructor(
    private readonly document: unknown | null,
    public readonly source: string,
  ) {}
  load() {
    return this.document;
  }
}

export interface ResolvedConfig {
  config: KareConfig;
  source: string;
  policyFor(policyRef: string): ExecutionPolicy;
  agentsForCapability(capability: string): string[];
}

export function resolveConfig(provider: ConfigProvider): ResolvedConfig {
  const raw = provider.load();
  if (raw === null || raw === undefined) {
    throw new KareError(
      "config_missing",
      `No K-ARE configuration available from "${provider.source}". Failing closed.`,
      { source: provider.source },
    );
  }

  const parsed = KareConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new KareError("config_invalid", "K-ARE configuration failed schema validation.", {
      source: provider.source,
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }

  const config = parsed.data;

  // Configuration may never shadow a protected architectural invariant.
  assertDoesNotOverrideInvariants(Object.keys(raw as Record<string, unknown>));

  const policies = new Map(config.policies.map((p) => [p.policyRef, p]));

  return {
    config,
    source: provider.source,
    policyFor(policyRef) {
      const policy = policies.get(policyRef);
      if (!policy) {
        throw new KareError("config_missing", `Execution policy "${policyRef}" is not defined.`, {
          policyRef,
        });
      }
      return policy;
    },
    agentsForCapability(capability) {
      const route = config.routing[capability];
      if (!route || route.length === 0) {
        throw new KareError("capability_unknown", `No route configured for "${capability}".`, {
          capability,
        });
      }
      return route;
    },
  };
}