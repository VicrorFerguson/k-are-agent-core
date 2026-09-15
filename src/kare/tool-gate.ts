import * as path from 'node:path';
import { WorkspaceExecutor } from './workspace-executor';
import { GitSyncService } from './git-sync-service';
import {
  ToolRequestPayload,
  ToolResultPayload,
  ToolGatePolicy,
  TEST_002A_POLICY,
} from './tool-gate-types';

export interface AuthenticatedToolContext {
  servicePrincipalId: string;
  actorId: string;
  actorRole: string;
  authenticationSessionId?: string;
  oauthToken?: string;
}

export class KAREToolGate {
  private policy: ToolGatePolicy;
  private executor: WorkspaceExecutor;
  private gitSync: GitSyncService;

  constructor(
    policy: ToolGatePolicy = TEST_002A_POLICY,
    executor?: WorkspaceExecutor,
    gitSync?: GitSyncService
  ) {
    this.policy = policy;
    const rootDir = process.env.WORKSPACE_ROOT || process.cwd();
    this.executor = executor || new WorkspaceExecutor({ workspaceRoot: rootDir });
    this.gitSync = gitSync || new GitSyncService({ workspaceRoot: rootDir });
  }

  private resolveWorkspacePath(requestedPath: string): string {
    const root = path.resolve(this.executor.workspaceRoot);
    const candidate = path.resolve(root, requestedPath);
    const relative = path.relative(root, candidate);

    if (
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error('PATH_OUTSIDE_WORKSPACE');
    }
    return candidate;
  }

  private isProtectedPath(relativePath: string): boolean {
    const normalizedTarget = relativePath
      .split(path.sep)
      .filter(Boolean)
      .join('/')
      .toLowerCase();

    return this.policy.protectedPaths.some((protectedPath) => {
      const normalizedProtected = protectedPath
        .split('/')
        .filter(Boolean)
        .join('/')
        .toLowerCase();

      return (
        normalizedTarget === normalizedProtected ||
        normalizedTarget.startsWith(`${normalizedProtected}/`)
      );
    });
  }

  private completedResult(
    requestId: string,
    content: string,
    affectedPath?: string
  ): ToolResultPayload {
    if (content === undefined || content === null) {
      throw new Error(
        'INVARIANT_VIOLATION: TOOL_COMPLETED requires verified executor output.'
      );
    }
    return {
      requestId,
      timestamp: Date.now(),
      status: 'TOOL_COMPLETED',
      exitCode: 0,
      stdout: content,
      stderr: '',
      affectedPath,
    };
  }

  public async processRequest(
    request: ToolRequestPayload,
    context?: AuthenticatedToolContext
  ): Promise<ToolResultPayload> {
    const timestamp = Date.now();

    if (context?.oauthToken) {
      this.gitSync.setOAuthToken(context.oauthToken);
    }

    if (request.action === 'FS_LIST' || request.action === 'SHELL_INSPECT') {
      return {
        requestId: request.requestId,
        timestamp,
        status: 'TOOL_UNAVAILABLE',
        exitCode: 1,
        stdout: '',
        stderr: '',
        errorMessage: `Capability '${request.action}' is declared but not implemented in this executor release.`,
      };
    }

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

    let absolutePath = '';
    let relativePath = '';

    if (request.targetPath !== undefined && request.targetPath !== null) {
      if (request.targetPath === '') {
        return {
          requestId: request.requestId,
          timestamp,
          status: 'TOOL_DENIED',
          exitCode: 1,
          stdout: '',
          stderr: '',
          errorMessage: 'K-ARE Security Denial: Empty target path supplied.',
        };
      }

      try {
        absolutePath = this.resolveWorkspacePath(request.targetPath);
        relativePath = path.relative(this.executor.workspaceRoot, absolutePath);
      } catch (err) {
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

      if (this.isProtectedPath(relativePath)) {
        return {
          requestId: request.requestId,
          timestamp,
          status: 'TOOL_DENIED',
          exitCode: 1,
          stdout: '',
          stderr: '',
          errorMessage: `K-ARE Policy Denial: Access to protected path '${relativePath}' is denied.`,
        };
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.policy.maxExecutionTimeMs);

    try {
      if (request.action === 'FS_READ') {
        if (!absolutePath) throw new Error('targetPath is required.');
        const content = await this.executor.readFile(absolutePath, controller.signal);
        return this.completedResult(request.requestId, content, relativePath);
      }

      if (request.action === 'FS_EXISTS') {
        if (!absolutePath) throw new Error('targetPath is required.');
        const fileExists = await this.executor.exists(absolutePath, controller.signal);
        const outputString = fileExists ? `EXISTS: ${relativePath}` : `NOT_FOUND: ${relativePath}`;
        const exitCode = fileExists ? 0 : 1;
        return {
          requestId: request.requestId,
          timestamp: Date.now(),
          status: 'TOOL_COMPLETED',
          exitCode,
          stdout: outputString,
          stderr: '',
          affectedPath: relativePath,
        };
      }

      if (request.action === 'GIT_PULL') {
        const pullResult = await this.gitSync.pullLatest();
        return {
          requestId: request.requestId,
          timestamp: Date.now(),
          status: pullResult.success ? 'TOOL_COMPLETED' : 'TOOL_FAILED',
          exitCode: pullResult.success ? 0 : 1,
          stdout: pullResult.output,
          stderr: pullResult.success ? '' : pullResult.output,
        };
      }

      if (request.action === 'GIT_PUSH') {
        const message = request.commitMessage || 'feat(jarvis): automated workspace commit';
        const targetFiles = request.targetFiles || ['.'];
        const pushResult = await this.gitSync.commitAndPush(message, targetFiles);
        return {
          requestId: request.requestId,
          timestamp: Date.now(),
          status: pushResult.success ? 'TOOL_COMPLETED' : 'TOOL_FAILED',
          exitCode: pushResult.success ? 0 : 1,
          stdout: pushResult.output,
          stderr: pushResult.success ? '' : pushResult.output,
        };
      }

      if (request.action === 'GIT_STATUS') {
        const statusOutput = await this.gitSync.getStatus();
        return this.completedResult(request.requestId, statusOutput);
      }

      return {
        requestId: request.requestId,
        timestamp: Date.now(),
        status: 'TOOL_UNAVAILABLE',
        exitCode: 1,
        stdout: '',
        stderr: '',
        errorMessage: `Capability '${request.action}' is not executable.`,
      };
    } catch (error: any) {
      if (controller.signal.aborted) {
        return {
          requestId: request.requestId,
          timestamp: Date.now(),
          status: 'TOOL_FAILED',
          exitCode: 124,
          stdout: '',
          stderr: '',
          affectedPath: relativePath,
          errorMessage: 'TOOL_EXECUTION_TIMEOUT',
        };
      }

      return {
        requestId: request.requestId,
        timestamp: Date.now(),
        status: 'TOOL_FAILED',
        exitCode: 1,
        stdout: '',
        stderr: '',
        affectedPath: relativePath,
        errorMessage: error.code === 'ENOENT' ? 'FILE_NOT_FOUND' : 'EXECUTION_ERROR',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
