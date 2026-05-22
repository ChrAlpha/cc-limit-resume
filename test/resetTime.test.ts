import { describe, it, expect } from "vitest";
import { inferResetTime } from "../src/resetTime.js";
import type { Session } from "../src/types.js";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    session_id: "test-1",
    cwd: "/tmp",
    transcript_path: "/tmp/transcript.jsonl",
    armed: true,
    created_at: 1779437900,
    updated_at: 1779438000,
    max_runs: 1,
    runs_used: 0,
    resume_prompt: "",
    ...overrides,
  };
}

describe("inferResetTime", () => {
  describe("explicit --reset argument", () => {
    it("parses epoch seconds", () => {
      const session = makeSession();
      const result = inferResetTime(session, { reset: "1779443400" });
      expect(result.resetTime).toBe(1779443400);
      expect(result.source).toContain("--reset");
    });

    it("parses ISO datetime", () => {
      const session = makeSession();
      const result = inferResetTime(session, { reset: "2026-05-22T13:50:00Z" });
      expect(result.resetTime).toBeGreaterThan(0);
      expect(result.source).toContain("--reset");
    });

    it('parses "2026-05-22 13:50 UTC"', () => {
      const session = makeSession();
      const result = inferResetTime(session, { reset: "2026-05-22 13:50 UTC" });
      expect(result.resetTime).toBeGreaterThan(0);
      expect(result.source).toContain("--reset");
    });

    it("throws on invalid value", () => {
      const session = makeSession();
      expect(() => inferResetTime(session, { reset: "not a date" })).toThrow(
        "Cannot parse --reset value",
      );
    });
  });

  describe("manual_resets_at", () => {
    it("uses manual_resets_at when present", () => {
      const session = makeSession({ manual_resets_at: 1779500000 });
      const result = inferResetTime(session);
      expect(result.resetTime).toBe(1779500000);
      expect(result.source).toContain("manual");
    });
  });

  describe("rate_limit failure inference", () => {
    it("uses five_hour when >= 99% and resets_at exists", () => {
      const session = makeSession({
        last_failure_error: "rate_limit",
        rate_limits: {
          five_hour: { used_percentage: 99.8, resets_at: 1779443400 },
          seven_day: { used_percentage: 42.1, resets_at: 1779800000 },
        },
      });
      const result = inferResetTime(session);
      expect(result.resetTime).toBe(1779443400);
      expect(result.source).toContain("five_hour");
    });

    it("uses seven_day when five_hour < 99% and seven_day >= 99%", () => {
      const session = makeSession({
        last_failure_error: "rate_limit",
        rate_limits: {
          five_hour: { used_percentage: 50, resets_at: 1779443400 },
          seven_day: { used_percentage: 99.5, resets_at: 1779800000 },
        },
      });
      const result = inferResetTime(session);
      expect(result.resetTime).toBe(1779800000);
      expect(result.source).toContain("seven_day");
    });

    it("uses earlier future reset when both are ambiguous", () => {
      const session = makeSession({
        last_failure_error: "rate_limit",
        rate_limits: {
          five_hour: { used_percentage: 80, resets_at: 1779500000 },
          seven_day: { used_percentage: 90, resets_at: 1779600000 },
        },
      });
      const result = inferResetTime(session);
      expect(result.resetTime).toBe(1779500000);
      expect(result.warning).toBeTruthy();
    });

    it("uses single available resets_at when only one exists", () => {
      const session = makeSession({
        last_failure_error: "rate_limit",
        rate_limits: {
          five_hour: { used_percentage: 80, resets_at: null },
          seven_day: { used_percentage: 90, resets_at: 1779600000 },
        },
      });
      const result = inferResetTime(session);
      expect(result.resetTime).toBe(1779600000);
    });
  });

  describe("no failure, high usage threshold", () => {
    it("uses five_hour when >= 95%", () => {
      const session = makeSession({
        rate_limits: {
          five_hour: { used_percentage: 96, resets_at: 1779443400 },
        },
      });
      const result = inferResetTime(session);
      expect(result.resetTime).toBe(1779443400);
      expect(result.source).toContain("95%");
    });

    it("throws when no data available", () => {
      const session = makeSession();
      expect(() => inferResetTime(session)).toThrow("Cannot infer reset time");
    });

    it("throws when five_hour < 95%", () => {
      const session = makeSession({
        rate_limits: {
          five_hour: { used_percentage: 50, resets_at: 1779443400 },
        },
      });
      expect(() => inferResetTime(session)).toThrow("Cannot infer reset time");
    });
  });

  describe("assistant message parsing", () => {
    it("extracts reset time from assistant message as fallback", () => {
      const session = makeSession({
        last_failure_error: "rate_limit",
        last_assistant_message: "API Error: Rate limit reached. Resets at 1:50 pm (UTC)",
      });
      const result = inferResetTime(session);
      expect(result.resetTime).toBeGreaterThan(0);
      expect(result.source).toContain("best-effort");
    });
  });
});
