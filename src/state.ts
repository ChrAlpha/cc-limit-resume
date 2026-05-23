import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { IndexData, Session } from "./types.js";
import { getIndexPath, getStateDir } from "./paths.js";

const CURRENT_VERSION = 1;

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function backupCorrupt(path: string): void {
  try {
    const backup = `${path}.corrupt.${now()}`;
    renameSync(path, backup);
  } catch {
    // best effort
  }
}

function atomicWrite(path: string, data: string): void {
  const tmp = `${path}.tmp.${process.pid}.${now()}`;
  writeFileSync(tmp, data, { encoding: "utf-8", mode: 0o600 });
  renameSync(tmp, path);
}

function emptyIndex(): IndexData {
  return {
    version: CURRENT_VERSION,
    latest_session_id: null,
    sessions: {},
  };
}

export function loadIndex(): IndexData {
  const indexPath = getIndexPath();
  try {
    const raw = readFileSync(indexPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.version === CURRENT_VERSION) {
      return parsed as IndexData;
    }
    backupCorrupt(indexPath);
  } catch {
    // file doesn't exist or is corrupt — return empty
    if (existsSync(indexPath)) {
      backupCorrupt(indexPath);
    }
  }
  return emptyIndex();
}

export function saveIndex(data: IndexData): void {
  const indexPath = getIndexPath();
  const dir = dirname(indexPath);
  mkdirSync(dir, { recursive: true });
  atomicWrite(indexPath, JSON.stringify(data, null, 2));
}

export function getSession(id: string): Session | null {
  const index = loadIndex();
  return index.sessions[id] ?? null;
}

export function getLatestSession(tool?: "claude" | "codex"): Session | null {
  const index = loadIndex();
  if (!tool) {
    if (!index.latest_session_id) return null;
    return index.sessions[index.latest_session_id] ?? null;
  }
  let latest: Session | null = null;
  for (const s of Object.values(index.sessions)) {
    if ((s.tool ?? "claude") !== tool) continue;
    if (!latest || s.updated_at > latest.updated_at) latest = s;
  }
  return latest;
}

export function upsertSession(session: Session): IndexData {
  const index = loadIndex();
  session.updated_at = now();
  if (!session.created_at) {
    session.created_at = now();
  }
  index.sessions[session.session_id] = session;
  index.latest_session_id = session.session_id;
  saveIndex(index);
  return index;
}

export function updateSession(
  sessionId: string,
  update: (session: Session) => void,
): IndexData {
  const index = loadIndex();
  const session = index.sessions[sessionId];
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  update(session);
  session.updated_at = now();
  index.sessions[sessionId] = session;
  saveIndex(index);
  return index;
}

export function findOrCreateSession(sessionId: string, defaults: Partial<Session>): Session {
  const index = loadIndex();
  let session = index.sessions[sessionId];
  if (!session) {
    session = {
      session_id: sessionId,
      cwd: defaults.cwd ?? "",
      transcript_path: defaults.transcript_path ?? "",
      armed: false,
      created_at: now(),
      updated_at: now(),
      max_runs: 1,
      runs_used: 0,
      resume_prompt: "",
      ...defaults,
    };
  }
  return session;
}

export function setArmed(
  sessionId: string,
  armed: boolean,
  maxRuns?: number,
  resumePrompt?: string,
  headless?: boolean,
): IndexData {
  return updateSession(sessionId, (s) => {
    s.armed = armed;
    if (maxRuns !== undefined) s.max_runs = maxRuns;
    if (resumePrompt !== undefined) s.resume_prompt = resumePrompt;
    if (headless !== undefined) s.headless = headless;
  });
}

export function incrementRunsUsed(sessionId: string): IndexData {
  return updateSession(sessionId, (s) => {
    s.runs_used += 1;
    if (s.runs_used >= s.max_runs) {
      s.armed = false;
    }
  });
}
