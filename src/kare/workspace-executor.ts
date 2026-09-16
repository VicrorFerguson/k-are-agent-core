import { access, readFile } from 'node:fs/promises';

export interface WorkspaceExecutorOptions {
  workspaceRoot: string;
}

/**
 * Narrow, read-only filesystem boundary for K-ARE workspace inspection.
 * Write and shell operations intentionally do not belong to this executor.
 */
export class WorkspaceExecutor {
  public readonly workspaceRoot: string;

  constructor(options: WorkspaceExecutorOptions) {
    this.workspaceRoot = options.workspaceRoot;
  }

  public async readFile(filePath: string, signal?: AbortSignal): Promise<string> {
    return readFile(filePath, { encoding: 'utf8', signal });
  }

  public async exists(filePath: string, signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    try {
      await access(filePath);
      return true;
    } catch (error) {
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return false;
      }
      throw error;
    }
  }
}