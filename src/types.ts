export interface RateLimitInfo {
  used_percentage: number;
  resets_at: number | null;
}

export interface Session {
  session_id: string;
  session_name?: string;
  cwd: string;
  project_dir?: string;
  transcript_path: string;
  armed: boolean;
  created_at: number;
  updated_at: number;
  last_statusline_at?: number;
  last_failure_at?: number;
  last_failure_error?: string;
  last_assistant_message?: string;
  rate_limits?: {
    five_hour?: RateLimitInfo;
    seven_day?: RateLimitInfo;
  };
  manual_resets_at?: number;
  max_runs: number;
  runs_used: number;
  resume_prompt: string;
  tool?: "claude" | "codex";
  headless?: boolean;
}

export interface IndexData {
  version: number;
  latest_session_id: string | null;
  sessions: Record<string, Session>;
}

export interface StatuslineInput {
  session_id?: string;
  session_name?: string;
  transcript_path?: string;
  cwd?: string;
  workspace?: {
    current_dir?: string;
    project_dir?: string;
  };
  rate_limits?: {
    five_hour?: {
      used_percentage?: number;
      resets_at?: number;
    };
    seven_day?: {
      used_percentage?: number;
      resets_at?: number;
    };
  };
}

export interface StopFailureInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  error?: string;
  error_details?: string;
  last_assistant_message?: string;
  hook_event_name?: string;
}

export interface CodexStopInput {
  session_id?: string;
  transcript_path?: string | null;
  cwd?: string;
  hook_event_name?: string;
  model?: string;
  permission_mode?: string;
  turn_id?: string;
  last_assistant_message?: string | null;
  stop_hook_active?: boolean;
}
