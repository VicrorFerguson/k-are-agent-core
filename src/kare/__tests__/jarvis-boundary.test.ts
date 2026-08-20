import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { doc } from "./fixtures";

function files(dir: string, out: string[] = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

describe("JARVIS boundary + security posture", () => {
  const sources = files("src");

  it("declares JARVIS as an external, mock-only adapter", () => {
    const jarvis = doc().agents.find((a: any) => a.agentId === "jarvis-external");
    expect(jarvis.kind).toBe("external-api");
    expect(jarvis.isMock).toBe(true);
    expect(jarvis.credentialRef).toBeNull();
    expect(jarvis.endpointRef).toMatch(/^endpoint\./); // reference, not a live URL
  });

  it("contains no JARVIS runtime, filesystem access or embedded implementation", () => {
    const adapter = readFileSync("src/kare/adapters/jarvis-mock.ts", "utf8");
    expect(adapter).not.toMatch(/node:fs|child_process|exec\(|spawn\(|eval\(/);
    expect(adapter).toMatch(/MOCK/);
  });

  it("has no fabricated production endpoint or credential anywhere in source or config", () => {
    const config = readFileSync("config/kare.config.json", "utf8");
    expect(config).not.toMatch(/https?:\/\//);
    expect(config).not.toMatch(/sk-|Bearer |api[_-]?key"\s*:\s*"[^"]+/i);
    for (const f of sources) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/jarvis\.(?:io|com|net|ai)|api\.jarvis/i);
    }
  });

  it("performs no arbitrary code, shell or filesystem execution in runtime source", () => {
    const runtimeFiles = files("src/kare").concat(["src/lib/kare.functions.ts"]);
    for (const f of runtimeFiles) {
      if (f.includes("__tests__")) continue;
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/child_process|\bnew Function\(|\beval\(|writeFileSync|process\.exit/);
    }
  });

  it("exposes no secret material through the API boundary", () => {
    const api = readFileSync("src/lib/kare.functions.ts", "utf8");
    expect(api).not.toMatch(/SecretManager|credentialGateway|\.secret\b|credentials\./);
  });
});
