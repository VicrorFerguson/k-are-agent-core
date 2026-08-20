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

/** Both configured agents pass inspection then fail every test run. */
export function testFailsEverywhere() {
  const d = doc();
  const script = [
    { ok: true, outcome: "success", summary: "inspection ok" },
    { ok: false, outcome: "transient", summary: "test failed" },
  ];
  for (const id of Object.keys(d.simulation.agents)) {
    d.simulation.agents[id] = { health: "healthy", script: structuredClone(script) };
  }
  return d;
}
