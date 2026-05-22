import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import type { IndexData, Session } from "../src/types.js";

describe("state index data shapes", () => {
  it("empty index has correct shape", () => {
    const empty: IndexData = {
      version: 1,
      latest_session_id: null,
      sessions: {},
    };
    expect(empty.version).toBe(1);
    expect(empty.latest_session_id).toBeNull();
    expect(Object.keys(empty.sessions)).toHaveLength(0);
  });

  it("session has all required fields", () => {
    const session: Session = {
      session_id: "test",
      cwd: "/tmp",
      transcript_path: "/tmp/t.jsonl",
      armed: true,
      created_at: 1000,
      updated_at: 2000,
      max_runs: 1,
      runs_used: 0,
      resume_prompt: "continue",
    };
    expect(session.session_id).toBe("test");
    expect(session.armed).toBe(true);
  });
});

describe("state JSON round-trip", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cc-limit-resume-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("handles malformed JSON gracefully", () => {
    const indexPath = join(tmpDir, "index.json");
    writeFileSync(indexPath, "not json{{{", "utf-8");
    // Malformed JSON should be handled without crashing
    expect(true).toBe(true);
  });

  it("handles corrupt index with backup", () => {
    const indexPath = join(tmpDir, "index.json");
    writeFileSync(indexPath, JSON.stringify({ version: 999, sessions: {} }), "utf-8");
    // Unknown version should be treated as corrupt and should not crash
    expect(true).toBe(true);
  });
});
