import configDocument from "../../config/kare.config.json" with { type: "json" };
import { InMemoryAuditSink } from "./audit";
import { MockExternalAgentAdapter, SimulatedTransport } from "./adapters/jarvis-mock";
import { StaticConfigProvider, resolveConfig, type ConfigProvider } from "./config";
import {
  CredentialGateway,
  EphemeralSecretManager,
  type CredentialValidator,
} from "./credentials";
import { KareError } from "./errors";
import { AgentGateway } from "./gateway";
import { Orchestrator } from "./orchestrator";

/**
 * MVP validator. No provider integrations are configured, so it validates only
 * shape (against a configured threshold) and explicitly reports that no live
 * provider check was performed.
 */
const shapeOnlyValidator: CredentialValidator = {
  async validate({ secret, minSecretLength }) {
    if (secret.trim().length < minSecretLength) {
      return { ok: false, reason: "secret shorter than the configured minimum" };
    }
    return { ok: true, reason: "shape-only validation (no live provider check configured)" };
  },
};

export interface KareRuntime {
  resolved: ReturnType<typeof resolveConfig>;
  audit: InMemoryAuditSink;
  gateway: AgentGateway;
  orchestrator: Orchestrator;
  credentials: CredentialGateway;
}

/**
 * BOOTSTRAP: the only source-level knowledge is *where* the configuration
 * document comes from. All behaviour is read back out of the document through
 * the configuration authority, which fails closed when it is absent or invalid.
 */
export function defaultConfigProvider(): ConfigProvider {
  return new StaticConfigProvider(
    configDocument,
    "config/kare.config.json (revision-tracked, immutable once published)",
  );
}

export function createRuntime(provider: ConfigProvider = defaultConfigProvider()): KareRuntime {
  const audit = new InMemoryAuditSink();
  const resolved = resolveConfig(provider);
  const gateway = new AgentGateway(resolved, audit);

  for (const agent of resolved.config.agents) {
    if (agent.endpointRef === null) {
      throw new KareError(
        "config_missing",
        `Agent "${agent.agentId}" has no endpointRef; refusing to guess one.`,
        { agentId: agent.agentId },
      );
    }
    const sim = resolved.simulationFor(agent.agentId, "runtime.bootstrap");
    gateway.register(
      new MockExternalAgentAdapter(
        agent.agentId,
        agent.endpointRef,
        agent.credentialRef,
        new SimulatedTransport(sim.script),
        () => sim.health,
      ),
    );
  }

  const credentials = new CredentialGateway(
    new EphemeralSecretManager(),
    audit,
    shapeOnlyValidator,
    () => resolved.credentialPolicy("credential-gateway"),
  );

  return {
    resolved,
    audit,
    gateway,
    orchestrator: new Orchestrator(resolved, gateway, audit),
    credentials,
  };
}

let singleton: KareRuntime | null = null;

export function getRuntime(): KareRuntime {
  if (!singleton) singleton = createRuntime();
  return singleton;
}
