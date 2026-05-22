import { spawn, execSync } from "node:child_process";
import type { Session } from "./types.js";
import { incrementRunsUsed, getLatestSession, getSession } from "./state.js";

export interface ResumeOptions {
  sessionId?: string;
  dryRun?: boolean;
  printCommand?: boolean;
  force?: boolean;
}

export interface ResumePlan {
  session: Session;
  command: string;
  args: string[];
  cwd: string;
}

export function buildResumePlan(options: ResumeOptions): ResumePlan {
  const session = options.sessionId
    ? getSession(options.sessionId)
    : getLatestSession();

  if (!session) {
    throw new Error(
      "No session found. Run Claude Code once with the statusline tap enabled, or use `cc-limit-resume arm --manual ...`.",
    );
  }

  if (!session.armed && !options.force) {
    throw new Error(
      `Session ${session.session_id} is not armed. Run "cc-limit-resume arm --session ${session.session_id}" first.`,
    );
  }

  if (session.runs_used >= session.max_runs && !options.force) {
    throw new Error(
      `Session ${session.session_id} has reached max runs (${session.runs_used}/${session.max_runs}). Use --force to override.`,
    );
  }

  const prompt = session.resume_prompt || defaultResumePrompt();

  return {
    session,
    command: "claude",
    args: ["--resume", session.session_id, "-p", prompt],
    cwd: session.cwd || process.cwd(),
  };
}

export function executeResume(plan: ResumePlan): number {
  const { session, command, args, cwd } = plan;

  incrementRunsUsed(session.session_id);

  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    shell: false,
  });

  // Return synchronously; the process inherits stdio
  // The exit code is not captured here — the child process controls the terminal
  return 0;
}

export function defaultResumePrompt(): string {
  return `Continue from the previous Claude Code rate-limit interruption.

Before making changes:
1. Inspect the current repository state with git status and relevant recent files.
2. Determine what was completed and what remains.
3. Continue from the safest checkpoint.
4. Do not restart the task from scratch unless necessary.
5. Do not assume interrupted local subprocesses or subagents are still running.`;
}

export function checkClaudeAvailable(): boolean {
  try {
    execSync("which claude", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
