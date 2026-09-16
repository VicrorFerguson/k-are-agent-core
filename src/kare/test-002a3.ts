import { KAREToolGate } from './tool-gate';
import { WorkspaceExecutor } from './workspace-executor';
import { TEST_002A_POLICY } from './tool-gate-types';

async function runTestSuite() {
  const executor = new WorkspaceExecutor({ workspaceRoot: process.cwd() });
  const gate = new KAREToolGate(TEST_002A_POLICY, executor);
  const context = {
    servicePrincipalId: 'sp_kare_001',
    actorId: 'operator.console',
    actorRole: 'OPERATOR',
  };

  const testCases = [
    { name: '1. Legitimate FS_READ', req: { action: 'FS_READ', targetPath: 'src/kare/config.ts' } },
    { name: '2. Legitimate FS_EXISTS', req: { action: 'FS_EXISTS', targetPath: 'package.json' } },
    { name: '3. Traversal Escape (../../)', req: { action: 'FS_READ', targetPath: '../../etc/passwd' } },
    { name: '4. Absolute Path Escape', req: { action: 'FS_READ', targetPath: '/etc/passwd' } },
    { name: '5. Protected Path (.env)', req: { action: 'FS_READ', targetPath: '.env' } },
    { name: '6. Protected Path (supabase/config.toml)', req: { action: 'FS_READ', targetPath: 'supabase/config.toml' } },
    { name: '7. Protected Path (src/kare/gateway.ts)', req: { action: 'FS_READ', targetPath: 'src/kare/gateway.ts' } },
    { name: '8. Path Normalization (./src/kare/../kare/gateway.ts)', req: { action: 'FS_READ', targetPath: './src/kare/../kare/gateway.ts' } },
    { name: '9. Non-protected Prefix Variant (src/kare/config.ts.backup)', req: { action: 'FS_EXISTS', targetPath: 'src/kare/config.ts.backup' } },
    { name: '10. Non-protected Name Collision (src/kare/not-gateway.ts)', req: { action: 'FS_EXISTS', targetPath: 'src/kare/not-gateway.ts' } },
    { name: '11. Disabled Write (SANDBOX_EDIT)', req: { action: 'SANDBOX_EDIT', targetPath: 'src/kare/config.ts' } },
    { name: '12. Unimplemented (FS_LIST)', req: { action: 'FS_LIST', targetPath: 'src' } },
    { name: '13. Unimplemented (SHELL_INSPECT)', req: { action: 'SHELL_INSPECT', command: 'ls -la' } },
  ];

  console.log('=== K-ARE TEST 002A.3 SUITE EXECUTION ===\n');

  for (const tc of testCases) {
    const payload = {
      requestId: `req_${Math.random().toString(36).substring(7)}`,
      timestamp: Date.now(),
      action: tc.req.action as any,
      reasoning: 'Test execution for 002A.3 compliance.',
      ...(tc.req.targetPath === undefined ? {} : { targetPath: tc.req.targetPath }),
      ...(tc.req.command === undefined ? {} : { command: tc.req.command }),
    };

    const res = await gate.processRequest(payload, context);
    console.log(`[${tc.name}]`);
    console.log(`Status: ${res.status} | ExitCode: ${res.exitCode}`);
    if (res.errorMessage) console.log(`Error: ${res.errorMessage}`);
    if (res.stdout && tc.req.action === 'FS_READ') {
      console.log(`Stdout: ${res.stdout.substring(0, 80).replace(/\n/g, ' ')}...`);
    } else if (res.stdout) {
      console.log(`Stdout: ${res.stdout}`);
    }
    console.log('--------------------------------------------------');
  }
}

runTestSuite();
