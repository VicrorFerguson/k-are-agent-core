import * as fs from 'node:fs/promises';
import * as path from 'node:path';
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

    // 2. Policy check: Evaluate forbidden commands if command is supplied
    if (request.command) {
      const isForbidden = this.policy.forbiddenCommands.some((forbidden) =>
        request.command?.includes(forbidden)
      );
      if (isForbidden) {
        return {
          requestId: request.requestId,
          timestamp,
          status: 'TOOL_DENIED',
          exitCode: 1,
          stdout: '',
          stderr: '',
          errorMessage: `K-ARE Policy Denial: Command '${request.command}' contains forbidden tokens.`,
        };
      }
    }

    // 3. Policy check: Is path protected?
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

    // 4. REAL EXECUTOR: Physical Filesystem Execution via Node.js `fs`
    try {
      if (request.action === 'FS_READ') {
        if (!request.targetPath) {
          throw new Error('targetPath is required for FS_READ.');
        }

        const absolutePath = path.resolve(process.cwd(), request.targetPath);
        const fileContent = await fs.readFile(absolutePath, 'utf-8');

        return {
          requestId: request.requestId,
          timestamp: Date.now(),
          status: 'TOOL_COMPLETED',
          exitCode: 0,
          stdout: fileContent,
          stderr: '',
          affectedPath: request.targetPath,
        };
      }

      if (request.action === 'FS_EXISTS') {
        if (!request.targetPath) throw new Error('targetPath required.');
        const absolutePath = path.resolve(process.cwd(), request.targetPath);
        try {
          await fs.access(absolutePath);
          return {
            requestId: request.requestId,
            timestamp: Date.now(),
            status: 'TOOL_COMPLETED',
            exitCode: 0,
            stdout: `EXISTS: ${request.targetPath}`,
            stderr: '',
            affectedPath: request.targetPath,
          };
        } catch {
          return {
            requestId: request.requestId,
            timestamp: Date.now(),
            status: 'TOOL_COMPLETED',
            exitCode: 1,
            stdout: `NOT_FOUND: ${request.targetPath}`,
            stderr: '',
            affectedPath: request.targetPath,
          };
        }
      }

      return {
        requestId: request.requestId,
        timestamp: Date.now(),
        status: 'TOOL_UNAVAILABLE',
        exitCode: 1,
        stdout: '',
        stderr: '',
        errorMessage: `Action '${request.action}' is not supported by this executor release.`,
      };
    } catch (error: any) {
      return {
        requestId: request.requestId,
        timestamp: Date.now(),
        status: 'TOOL_FAILED',
        exitCode: 1,
        stdout: '',
        stderr: error.message || String(error),
        errorMessage: `Execution Error: ${error.message || String(error)}`,
      };
    }
  }
}
