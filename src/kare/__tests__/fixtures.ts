import baseDocument from "../../../config/kare.config.json" with { type: "json" };
import { StaticConfigProvider } from "../config";
import type { SimulatedStep } from "../domain";

export function doc(): any {
  return structuredClone(baseDocument);
}

export function provider(document: unknown, source = "test-fixture") {
  return new StaticConfigProvider(document, source);
}

export function withScript(agentId: string, script: SimulatedStep[], health = "healthy") {
  const d = doc();
  d.simulation.agents[agentId] = { health, script };
  return d;
}

export const OPERATOR = { actorId: "test-operator", scopes: ["kare:execute", "kare:approve"] };
export const rid = (n: string) => `req-${n}-${"0".repeat(8)}`;

/** Preferred agent passes inspection then fails; every fallback agent fails too. */
export function testFailsEverywhere() {
  const d = doc();
  for (const id of Object.keys(d.simulation.agents)) {
    d.simulation.agents[id] = {
      health: "healthy",
      script: [{ ok: false, outcome: "transient", summary: "test failed" }],
    };
  }
  d.simulation.agents["kare-analyzer"] = {
    health: "healthy",
    script: [
      { ok: true, outcome: "success", summary: "inspection ok" },
      { ok: false, outcome: "transient", summary: "test failed" },
    ],
  };
  return d;
}
