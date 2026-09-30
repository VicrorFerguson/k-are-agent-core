import { describe, expect, it } from "vitest";
import { KAREToolGate } from "../tool-gate";
import { WorkspaceExecutor } from "../workspace-executor";
import { TEST_002A_POLICY, type ToolAction } from "../tool-gate-types";

const executor = new WorkspaceExecutor({ workspaceRoot: process.cwd() });
const gate = new KAREToolGate(TEST_002A_POLICY, executor);

// Test-scoped identity: generated per call, never a production identifier.
let seq = 0;
function testContext() {
  seq += 1;
  return {
    servicePrincipalId: `test-sp-${seq}`,
    actorId: `test-actor-${seq}`,
    actorRole: "TEST",
  };
}

function req(action: ToolAction, targetPath?: string, command?: string) {
  seq += 1;
  return {
    requestId: `test-002a3-${seq}`,
    timestamp: Date.now(),
    action,
    reasoning: "automated coverage for TEST 002A.3",
    ...(targetPath === undefined ? {} : { targetPath }),
    ...(command === undefined ? {} : { command }),
  };
}

describe("K-ARE TEST 002A.3 — tool gate boundary (automated)", () => {
  it("1. permits a legitimate FS_READ", async () => {
    const res = await gate.processRequest(req("FS_READ", "src/kare/config.ts"), testContext());
    expect(res.status).toBe("TOOL_COMPLETED");
  });

  it("2. permits a legitimate FS_EXISTS", async () => {
    const res = await gate.processRequest(req("FS_EXISTS", "package.json"), testContext());
    expect(res.status).toBe("TOOL_COMPLETED");
  });

  it("3. denies traversal escape (../../)", async () => {
    const res = await gate.processRequest(req("FS_READ", "../../etc/passwd"), testContext());
    expect(res.status).toBe("TOOL_DENIED");
  });

  it("4. denies absolute path escape", async () => {
    const res = await gate.processRequest(req("FS_READ", "/etc/passwd"), testContext());
    expect(res.status).toBe("TOOL_DENIED");
  });

  it("5. denies protected path (.env)", async () => {
    const res = await gate.processRequest(req("FS_READ", ".env"), testContext());
    expect(res.status).toBe("TOOL_DENIED");
  });

  it("6. denies protected path (supabase/config.toml)", async () => {
    const res = await gate.processRequest(req("FS_READ", "supabase/config.toml"), testContext());
    expect(res.status).toBe("TOOL_DENIED");
  });

  it("7. denies protected path (src/kare/gateway.ts)", async () => {
    const res = await gate.processRequest(req("FS_READ", "src/kare/gateway.ts"), testContext());
    expect(res.status).toBe("TOOL_DENIED");
  });

  it("8. denies a normalized path resolving into a protected path", async () => {
    const res = await gate.processRequest(
      req("FS_READ", "./src/kare/../kare/gateway.ts"),
      testContext(),
    );
    expect(res.status).toBe("TOOL_DENIED");
    expect(res.errorMessage).toMatch(/protected path/i);
  });

  it("9. does NOT treat 'src/kare/config.ts.backup' as protected (prefix variant)", async () => {
    const res = await gate.processRequest(
      req("FS_EXISTS", "src/kare/config.ts.backup"),
      testContext(),
    );
    expect(res.status).not.toBe("TOOL_DENIED");
  });

  it("10. does NOT treat 'src/kare/not-gateway.ts' as protected (name collision)", async () => {
    const res = await gate.processRequest(
      req("FS_EXISTS", "src/kare/not-gateway.ts"),
      testContext(),
    );
    expect(res.status).not.toBe("TOOL_DENIED");
  });

  it("11. denies an unauthorized action (SANDBOX_EDIT)", async () => {
    const res = await gate.processRequest(
      req("SANDBOX_EDIT", "src/kare/config.ts"),
      testContext(),
    );
    expect(res.status).toBe("TOOL_DENIED");
  });

  it("12. reports FS_LIST as TOOL_UNAVAILABLE", async () => {
    const res = await gate.processRequest(req("FS_LIST", "src"), testContext());
    expect(res.status).toBe("TOOL_UNAVAILABLE");
  });

  it("13. reports SHELL_INSPECT as TOOL_UNAVAILABLE", async () => {
    const res = await gate.processRequest(
      req("SHELL_INSPECT", undefined, "ls -la"),
      testContext(),
    );
    expect(res.status).toBe("TOOL_UNAVAILABLE");
  });
});