import { describe, it, expect } from "vitest";
import { parseCodexStopInput, applyCodexStop } from "../src/codexStop.js";
import type { CodexStopInput } from "../src/types.js";

describe("parseCodexStopInput", () => {
  it("returns empty object for non-object input", () => {
    expect(parseCodexStopInput("string")).toEqual({});
    expect(parseCodexStopInput(null)).toEqual({});
  });

  it("passes through valid Codex Stop hook input", () => {
    const input: CodexStopInput = {
      session_id: "abc",
      turn_id: "def",
      cwd: "/project",
      hook_event_name: "Stop",
      model: "gpt-5.4",
      permission_mode: "default",
      last_assistant_message: "Task completed.",
    };
    const result = parseCodexStopInput(input);
    expect(result.session_id).toBe("abc");
    expect(result.last_assistant_message).toBe("Task completed.");
  });
});

describe("applyCodexStop", () => {
  it("returns null and logs for missing session_id", () => {
    const result = applyCodexStop({});
    expect(result).toBeNull();
  });

  it("detects rate limit from last_assistant_message containing 'rate limit'", () => {
    const input: CodexStopInput = {
      session_id: "test-codex-1",
      last_assistant_message: "You've hit your rate limit. Try again later.",
      cwd: "/tmp/project",
    };

    const session = applyCodexStop(input);
    expect(session).not.toBeNull();
    expect(session!.session_id).toBe("test-codex-1");
    expect(session!.tool).toBe("codex");
    expect(session!.last_failure_error).toBe("rate_limit");
    expect(session!.last_failure_at).toBeGreaterThan(0);
  });

  it("detects rate limit from message containing 'message limit'", () => {
    const input: CodexStopInput = {
      session_id: "test-codex-2",
      last_assistant_message: "Codex CLI: 5-hour message limit reached.",
    };

    const session = applyCodexStop(input);
    expect(session).not.toBeNull();
    expect(session!.last_failure_error).toBe("rate_limit");
  });

  it("detects rate limit from message containing 'quota exceeded'", () => {
    const input: CodexStopInput = {
      session_id: "test-codex-3",
      last_assistant_message: "Weekly quota exceeded. Try again in 2 days.",
    };

    const session = applyCodexStop(input);
    expect(session).not.toBeNull();
    expect(session!.last_failure_error).toBe("rate_limit");
  });

  it("detects rate limit from message containing 'try again in'", () => {
    const input: CodexStopInput = {
      session_id: "test-codex-4",
      last_assistant_message: "You're out of messages. Try again in 30 minutes.",
    };

    const session = applyCodexStop(input);
    expect(session).not.toBeNull();
  });

  it("detects rate limit from message containing 'resets in'", () => {
    const input: CodexStopInput = {
      session_id: "test-codex-reset",
      last_assistant_message: "Your quota resets in 3 hours.",
    };

    const session = applyCodexStop(input);
    expect(session).not.toBeNull();
    expect(session!.last_failure_error).toBe("rate_limit");
  });

  it("returns null for normal end_turn stop (no rate limit text)", () => {
    const input: CodexStopInput = {
      session_id: "test-codex-5",
      last_assistant_message: "Task completed successfully. All tests pass.",
    };

    const result = applyCodexStop(input);
    expect(result).toBeNull();
  });

  it("returns null for empty last_assistant_message", () => {
    const input: CodexStopInput = {
      session_id: "test-codex-6",
    };

    const result = applyCodexStop(input);
    expect(result).toBeNull();
  });

  it("returns null for null last_assistant_message", () => {
    const input: CodexStopInput = {
      session_id: "test-codex-7",
      last_assistant_message: null,
    };

    const result = applyCodexStop(input);
    expect(result).toBeNull();
  });

  it("stores last_assistant_message on session", () => {
    const input: CodexStopInput = {
      session_id: "test-codex-8",
      last_assistant_message: "Rate limit exceeded: 50 messages in 5 hours.",
    };

    const session = applyCodexStop(input);
    expect(session).not.toBeNull();
    expect(session!.last_assistant_message).toContain("Rate limit exceeded");
  });

  it("captures transcript_path from Stop hook input", () => {
    const input: CodexStopInput = {
      session_id: "test-codex-9",
      transcript_path: "/home/user/.codex/sessions/2026/05/23/session.jsonl",
      last_assistant_message: "rate limit hit",
    };

    const session = applyCodexStop(input);
    expect(session).not.toBeNull();
    expect(session!.transcript_path).toBe(
      "/home/user/.codex/sessions/2026/05/23/session.jsonl",
    );
  });

  it("sets tool to codex on existing session", () => {
    const sharedId = "test-codex-reuse";
    const input1: CodexStopInput = {
      session_id: sharedId,
      last_assistant_message: "rate limit hit",
    };
    applyCodexStop(input1);

    const input2: CodexStopInput = {
      session_id: sharedId,
      last_assistant_message: "rate limit hit again",
    };
    const session = applyCodexStop(input2);
    expect(session).not.toBeNull();
    expect(session!.tool).toBe("codex");
  });
});
