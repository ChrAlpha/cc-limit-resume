import { readFileSync } from "node:fs";
import type { StopFailureInput } from "./types.js";
import { loadIndex, upsertSession } from "./state.js";
import type { Session } from "./types.js";

function parseStdin(): unknown {
  try {
    const data = readFileSync("/dev/stdin", "utf-8");
    return JSON.parse(data.trim() || "{}");
  } catch {
    return {};
  }
}

export function parseStopFailureInput(raw: unknown): StopFailureInput {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  return raw as StopFailureInput;
}

export function applyStopFailure(input: StopFailureInput): Session | null {
  const sessionId = input.session_id;
  if (!sessionId) {
    console.error("stop-failure input missing session_id — cannot update state");
    return null;
  }

  const index = loadIndex();
  let session = index.sessions[sessionId];

  const now = Math.floor(Date.now() / 1000);

  if (!session) {
    session = {
      session_id: sessionId,
      cwd: input.cwd ?? "",
      transcript_path: input.transcript_path ?? "",
      armed: false,
      created_at: now,
      updated_at: now,
      max_runs: 1,
      runs_used: 0,
      resume_prompt: "",
      tool: "claude",
    };
  } else {
    if (input.cwd !== undefined) session.cwd = input.cwd;
    if (input.transcript_path !== undefined) session.transcript_path = input.transcript_path;
    if (!session.tool) session.tool = "claude";
  }

  session.last_failure_at = now;
  session.last_failure_error = input.error ?? "";
  if (input.last_assistant_message !== undefined) {
    session.last_assistant_message = input.last_assistant_message;
  }

  // If rate_limit error, keep armed state unchanged
  // For other errors, also keep armed state — only the user can toggle it

  upsertSession(session);
  return session;
}

export function processStopFailure(): void {
  const raw = parseStdin();
  const input = parseStopFailureInput(raw);
  applyStopFailure(input);
}
