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
  private workspaceRoot: string;

  constructor(
    policy: ToolGatePolicy = TEST_002A_POLICY,
    workspaceRoot: string = process.cwd()
  ) {
    this.policy = policy;
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  /**
   * Resolves targetPath against workspace root and verifies it doesn't escape.
   */
  private resolveWorkspacePath(targetPath: string): {
    absolutePath: string;
    relativePath: string;
    isInside: boolean;
  } {
    const absolutePath = path.resolve(this.workspaceRoot, targetPath);
    const relativePath = path.relative(this.workspaceRoot, absolutePath);

    const isInside =
      !relativePath.startsWith('..') && !path.isAbsolute(relativePath);

    return { absolutePath, relativePath, isInside };
  }

  /**
   * Evaluates if a normalized relative path targets a protected resource.
   */
  private isProtectedPath(relativePath: string): boolean {
    const normalizedTarget = path.normalize(relativePath).toLowerCase();

    return this.policy.protectedPaths.some((protectedPath) => {
      const normalizedProtected = path.normalize(protectedPath).toLowerCase();
      return (
        normalizedTarget === normalizedProtected ||
        normalizedTarget.startsWith(normalizedProtected + path.sep)
      );
    });
  }

  public async processRequest(
    request: ToolRequestPayload
  ): Promise<ToolResultPayload> {
    const timestamp = Date.now();

    // 1. Policy Check: Action Allowed
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

    // 2. Policy Check: Forbidden Command Tokens
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

    // 3. Path Validation & Workspace Boundary Check
    let targetPathInfo: ReturnType<typeof this.resolveWorkspacePath> | null =
      null;

    if (request.targetPath) {
      targetPathInfo = this.resolveWorkspacePath(request.targetPath);

      // Traversal Guard
      if (!targetPathInfo.isInside) {
        return {
          requestId: request.requestId,
          timestamp,
          status: 'TOOL_DENIED',
          exitCode: 1,
          stdout: '',
          stderr: '',
          errorMessage: `K-ARE Security Denial: Path traversal outside workspace boundary detected ('${request.targetPath}').`,
        };
      }

      // Canonical Protected-Path Guard
      if (this.isProtectedPath(targetPathInfo.relativePath)) {
        return {
          requestId: request.requestId,
          timestamp,
          status: 'TOOL_DENIED',
          exitCode: 1,
          stdout: '',
          stderr: '',
          errorMessage: `K-ARE Policy Denial: Access to protected path '${targetPathInfo.relativePath}' is denied.`,
        };
      }
    }

    // 4. Execution with Timeout Guarantee
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.policy.maxExecutionTimeMs
    );

    try {
      if (request.action === 'FS_READ') {
        if (!targetPathInfo) {
          throw new Error('targetPath is required for FS_READ.');
        }

        const fileContent = await fs.readFile(targetPathInfo.absolutePath, {
          encoding: 'utf-8',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return {
          requestId: request.requestId,
          timestamp: Date.now(),
          status: 'TOOL_COMPLETED',
          exitCode: 0,
          stdout: fileContent,
          stderr: '',
          affectedPath: targetPathInfo.relativePath,
        };
      }

      if (request.action === 'FS_EXISTS') {
        if (!targetPathInfo) throw new Error('targetPath is required.');
        try {
          await fs.access(targetPathInfo.absolutePath);
          clearTimeout(timeoutId);
          return {
            requestId: request.requestId,
            timestamp: Date.now(),
            status: 'TOOL_COMPLETED',
            exitCode: 0,
            stdout: `EXISTS: ${targetPathInfo.relativePath}`,
            stderr: '',
            affectedPath: targetPathInfo.relativePath,
          };
        } catch {
          clearTimeout(timeoutId);
          return {
            requestId: request.requestId,
            timestamp: Date.now(),
            status: 'TOOL_COMPLETED',
            exitCode: 1,
            stdout: `NOT_FOUND: ${targetPathInfo.relativePath}`,
            stderr: '',
            affectedPath: targetPathInfo.relativePath,
          };
        }
      }

      clearTimeout(timeoutId);
      return {
        requestId: request.requestId,
        timestamp: Date.now(),
        status: 'TOOL_UNAVAILABLE',
        exitCode: 1,
        stdout: '',
        stderr: '',
        errorMessage: `Capability '${request.action}' is declared but not implemented in this executor release.`,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        return {
          requestId: request.requestId,
          timestamp: Date.now(),
          status: 'TOOL_FAILED',
          exitCode: 124,
          stdout: '',
          stderr: 'Execution timed out',
          errorMessage: `K-ARE Execution Error: Operation exceeded maximum execution time of ${this.policy.maxExecutionTimeMs}ms.`,
        };
      }

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
