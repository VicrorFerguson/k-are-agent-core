import {
  KareConfigSchema,
  type ConfigProvenance,
  type CorrectionPolicy,
  type CredentialPolicy,
  type ExecutionPolicy,
  type KareConfig,
  type SimulatedStep,
  type HealthState,
} from "./domain";
import { KareError } from "./errors";
import { assertDoesNotOverrideInvariants } from "./invariants";

/**
 * BOOTSTRAP REQUIREMENT (not operational behaviour):
 * the only thing source is allowed to know is which configuration schema
 * versions this build can interpret. Everything else comes from the document.
 */
export const SUPPORTED_CONFIG_VERSIONS = ["kare-config/v1"] as const;

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

/** One record per runtime consumption of configuration — provenance, not a claim. */
export interface ConfigConsumption {
  at: string;
  configVersion: string;
  revision: number;
  source: string;
  key: string;
  policyRef: string | null;
  ref: string | null;
}

export interface ResolvedConfig {
  config: KareConfig;
  source: string;
  provenance: ConfigProvenance & { configVersion: string; revision: number };
  policyFor(policyRef: string, ref?: string): ExecutionPolicy;
  selectionPolicy(ref?: string): ExecutionPolicy;
  agentsForCapability(capability: string, ref?: string): string[];
  credentialPolicy(ref?: string): CredentialPolicy;
  correctionPolicy(ref?: string): CorrectionPolicy;
  simulationFor(agentId: string, ref?: string): { health: HealthState; script: SimulatedStep[] };
  consumptions(): ConfigConsumption[];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
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
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new KareError("config_invalid", "K-ARE configuration must be an object document.", {
      source: provider.source,
    });
  }

  // Configuration may never shadow a protected architectural invariant.
  assertDoesNotOverrideInvariants(Object.keys(raw as Record<string, unknown>));

  const parsed = KareConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new KareError("config_invalid", "K-ARE configuration failed schema validation.", {
      source: provider.source,
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }

  const config = deepFreeze(parsed.data);

  if (!(SUPPORTED_CONFIG_VERSIONS as readonly string[]).includes(config.configVersion)) {
    throw new KareError("config_invalid", `Unsupported configVersion "${config.configVersion}".`, {
      supported: [...SUPPORTED_CONFIG_VERSIONS],
    });
  }

  // Referential integrity: routing/agents/policies must resolve, or fail closed.
  const policies = new Map(config.policies.map((p) => [p.policyRef, p]));
  const agentIds = new Set(config.agents.map((a) => a.agentId));
  for (const agent of config.agents) {
    if (!policies.has(agent.policyRef)) {
      throw new KareError("config_invalid", `Agent "${agent.agentId}" references unknown policy.`, {
        policyRef: agent.policyRef,
      });
    }
  }
  for (const [capability, route] of Object.entries(config.routing)) {
    for (const agentId of route) {
      if (!agentIds.has(agentId)) {
        throw new KareError("config_invalid", `Route "${capability}" references unknown agent.`, {
          agentId,
        });
      }
    }
  }
  if (!policies.has(config.defaults.selectionPolicyRef)) {
    throw new KareError("config_invalid", "defaults.selectionPolicyRef is not a defined policy.", {
      policyRef: config.defaults.selectionPolicyRef,
    });
  }

  const consumptions: ConfigConsumption[] = [];
  const record = (key: string, policyRef: string | null, ref?: string) => {
    consumptions.push({
      at: new Date().toISOString(),
      configVersion: config.configVersion,
      revision: config.revision,
      source: provider.source,
      key,
      policyRef,
      ref: ref ?? null,
    });
  };

  return {
    config,
    source: provider.source,
    provenance: {
      ...config.provenance,
      configVersion: config.configVersion,
      revision: config.revision,
    },
    policyFor(policyRef, ref) {
      const policy = policies.get(policyRef);
      if (!policy) {
        throw new KareError("config_missing", `Execution policy "${policyRef}" is not defined.`, {
          policyRef,
        });
      }
      record("policy", policyRef, ref);
      return policy;
    },
    selectionPolicy(ref) {
      return this.policyFor(config.defaults.selectionPolicyRef, ref);
    },
    agentsForCapability(capability, ref) {
      const route = config.routing[capability];
      if (!route || route.length === 0) {
        throw new KareError("capability_unknown", `No route configured for "${capability}".`, {
          capability,
        });
      }
      record(`routing.${capability}`, null, ref);
      return [...route];
    },
    credentialPolicy(ref) {
      record("credentials", null, ref);
      return config.credentials;
    },
    correctionPolicy(ref) {
      record("correction", null, ref);
      return config.correction;
    },
    simulationFor(agentId, ref) {
      const sim = config.simulation.agents[agentId];
      if (!sim) {
        throw new KareError(
          "config_missing",
          `No simulation profile configured for agent "${agentId}". Failing closed.`,
          { agentId },
        );
      }
      record(`simulation.${agentId}`, null, ref);
      return sim;
    },
    consumptions() {
      return [...consumptions];
    },
  };
}
