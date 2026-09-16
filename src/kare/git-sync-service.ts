import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface GitSyncOptions {
  workspaceRoot?: string;
  remoteUrl?: string;
  defaultBranch?: string;
  oauthToken?: string;
}

export class GitSyncService {
  private workspaceRoot: string;
  private defaultBranch: string;
  private oauthToken: string | undefined;

  constructor(options: GitSyncOptions = {}) {
    this.workspaceRoot = options.workspaceRoot || process.cwd();
    this.defaultBranch = options.defaultBranch || 'main';
    this.oauthToken = options.oauthToken || process.env['GITHUB_OAUTH_TOKEN'];
  }

  public setOAuthToken(token: string): void {
    this.oauthToken = token;
  }

  private async runGit(command: string): Promise<{ stdout: string; stderr: string }> {
    const env = { ...process.env };
    if (this.oauthToken) {
      env['GITHUB_TOKEN'] = this.oauthToken;
    }
    return execAsync(`git ${command}`, { cwd: this.workspaceRoot, env });
  }

  public async pullLatest(): Promise<{ success: boolean; output: string }> {
    try {
      const { stdout } = await this.runGit(`pull origin ${this.defaultBranch} --rebase`);
      return { success: true, output: stdout.trim() };
    } catch (error: any) {
      return { success: false, output: error.message };
    }
  }

  public async commitAndPush(
    commitMessage: string,
    files: string[] = ['.']
  ): Promise<{ success: boolean; hash?: string; output: string }> {
    try {
      const fileList = files.join(' ');
      await this.runGit(`add ${fileList}`);

      const { stdout: status } = await this.runGit('status --porcelain');
      if (!status.trim()) {
        return { success: true, output: 'No changes detected to commit.' };
      }

      const sanitizedMsg = commitMessage.replace(/"/g, '\\"');
      const authorFlag = '--author="JARVIS Agent <jarvis@kare.internal>"';
      await this.runGit(`commit ${authorFlag} -m "${sanitizedMsg}"`);

      const { stdout: hash } = await this.runGit('rev-parse --short HEAD');
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

  public async getStatus(): Promise<string> {
    try {
      const { stdout } = await this.runGit('status --short');
      return stdout.trim() || 'Workspace clean.';
    } catch (error: any) {
      return `Git Status Error: ${error.message}`;
    }
  }
}
