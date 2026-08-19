import { describe, expect, it } from "vitest";
import { runAudit, writeArtifacts } from "../../../scripts/zero-hardcoding-audit";
import { PROTECTED_INVARIANT_KEYS, assertDoesNotOverrideInvariants } from "../invariants";

describe("KF-ARCH-INVARIANT-001 zero-hardcoding", () => {
  it("audits the source scope with no VIOLATION findings", () => {
    const result = runAudit(["src/kare", "src/lib", "src/routes", "scripts"]);
    writeArtifacts(result);
    const violations = result.findings.filter((f) => f.classification === "VIOLATION");
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    expect(result.status).toBe("PASS");
    expect(result.filesScanned).toBeGreaterThan(5);
  });

  it("classifies every finding into exactly one bucket", () => {
    const result = runAudit(["src/kare"]);
    for (const f of result.findings) {
      expect([
        "PROTECTED_INVARIANT",
        "BOOTSTRAP_REQUIREMENT",
        "MUTABLE_CONFIGURATION",
        "BUSINESS_POLICY",
        "VIOLATION",
      ]).toContain(f.classification);
    }
  });

  it("protected invariants cannot be shadowed by configuration keys", () => {
    for (const key of PROTECTED_INVARIANT_KEYS) {
      expect(() => assertDoesNotOverrideInvariants([key])).toThrowError(/protected/);
    }
    expect(() => assertDoesNotOverrideInvariants(["routing", "policies"])).not.toThrow();
  });
});
