import { readFileSync } from "node:fs";
import type { CodexStopInput } from "./types.js";
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

export function parseCodexStopInput(raw: unknown): CodexStopInput {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  return raw as CodexStopInput;
}

export function applyCodexStop(input: CodexStopInput): Session | null {
  const sessionId = input.session_id;
  if (!sessionId) {
    console.error("codex-stop input missing session_id — cannot update state");
    return null;
  }

  const isRateLimit =
    input.stop_reason === "rate_limit" ||
    input.error?.toLowerCase().includes("rate limit") ||
    input.error?.toLowerCase().includes("rate_limit");

  if (!isRateLimit) {
    return null;
  }

  const index = loadIndex();
  let session = index.sessions[sessionId];

  const now = Math.floor(Date.now() / 1000);

  if (!session) {
    session = {
      session_id: sessionId,
      cwd: input.cwd ?? "",
      transcript_path: "",
      armed: false,
      created_at: now,
      updated_at: now,
      max_runs: 1,
      runs_used: 0,
      resume_prompt: "",
      tool: "codex",
    };
  } else {
    if (input.cwd !== undefined) session.cwd = input.cwd;
    session.tool = "codex";
  }

  session.last_failure_at = now;
  session.last_failure_error = "rate_limit";
  if (input.error !== undefined) {
    session.last_assistant_message = input.error;
  }

  upsertSession(session);
  return session;
}

export function processCodexStop(): void {
  const raw = parseStdin();
  const input = parseCodexStopInput(raw);
  applyCodexStop(input);
}
