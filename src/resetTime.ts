import type { Session } from "./types.js";

export interface ResetTimeOptions {
  reset?: string;
}

export interface ResetTimeResult {
  resetTime: number; // Unix epoch seconds
  source: string; // description of where the time came from
  warning?: string;
}

function parseResetString(value: string): number | null {
  // Try epoch seconds first (all digits)
  if (/^\d+$/.test(value)) {
    const epoch = parseInt(value, 10);
    if (epoch > 0) return epoch;
  }

  // Try ISO 8601
  const isoDate = new Date(value);
  if (!isNaN(isoDate.getTime())) {
    return Math.floor(isoDate.getTime() / 1000);
  }

  return null;
}

function parseAssistantMessageTime(message: string): number | null {
  // Best-effort parser for patterns like "resets 1:50pm (UTC)" or "resets at 13:50 UTC"
  // Pattern: "HH:MM" with optional am/pm and optional timezone
  const timePattern = /resets?\s*(?:at\s*)?(\d{1,2}):(\d{2})\s*(am|pm)?\s*\(?(UTC|GMT)\)?/i;
  const match = message.match(timePattern);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3]?.toLowerCase();
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;

    const now = new Date();
    const resetDate = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hours,
      minutes,
      0,
    ));
    return Math.floor(resetDate.getTime() / 1000);
  }

  return null;
}

export function inferResetTime(session: Session, options: ResetTimeOptions = {}): ResetTimeResult {
  // Priority 1: CLI --reset argument
  if (options.reset) {
    const parsed = parseResetString(options.reset);
    if (parsed !== null) {
      return { resetTime: parsed, source: "explicit --reset argument" };
    }
    throw new Error(
      `Cannot parse --reset value "${options.reset}". Expected Unix epoch seconds, ISO datetime, or a string like "2026-05-22 13:50 UTC".`,
    );
  }

  // Priority 2: manual_resets_at
  if (session.manual_resets_at) {
    return { resetTime: session.manual_resets_at, source: "manual --reset recorded at arm time" };
  }

  // Priority 3: last_failure_error === "rate_limit"
  if (session.last_failure_error === "rate_limit") {
    const fiveHour = session.rate_limits?.five_hour;
    const sevenDay = session.rate_limits?.seven_day;

    // Check if five_hour is near 100% and has a reset time
    if (fiveHour && fiveHour.used_percentage >= 99 && fiveHour.resets_at) {
      return {
        resetTime: fiveHour.resets_at,
        source: "five_hour rate limit (>= 99% used) reported by statusline",
      };
    }

    // Check if seven_day is near 100% and has a reset time
    if (sevenDay && sevenDay.used_percentage >= 99 && sevenDay.resets_at) {
      return {
        resetTime: sevenDay.resets_at,
        source: "seven_day rate limit (>= 99% used) reported by statusline",
      };
    }

    // Both have resets_at but neither clearly >= 99%, use earlier future one
    const fiveResets = fiveHour?.resets_at;
    const sevenResets = sevenDay?.resets_at;
    if (fiveResets && sevenResets) {
      const earlier = fiveResets <= sevenResets ? fiveResets : sevenResets;
      return {
        resetTime: earlier,
        source: "earlier future reset (ambiguous which limit was hit)",
        warning:
          "Ambiguous which rate limit was hit. Using the earlier future reset time as a pragmatic fallback.",
      };
    }
    if (fiveResets) {
      return { resetTime: fiveResets, source: "five_hour reset (only one available)" };
    }
    if (sevenResets) {
      return { resetTime: sevenResets, source: "seven_day reset (only one available)" };
    }

    // Try best-effort parse from assistant message
    if (session.last_assistant_message) {
      const parsed = parseAssistantMessageTime(session.last_assistant_message);
      if (parsed !== null) {
        return {
          resetTime: parsed,
          source: "best-effort parse from assistant message",
          warning:
            "Reset time inferred from assistant message text. This is a best-effort parse and may be inaccurate.",
        };
      }
    }

    throw new Error(
      "Rate limit detected but no reset time found in rate_limits data. Provide --reset explicitly.",
    );
  }

  // Priority 4: No failure, try statusline thresholds
  const fiveHour = session.rate_limits?.five_hour;
  if (fiveHour && fiveHour.used_percentage >= 95 && fiveHour.resets_at) {
    return {
      resetTime: fiveHour.resets_at,
      source: "five_hour usage >= 95% (no rate limit hit yet)",
    };
  }

  throw new Error(
    "Cannot infer reset time. Provide --reset explicitly, or ensure statusline tap has captured rate_limits data.",
  );
}
