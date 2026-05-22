import { readFileSync } from "node:fs";
import type { StatuslineInput } from "./types.js";
import { loadIndex, upsertSession } from "./state.js";
import type { Session } from "./types.js";

function parseStdin(): unknown {
  try {
    const data = readFileSync(process.stdin.fd, "utf-8");
    return JSON.parse(data);
  } catch {
    try {
      const data = readFileSync("/dev/stdin", "utf-8");
      return JSON.parse(data.trim() || "{}");
    } catch {
      return {};
    }
  }
}

export function parseStatuslineInput(raw: unknown): StatuslineInput {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  return raw as StatuslineInput;
}

export function applyStatusline(input: StatuslineInput): Session {
  const sessionId = input.session_id;
  if (!sessionId) {
    throw new Error("statusline input missing session_id — cannot update state");
  }

  const index = loadIndex();
  let session = index.sessions[sessionId];

  const now = Math.floor(Date.now() / 1000);

  if (!session) {
    session = {
      session_id: sessionId,
      session_name: input.session_name,
      cwd: input.cwd ?? input.workspace?.current_dir ?? "",
      project_dir: input.workspace?.project_dir ?? input.workspace?.current_dir ?? "",
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
    if (input.session_name !== undefined) session.session_name = input.session_name;
    if (input.cwd !== undefined) session.cwd = input.cwd;
    if (input.workspace?.project_dir !== undefined)
      session.project_dir = input.workspace.project_dir;
    if (input.workspace?.current_dir !== undefined && !session.cwd)
      session.cwd = input.workspace.current_dir;
    if (input.transcript_path !== undefined) session.transcript_path = input.transcript_path;
    if (!session.tool) session.tool = "claude";
  }

  session.last_statusline_at = now;

  if (input.rate_limits) {
    if (!session.rate_limits) session.rate_limits = {};

    if (input.rate_limits.five_hour) {
      session.rate_limits.five_hour = {
        used_percentage: input.rate_limits.five_hour.used_percentage ?? 0,
        resets_at: input.rate_limits.five_hour.resets_at ?? null,
      };
    }

    if (input.rate_limits.seven_day) {
      session.rate_limits.seven_day = {
        used_percentage: input.rate_limits.seven_day.used_percentage ?? 0,
        resets_at: input.rate_limits.seven_day.resets_at ?? null,
      };
    }
  }

  upsertSession(session);
  return session;
}

export function processStatusline(): void {
  const raw = parseStdin();
  const input = parseStatuslineInput(raw);
  applyStatusline(input);
}
