export type ToolAction =
  | 'FS_READ'
  | 'FS_EXISTS'
  | 'FS_LIST'
  | 'SHELL_INSPECT'
  | 'SANDBOX_EDIT'
  | 'GIT_PULL'
  | 'GIT_PUSH'
  | 'GIT_STATUS';

export type ToolExecutionStatus =
  | 'TOOL_REQUESTED'
  | 'TOOL_AUTHORIZED'
  | 'TOOL_EXECUTING'
  | 'TOOL_COMPLETED'
  | 'TOOL_FAILED'
  | 'TOOL_DENIED'
  | 'TOOL_UNAVAILABLE';

export interface ToolRequestPayload {
  requestId: string;
  timestamp: number;
  action: ToolAction;
  targetPath?: string;
  command?: string;
  args?: string[];
  content?: string;
  commitMessage?: string;
  targetFiles?: string[];
  reasoning: string;
}

export interface ToolResultPayload {
  requestId: string;
  timestamp: number;
  status: ToolExecutionStatus;
  exitCode: number;
  stdout: string;
  stderr: string;
  executedCommand?: string;
  affectedPath?: string;
  errorMessage?: string;
}

export interface ToolGatePolicy {
  allowedActions: ToolAction[];
  protectedPaths: string[];
  forbiddenCommands: string[];
  maxExecutionTimeMs: number;
}

export const TEST_002A_POLICY: ToolGatePolicy = {
  allowedActions: [
    'FS_READ',
    'FS_EXISTS',
    'FS_LIST',
    'SHELL_INSPECT',
    'GIT_PULL',
    'GIT_PUSH',
    'GIT_STATUS',
  ],
  protectedPaths: [
    '.env',
    'supabase/config.toml',
    'src/kare/gateway.ts',
  ],
  forbiddenCommands: ['rm', 'mv', 'chmod', 'npm publish'],
  maxExecutionTimeMs: 15000,
};
