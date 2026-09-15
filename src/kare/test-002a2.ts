import { KAREToolGate } from './tool-gate';
import { TEST_002A_POLICY } from './tool-gate-types';

async function runTestSuite() {
  const gate = new KAREToolGate(TEST_002A_POLICY);
  const results: Record<string, any> = {};

  // Test 1: Legitimate FS_READ
  results['1_valid_fs_read'] = await gate.processRequest({
    requestId: 'req_1',
    timestamp: Date.now(),
    action: 'FS_READ',
    targetPath: 'src/kare/config.ts',
    reasoning: 'Valid read',
  });

  // Test 2: Legitimate FS_EXISTS
  results['2_valid_fs_exists'] = await gate.processRequest({
    requestId: 'req_2',
    timestamp: Date.now(),
    action: 'FS_EXISTS',
    targetPath: 'package.json',
    reasoning: 'Valid exists',
  });

  // Test 3: Traversal Attack (../../)
  results['3_traversal_attack'] = await gate.processRequest({
    requestId: 'req_3',
    timestamp: Date.now(),
    action: 'FS_READ',
    targetPath: '../../etc/passwd',
    reasoning: 'Traversal escape test',
  });

  // Test 4: Absolute Path Escape
  results['4_absolute_escape'] = await gate.processRequest({
    requestId: 'req_4',
    timestamp: Date.now(),
    action: 'FS_READ',
    targetPath: '/etc/passwd',
    reasoning: 'Absolute path test',
  });

  // Test 5: Protected Path (.env)
  results['5_protected_env'] = await gate.processRequest({
    requestId: 'req_5',
    timestamp: Date.now(),
    action: 'FS_READ',
    targetPath: '.env',
    reasoning: 'Protected env test',
  });

  // Test 6: Protected Path (supabase/config.toml)
  results['6_protected_supabase'] = await gate.processRequest({
    requestId: 'req_6',
    timestamp: Date.now(),
    action: 'FS_READ',
    targetPath: 'supabase/config.toml',
    reasoning: 'Protected supabase test',
  });

  // Test 7: Protected Path (src/kare/gateway.ts)
  results['7_protected_gateway'] = await gate.processRequest({
    requestId: 'req_7',
    timestamp: Date.now(),
    action: 'FS_READ',
    targetPath: 'src/kare/gateway.ts',
    reasoning: 'Protected gateway test',
  });

  // Test 8: SANDBOX_EDIT (Unauthorized Action)
  results['8_unauthorized_edit'] = await gate.processRequest({
    requestId: 'req_8',
    timestamp: Date.now(),
    action: 'SANDBOX_EDIT' as any,
    targetPath: 'src/kare/config.ts',
    content: '// test edit',
    reasoning: 'Unauthorized write test',
  });

  // Test 9: FS_LIST (Unimplemented Action)
  results['9_unimplemented_list'] = await gate.processRequest({
    requestId: 'req_9',
    timestamp: Date.now(),
    action: 'FS_LIST',
    targetPath: 'src',
    reasoning: 'FS_LIST test',
  });

  // Test 10: SHELL_INSPECT (Unimplemented Action)
  results['10_unimplemented_shell'] = await gate.processRequest({
    requestId: 'req_10',
    timestamp: Date.now(),
    action: 'SHELL_INSPECT',
    command: 'ls -la',
    reasoning: 'SHELL_INSPECT test',
  });

  // Test 11: Relative Protected Variant Path (./src/kare/../kare/gateway.ts)
  results['11_normalized_protected'] = await gate.processRequest({
    requestId: 'req_11',
    timestamp: Date.now(),
    action: 'FS_READ',
    targetPath: './src/kare/../kare/gateway.ts',
    reasoning: 'Normalized path traversal bypass attempt',
  });

  console.log(JSON.stringify(results, null, 2));
}

runTestSuite();
