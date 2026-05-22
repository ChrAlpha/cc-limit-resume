import { describe, it, expect } from "vitest";
import { parseStopFailureInput, applyStopFailure } from "../src/stopFailure.js";
import type { StopFailureInput } from "../src/types.js";

describe("parseStopFailureInput", () => {
  it("returns empty object for non-object input", () => {
    expect(parseStopFailureInput("string")).toEqual({});
    expect(parseStopFailureInput(null)).toEqual({});
  });

  it("passes through valid input", () => {
    const input: StopFailureInput = {
      session_id: "abc",
      error: "rate_limit",
    };
    const result = parseStopFailureInput(input);
    expect(result.session_id).toBe("abc");
    expect(result.error).toBe("rate_limit");
  });
});

describe("applyStopFailure", () => {
  it("returns null and logs for missing session_id", () => {
    const result = applyStopFailure({});
    expect(result).toBeNull();
  });

  it("records rate_limit failure", () => {
    const input: StopFailureInput = {
      session_id: "test-fail-1",
      cwd: "/tmp/project",
      transcript_path: "/tmp/t.jsonl",
      error: "rate_limit",
      error_details: "API rate limit exceeded",
      last_assistant_message: "Rate limit reached",
    };

    const session = applyStopFailure(input);
    expect(session).not.toBeNull();
    expect(session!.session_id).toBe("test-fail-1");
    expect(session!.tool).toBe("claude");
    expect(session!.last_failure_error).toBe("rate_limit");
    expect(session!.last_failure_at).toBeGreaterThan(0);
    expect(session!.last_assistant_message).toBe("Rate limit reached");
  });

  it("records authentication_failed", () => {
    const input: StopFailureInput = {
      session_id: "test-fail-auth",
      error: "authentication_failed",
    };

    const session = applyStopFailure(input);
    expect(session).not.toBeNull();
    expect(session!.tool).toBe("claude");
    expect(session!.last_failure_error).toBe("authentication_failed");
  });

  it("handles malformed JSON gracefully (empty input)", () => {
    const result = applyStopFailure({});
    expect(result).toBeNull();
  });
});
