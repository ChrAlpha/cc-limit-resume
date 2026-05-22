import { describe, it, expect } from "vitest";
import { parseCodexStopInput, applyCodexStop } from "../src/codexStop.js";
import type { CodexStopInput } from "../src/types.js";

describe("parseCodexStopInput", () => {
  it("returns empty object for non-object input", () => {
    expect(parseCodexStopInput("string")).toEqual({});
    expect(parseCodexStopInput(null)).toEqual({});
  });

  it("passes through valid input", () => {
    const input: CodexStopInput = {
      session_id: "abc",
      stop_reason: "rate_limit",
    };
    const result = parseCodexStopInput(input);
    expect(result.session_id).toBe("abc");
    expect(result.stop_reason).toBe("rate_limit");
  });
});

describe("applyCodexStop", () => {
  it("returns null and logs for missing session_id", () => {
    const result = applyCodexStop({});
    expect(result).toBeNull();
  });

  it("records rate_limit stop_reason", () => {
    const input: CodexStopInput = {
      session_id: "test-codex-1",
      stop_reason: "rate_limit",
      error: "Codex CLI: 5-hour message limit reached",
      cwd: "/tmp/project",
    };

    const session = applyCodexStop(input);
    expect(session).not.toBeNull();
    expect(session!.session_id).toBe("test-codex-1");
    expect(session!.tool).toBe("codex");
    expect(session!.last_failure_error).toBe("rate_limit");
    expect(session!.last_failure_at).toBeGreaterThan(0);
    expect(session!.last_assistant_message).toBe("Codex CLI: 5-hour message limit reached");
  });

  it("detects rate limit from error field containing 'rate limit'", () => {
    const input: CodexStopInput = {
      session_id: "test-codex-2",
      stop_reason: "error",
      error: "request rate limit exceeded",
    };

    const session = applyCodexStop(input);
    expect(session).not.toBeNull();
    expect(session!.last_failure_error).toBe("rate_limit");
    expect(session!.tool).toBe("codex");
  });

  it("detects rate limit from error field containing 'rate_limit'", () => {
    const input: CodexStopInput = {
      session_id: "test-codex-3",
      error: "openai rate_limit exceeded: quota",
    };

    const session = applyCodexStop(input);
    expect(session).not.toBeNull();
    expect(session!.last_failure_error).toBe("rate_limit");
  });

  it("returns null for normal end_turn stop", () => {
    const input: CodexStopInput = {
      session_id: "test-codex-4",
      stop_reason: "end_turn",
    };

    const result = applyCodexStop(input);
    expect(result).toBeNull();
  });

  it("returns null for interrupted stop", () => {
    const input: CodexStopInput = {
      session_id: "test-codex-5",
      stop_reason: "interrupted",
    };

    const result = applyCodexStop(input);
    expect(result).toBeNull();
  });

  it("sets tool to codex on existing session", () => {
    // First create the session
    const input1: CodexStopInput = {
      session_id: "test-codex-6",
      stop_reason: "rate_limit",
      error: "limit hit",
    };
    applyCodexStop(input1);

    // Apply again to verify tool stays codex
    const input2: CodexStopInput = {
      session_id: "test-codex-6",
      stop_reason: "rate_limit",
    };
    const session = applyCodexStop(input2);
    expect(session).not.toBeNull();
    expect(session!.tool).toBe("codex");
  });
});
