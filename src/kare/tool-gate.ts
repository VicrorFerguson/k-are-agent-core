import {
  ToolRequestPayload,
  ToolResultPayload,
  ToolGatePolicy,
  TEST_002A_POLICY,
} from './tool-gate-types';

export class KAREToolGate {
  private policy: ToolGatePolicy;

  constructor(policy: ToolGatePolicy = TEST_002A_POLICY) {
    this.policy = policy;
  }

  public async processRequest(
    request: ToolRequestPayload
  ): Promise<ToolResultPayload> {
    const timestamp = Date.now();

    // 1. Policy check: Is action allowed?
    if (!this.policy.allowedActions.includes(request.action)) {
      return {
        requestId: request.requestId,
        timestamp,
        status: 'TOOL_DENIED',
        exitCode: 1,
        stdout: '',
        stderr: '',
        errorMessage: `K-ARE Policy Denial: Action '${request.action}' not authorized.`,
      };
    }

    // 2. Policy check: Is path protected?
    if (
      request.targetPath &&
      this.policy.protectedPaths.some((p) => request.targetPath?.includes(p))
    ) {
      return {
        requestId: request.requestId,
        timestamp,
        status: 'TOOL_DENIED',
        exitCode: 1,
        stdout: '',
        stderr: '',
        errorMessage: `K-ARE Policy Denial: Access to '${request.targetPath}' is protected.`,
      };
    }

    // 3. Execution stub (Ready for WebContainer bridge attachment)
    return {
      requestId: request.requestId,
      timestamp: Date.now(),
      status: 'TOOL_COMPLETED',
      exitCode: 0,
      stdout: `[VERIFIED K-ARE EXECUTION] Executed ${request.action} on ${request.targetPath || 'target'}`,
      stderr: '',
    };
  }
}
