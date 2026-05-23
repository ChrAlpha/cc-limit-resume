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

const RATE_LIMIT_PATTERNS = [
  "rate limit",
  "rate_limit",
  "message limit",
  "quota exceeded",
  "usage limit",
  "try again in",
  "resets in",
  "resets at",
];

function detectRateLimitFromMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return RATE_LIMIT_PATTERNS.some((p) => lower.includes(p));
}

export function applyCodexStop(input: CodexStopInput): Session | null {
  const sessionId = input.session_id;
  if (!sessionId) {
    console.error("codex-stop input missing session_id — cannot update state");
    return null;
  }

  const isRateLimit = detectRateLimitFromMessage(input.last_assistant_message);

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
      transcript_path: input.transcript_path ?? "",
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
    if (input.transcript_path !== undefined && input.transcript_path !== null) {
      session.transcript_path = input.transcript_path;
    }
    session.tool = "codex";
  }

  session.last_failure_at = now;
  session.last_failure_error = "rate_limit";
  if (input.last_assistant_message !== undefined && input.last_assistant_message !== null) {
    session.last_assistant_message = input.last_assistant_message;
  }

  upsertSession(session);
  return session;
}

export function processCodexStop(): void {
  const raw = parseStdin();
  const input = parseCodexStopInput(raw);
  applyCodexStop(input);
}
