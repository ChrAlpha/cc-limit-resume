import { describe, it, expect } from "vitest";
import { parseStatuslineInput, applyStatusline } from "../src/statusline.js";
import type { StatuslineInput } from "../src/types.js";

describe("parseStatuslineInput", () => {
  it("returns empty object for non-object input", () => {
    expect(parseStatuslineInput("string")).toEqual({});
    expect(parseStatuslineInput(null)).toEqual({});
    expect(parseStatuslineInput(42)).toEqual({});
  });

  it("passes through valid input", () => {
    const input: StatuslineInput = {
      session_id: "abc",
      cwd: "/tmp",
    };
    const result = parseStatuslineInput(input);
    expect(result.session_id).toBe("abc");
    expect(result.cwd).toBe("/tmp");
  });

  it("handles missing rate_limits gracefully", () => {
    const input: StatuslineInput = {
      session_id: "abc",
    };
    const result = parseStatuslineInput(input);
    expect(result.rate_limits).toBeUndefined();
  });
});

describe("applyStatusline", () => {
  it("throws on missing session_id", () => {
    expect(() => applyStatusline({})).toThrow("missing session_id");
  });

  it("parses full statusline with rate_limits", () => {
    const input: StatuslineInput = {
      session_id: "test-session-1",
      session_name: "test",
      transcript_path: "/tmp/t.jsonl",
      cwd: "/tmp/project",
      workspace: {
        current_dir: "/tmp/project",
        project_dir: "/tmp/project",
      },
      rate_limits: {
        five_hour: {
          used_percentage: 99.8,
          resets_at: 1779443400,
        },
        seven_day: {
          used_percentage: 42.1,
          resets_at: 1779800000,
        },
      },
    };

    const session = applyStatusline(input);
    expect(session.session_id).toBe("test-session-1");
    expect(session.session_name).toBe("test");
    expect(session.cwd).toBe("/tmp/project");
    expect(session.transcript_path).toBe("/tmp/t.jsonl");
    expect(session.rate_limits?.five_hour?.used_percentage).toBe(99.8);
    expect(session.rate_limits?.five_hour?.resets_at).toBe(1779443400);
    expect(session.rate_limits?.seven_day?.used_percentage).toBe(42.1);
    expect(session.rate_limits?.seven_day?.resets_at).toBe(1779800000);
    expect(session.last_statusline_at).toBeGreaterThan(0);
  });

  it("handles missing rate_limits gracefully in full apply", () => {
    const input: StatuslineInput = {
      session_id: "test-no-limits",
      cwd: "/tmp",
      transcript_path: "/tmp/t.jsonl",
    };

    const session = applyStatusline(input);
    expect(session.session_id).toBe("test-no-limits");
    expect(session.rate_limits).toBeUndefined();
  });
});
