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
    requestId: `test-002a2-${seq}`,
    timestamp: Date.now(),
    action,
    reasoning: "automated coverage for TEST 002A.2",
    ...(targetPath === undefined ? {} : { targetPath }),
    ...(command === undefined ? {} : { command }),
  };
}

describe("K-ARE TEST 002A.2 — tool gate boundary (automated)", () => {
  it("1. permits a legitimate FS_READ", async () => {
    const res = await gate.processRequest(req("FS_READ", "src/kare/config.ts"), testContext());
    expect(res.status).toBe("TOOL_COMPLETED");
    expect(res.exitCode).toBe(0);
    expect(res.stdout.length).toBeGreaterThan(0);
  });

  it("2. permits a legitimate FS_EXISTS on an existing file", async () => {
    const res = await gate.processRequest(req("FS_EXISTS", "package.json"), testContext());
    expect(res.status).toBe("TOOL_COMPLETED");
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("EXISTS");
  });

  it("3. denies traversal escape via ../../", async () => {
    const res = await gate.processRequest(req("FS_READ", "../../etc/passwd"), testContext());
    expect(res.status).toBe("TOOL_DENIED");
    expect(res.errorMessage).toMatch(/traversal|workspace boundary/i);
  });

  it("4. denies absolute path escape", async () => {
    const res = await gate.processRequest(req("FS_READ", "/etc/passwd"), testContext());
    expect(res.status).toBe("TOOL_DENIED");
    expect(res.errorMessage).toMatch(/traversal|workspace boundary/i);
  });

  it("5. denies a protected path (.env)", async () => {
    const res = await gate.processRequest(req("FS_READ", ".env"), testContext());
    expect(res.status).toBe("TOOL_DENIED");
    expect(res.errorMessage).toMatch(/protected path/i);
  });

  it("6. denies a protected path (supabase/config.toml)", async () => {
    const res = await gate.processRequest(req("FS_READ", "supabase/config.toml"), testContext());
    expect(res.status).toBe("TOOL_DENIED");
    expect(res.errorMessage).toMatch(/protected path/i);
  });

  it("7. denies a protected path (src/kare/gateway.ts)", async () => {
    const res = await gate.processRequest(req("FS_READ", "src/kare/gateway.ts"), testContext());
    expect(res.status).toBe("TOOL_DENIED");
    expect(res.errorMessage).toMatch(/protected path/i);
  });

  it("8. denies an unauthorized action (SANDBOX_EDIT)", async () => {
    const res = await gate.processRequest(req("SANDBOX_EDIT", "src/kare/config.ts"), testContext());
    expect(res.status).toBe("TOOL_DENIED");
    expect(res.errorMessage).toMatch(/not authorized/i);
  });

  it("9. reports an unimplemented action as TOOL_UNAVAILABLE (FS_LIST)", async () => {
    const res = await gate.processRequest(req("FS_LIST", "src"), testContext());
    expect(res.status).toBe("TOOL_UNAVAILABLE");
    expect(res.errorMessage).toMatch(/not implemented/i);
  });

  it("10. reports an unimplemented action as TOOL_UNAVAILABLE (SHELL_INSPECT)", async () => {
    const res = await gate.processRequest(req("SHELL_INSPECT", undefined, "ls -la"), testContext());
    expect(res.status).toBe("TOOL_UNAVAILABLE");
    expect(res.errorMessage).toMatch(/not implemented/i);
  });

  it("11. denies a normalized path that resolves into a protected path", async () => {
    const res = await gate.processRequest(
      req("FS_READ", "./src/kare/../kare/gateway.ts"),
      testContext(),
    );
    expect(res.status).toBe("TOOL_DENIED");
    expect(res.errorMessage).toMatch(/protected path/i);
  });
});
