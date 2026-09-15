import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface GitSyncOptions {
  workspaceRoot: string;
  remoteUrl?: string;
  defaultBranch?: string;
}

export class GitSyncService {
  private workspaceRoot: string;
  private defaultBranch: string;

  constructor(options: GitSyncOptions) {
    this.workspaceRoot = options.workspaceRoot || process.cwd();
    this.defaultBranch = options.defaultBranch || 'main';
  }

  private async runGit(command: string): Promise<{ stdout: string; stderr: string }> {
    return execAsync(`git ${command}`, { cwd: this.workspaceRoot });
  }

  /**
   * INBOUND SYNC: Pull latest changes from remote before JARVIS starts work.
   */
  public async pullLatest(): Promise<{ success: boolean; output: string }> {
    try {
      const { stdout } = await this.runGit(`pull origin ${this.defaultBranch} --rebase`);
      return { success: true, output: stdout.trim() };
    } catch (error: any) {
      return { success: false, output: error.message };
    }
  }

  /**
   * OUTBOUND SYNC: Stage files, commit with JARVIS metadata, and push.
   */
  public async commitAndPush(
    commitMessage: string,
    files: string[] = ['.']
  ): Promise<{ success: boolean; hash?: string; output: string }> {
    try {
      // 1. Stage specific files or entire workspace
      const fileList = files.join(' ');
      await this.runGit(`add ${fileList}`);

      // 2. Check if there are staging changes to commit
      const { stdout: status } = await this.runGit('status --porcelain');
      if (!status.trim()) {
        return { success: true, output: 'No changes detected to commit.' };
      }

      // 3. Commit with structured author identity
      const sanitizedMsg = commitMessage.replace(/"/g, '\\"');
      const authorFlag = '--author="JARVIS Agent <jarvis@kare.internal>"';
      await this.runGit(`commit ${authorFlag} -m "${sanitizedMsg}"`);

      // 4. Retrieve commit hash
      const { stdout: hash } = await this.runGit('rev-parse --short HEAD');

      // 5. Push to remote repository
      const { stdout: pushOutput } = await this.runGit(`push origin ${this.defaultBranch}`);

      return {
        success: true,
        hash: hash.trim(),
        output: pushOutput.trim() || `Committed ${hash.trim()} successfully.`,
      };
    } catch (error: any) {
      return { success: false, output: error.message };
    }
  }

  /**
   * STATUS CHECK: Inspect local uncommitted modifications.
   */
  public async getStatus(): Promise<string> {
    const { stdout } = await this.runGit('status --short');
    return stdout.trim() || 'Workspace clean.';
  }
}
