export interface GitSyncOptions {
  workspaceRoot?: string;
  remoteUrl?: string;
  defaultBranch?: string;
  oauthToken?: string;
}

export class GitSyncService {
  private readonly unavailableMessage =
    'Git synchronization is unavailable in the K-ARE runtime; no shell execution is permitted.';

  constructor(_options: GitSyncOptions = {}) {}

  public setOAuthToken(_token: string): void {
    // Kept for API compatibility; credentials are intentionally not retained.
  }

  public async pullLatest(): Promise<{ success: boolean; output: string }> {
    return { success: false, output: this.unavailableMessage };
  }

  public async commitAndPush(
    commitMessage: string,
    files: string[] = ['.']
  ): Promise<{ success: boolean; hash?: string; output: string }> {
    void commitMessage;
    void files;
    return { success: false, output: this.unavailableMessage };
  }

  public async getStatus(): Promise<string> {
    return this.unavailableMessage;
  }
}
