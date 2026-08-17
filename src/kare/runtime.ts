import configDocument from "../../config/kare.config.json";
import { InMemoryAuditSink } from "./audit";
import { MockExternalAgentAdapter, SimulatedTransport } from "./adapters/jarvis-mock";
import { StaticConfigProvider, resolveConfig } from "./config";
import {
  CredentialGateway,
  EphemeralSecretManager,
  type CredentialValidator,
} from "./credentials";
import { AgentGateway } from "./gateway";
import { Orchestrator } from "./orchestrator";

/**
 * MVP validator. No provider integrations are configured, so it validates only
 * shape and explicitly reports that no live provider check was performed.
 */
const shapeOnlyValidator: CredentialValidator = {
  async validate({ secret }) {
    if (secret.trim().length < 8) return { ok: false, reason: "secret too short" };
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

export function createRuntime(document: unknown = configDocument): KareRuntime {
  const audit = new InMemoryAuditSink();
  const resolved = resolveConfig(
    new StaticConfigProvider(document, "config/kare.config.json (revision-tracked)"),
  );
  const gateway = new AgentGateway(resolved, audit);

  for (const agent of resolved.config.agents) {
    gateway.register(
      new MockExternalAgentAdapter(
        agent.agentId,
        agent.endpointRef ?? "endpoint.local",
        agent.credentialRef,
        new SimulatedTransport(),
      ),
    );
  }

  const credentials = new CredentialGateway(
    new EphemeralSecretManager(),
    audit,
    shapeOnlyValidator,
  );

  return { resolved, audit, gateway, orchestrator: new Orchestrator(resolved, gateway, audit), credentials };
}

let singleton: KareRuntime | null = null;

export function getRuntime(): KareRuntime {
  if (!singleton) singleton = createRuntime();
  return singleton;
}