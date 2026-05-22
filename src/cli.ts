#!/usr/bin/env node
import { Command } from "commander";
import { processStatusline } from "./statusline.js";
import { processStopFailure } from "./stopFailure.js";
import { loadIndex, getSession, getLatestSession, upsertSession, setArmed } from "./state.js";
import { inferResetTime } from "./resetTime.js";
import { countdownWait, formatCountdown, nowSeconds } from "./clock.js";
import { processCodexStop } from "./codexStop.js";
import { buildResumePlan, executeResume, checkClaudeAvailable, checkCodexAvailable, defaultResumePrompt } from "./resume.js";
import type { Session } from "./types.js";

const program = new Command();

program
  .name("cc-limit-resume")
  .description("Explicit one-shot Claude Code rate-limit resume helper")
  .version("0.1.0");

// ---- tap-statusline ----
program
  .command("tap-statusline")
  .description("Read Claude Code statusline JSON from stdin and update state")
  .action(() => {
    try {
      processStatusline();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`tap-statusline error: ${msg}`);
      process.exit(1);
    }
  });

// ---- log-stop-failure ----
program
  .command("log-stop-failure")
  .description("Read Claude Code StopFailure hook JSON from stdin and update state")
  .action(() => {
    try {
      processStopFailure();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`log-stop-failure error: ${msg}`);
      process.exit(1);
    }
  });

// ---- tap-codex-stop ----
program
  .command("tap-codex-stop")
  .description("Read Codex CLI Stop hook JSON from stdin and update state on rate-limit")
  .action(() => {
    try {
      processCodexStop();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`tap-codex-stop error: ${msg}`);
      process.exit(1);
    }
  });

// ---- arm ----
program
  .command("arm")
  .description("Arm a session for one-shot resume")
  .option("--latest", "Use the latest session")
  .option("--session <id>", "Use a specific session ID")
  .option("--max-runs <n>", "Maximum number of resume runs", "1")
  .option("--resume-prompt <prompt>", "Custom resume prompt")
  .option("--manual", "Manual arm (bootstrapping without statusline data)")
  .option("--cwd <path>", "Working directory (manual only)")
  .option("--transcript-path <path>", "Transcript path (manual only)")
  .option("--reset <reset>", "Manual reset time (manual only)")
  .option("--tool <tool>", "Tool to operate on (claude or codex)", "claude")
  .action((opts) => {
    try {
      let session: Session;

      if (opts.manual) {
        if (!opts.session) {
          console.error("--manual requires --session <id>");
          process.exit(1);
        }
        if (!opts.cwd) {
          console.error("--manual requires --cwd <path>");
          process.exit(1);
        }
        if (!opts.transcriptPath) {
          console.error("--manual requires --transcript-path <path>");
          process.exit(1);
        }
        if (!opts.reset) {
          console.error("--manual requires --reset <time>");
          process.exit(1);
        }
        const manualResetsAt = Math.floor(new Date(opts.reset).getTime() / 1000);
        if (isNaN(manualResetsAt)) {
          console.error(`Cannot parse --reset value "${opts.reset}"`);
          process.exit(1);
        }
        session = {
          session_id: opts.session,
          session_name: "manual",
          cwd: opts.cwd,
          project_dir: opts.cwd,
          transcript_path: opts.transcriptPath,
          armed: false,
          created_at: nowSeconds(),
          updated_at: nowSeconds(),
          max_runs: parseInt(opts.maxRuns, 10) || 1,
          runs_used: 0,
          resume_prompt: opts.resumePrompt || defaultResumePrompt(opts.tool === "codex" ? "codex" : "claude"),
          manual_resets_at: manualResetsAt,
          tool: opts.tool === "codex" ? "codex" : "claude",
        };
      } else {
        const tool = opts.tool === "codex" ? "codex" : "claude";
        session = opts.session
          ? getSession(opts.session)
          : getLatestSession(tool);

        if (!session) {
          console.error(
            "No session found. Run Claude Code once with the statusline tap enabled, or use:\n" +
              '  cc-limit-resume arm --manual --session <id> --cwd <path> --transcript-path <path> --reset "2026-05-22 13:50 UTC"',
          );
          process.exit(1);
        }
      }

      const maxRuns = parseInt(opts.maxRuns, 10) || 1;
      const resumePrompt = opts.resumePrompt || session.resume_prompt || defaultResumePrompt(session.tool);

      if (opts.manual) {
        session.armed = true;
        session.max_runs = maxRuns;
        session.resume_prompt = resumePrompt;
        upsertSession(session);
      } else {
        setArmed(session.session_id, true, maxRuns, resumePrompt);
      }

      console.error(`Session ${session.session_id} armed. Runs: 0/${maxRuns}`);

      if (session.manual_resets_at) {
        const resetDate = new Date(session.manual_resets_at * 1000);
        console.error(`Manual reset at: ${resetDate.toISOString()}`);
      }

      console.error(`\nWhen rate-limited, run:`);
      console.error(`  cc-limit-resume wait --session ${session.session_id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`arm error: ${msg}`);
      process.exit(1);
    }
  });

// ---- wait ----
program
  .command("wait")
  .description("Wait until reset time then resume")
  .option("--latest", "Use the latest session")
  .option("--session <id>", "Use a specific session ID")
  .option("--reset <reset>", "Override reset time")
  .option("--margin-seconds <n>", "Extra margin in seconds", "60")
  .option("--dry-run", "Show what would happen without waiting")
  .option("--tool <tool>", "Tool to operate on (claude or codex)", "claude")
  .action(async (opts) => {
    try {
      const tool = opts.tool === "codex" ? "codex" : "claude";
      const session = opts.session
        ? getSession(opts.session)
        : getLatestSession(tool);

      if (!session) {
        console.error(
          "No session found. Arm a session first with `cc-limit-resume arm --latest`.",
        );
        process.exit(1);
      }

      if (!session.armed) {
        console.error(
          `Session ${session.session_id} is not armed. Run "cc-limit-resume arm --session ${session.session_id}" first.`,
        );
        process.exit(1);
      }

      if (session.runs_used >= session.max_runs) {
        console.error(
          `Session ${session.session_id} has reached max runs (${session.runs_used}/${session.max_runs}).`,
        );
        process.exit(1);
      }

      const result = inferResetTime(session, { reset: opts.reset });
      const marginSeconds = parseInt(opts.marginSeconds, 10) || 60;
      const resetDate = new Date(result.resetTime * 1000);

      if (result.warning) {
        console.error(`Warning: ${result.warning}`);
      }
      console.error(`Reset time: ${resetDate.toISOString()} (source: ${result.source})`);
      console.error(`Margin: ${marginSeconds}s`);

      const waitUntil = result.resetTime + marginSeconds;
      const waitDuration = waitUntil - nowSeconds();

      if (opts.dryRun) {
        if (waitDuration <= 0) {
          console.error("Dry run: would resume immediately (reset time already passed).");
        } else {
          console.error(`Dry run: would wait ${formatCountdown(waitDuration)}.`);
        }
        process.exit(0);
      }

      if (waitDuration <= 0) {
        console.error("Reset time already passed. Resuming now...");
      } else {
        // Install SIGINT handler
        let interrupted = false;
        process.on("SIGINT", () => {
          interrupted = true;
          console.error("\nInterrupted. Session remains armed for later resume.");
          process.exit(130);
        });

        const { waited } = countdownWait(result.resetTime, marginSeconds);

        if (interrupted) {
          process.exit(130);
        }

        if (!waited) {
          console.error("Reset time already passed. Resuming now...");
        }
      }

      // Resume
      const sessionTool = session.tool ?? "claude";
      if (sessionTool === "codex") {
        if (!checkCodexAvailable()) {
          console.error(
            "`codex` command not found. Make sure the Codex CLI is installed and in your PATH.",
          );
          process.exit(1);
        }
      } else {
        if (!checkClaudeAvailable()) {
          console.error(
            "`claude` command not found. Make sure the Claude Code CLI is installed and in your PATH.",
          );
          process.exit(1);
        }
      }

      const plan = buildResumePlan({
        sessionId: session.session_id,
        force: true, // Already checked armed/runs above
      });

      console.error(`Resuming session ${session.session_id}...`);
      process.exit(executeResume(plan));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`wait error: ${msg}`);
      process.exit(1);
    }
  });

// ---- resume ----
program
  .command("resume")
  .description("Resume an armed session immediately")
  .option("--latest", "Use the latest session")
  .option("--session <id>", "Use a specific session ID")
  .option("--dry-run", "Show what would happen without resuming")
  .option("--print-command", "Print the command that would be run")
  .option("--force", "Resume even if not armed or max runs exceeded")
  .option("--tool <tool>", "Tool to operate on (claude or codex)", "claude")
  .action((opts) => {
    try {
      const tool = opts.tool === "codex" ? "codex" : "claude";

      if (opts.printCommand) {
        const plan = buildResumePlan({
          sessionId: opts.session,
          force: opts.force,
          tool,
        });
        console.log(`${plan.command} ${plan.args.map((a) => `"${a}"`).join(" ")}`);
        process.exit(0);
      }

      if (opts.dryRun) {
        const plan = buildResumePlan({
          sessionId: opts.session,
          force: opts.force,
          tool,
        });
        console.error(`Would resume session ${plan.session.session_id}`);
        console.error(`Command: ${plan.command} ${plan.args.map((a) => `"${a}"`).join(" ")}`);
        console.error(`CWD: ${plan.cwd}`);
        console.error(`Runs: ${plan.session.runs_used}/${plan.session.max_runs}`);
        process.exit(0);
      }

      const plan = buildResumePlan({
        sessionId: opts.session,
        force: opts.force,
        tool,
      });

      const sessionTool = plan.session.tool ?? "claude";
      if (sessionTool === "codex") {
        if (!checkCodexAvailable()) {
          console.error(
            "`codex` command not found. Make sure the Codex CLI is installed and in your PATH.",
          );
          process.exit(1);
        }
      } else {
        if (!checkClaudeAvailable()) {
          console.error(
            "`claude` command not found. Make sure the Claude Code CLI is installed and in your PATH.",
          );
          process.exit(1);
        }
      }

      console.error(`Resuming session ${plan.session.session_id}...`);
      process.exit(executeResume(plan));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`resume error: ${msg}`);
      process.exit(1);
    }
  });

// ---- status ----
program
  .command("status")
  .description("Show current state")
  .option("--json", "Output as JSON")
  .option("--session <id>", "Show specific session")
  .option("--tool <tool>", "Tool to filter by (claude or codex)")
  .action((opts) => {
    try {
      if (opts.json) {
        const index = loadIndex();
        if (opts.session) {
          const session = index.sessions[opts.session];
          if (!session) {
            console.error(`Session ${opts.session} not found.`);
            process.exit(1);
          }
          console.log(JSON.stringify(session, null, 2));
        } else {
          console.log(JSON.stringify(index, null, 2));
        }
        process.exit(0);
      }

      const toolFilter = opts.tool === "codex" ? "codex" : opts.tool === "claude" ? "claude" : undefined;
      const session = opts.session
        ? getSession(opts.session)
        : getLatestSession(toolFilter);

      if (!session) {
        console.log("No sessions found.");
        console.log("Run Claude Code with the statusline tap enabled to create one.");
        console.log("Or use `cc-limit-resume arm --manual ...` to bootstrap.");
        process.exit(0);
      }

      console.log(`Session: ${session.session_id}`);
      console.log(`  Tool: ${session.tool ?? "claude"}`);
      console.log(`  Name: ${session.session_name ?? "(none)"}`);
      console.log(`  CWD: ${session.cwd}`);
      console.log(`  Transcript: ${session.transcript_path}`);
      console.log(`  Armed: ${session.armed ? "yes" : "no"}`);
      console.log(`  Runs: ${session.runs_used}/${session.max_runs}`);

      if (session.last_failure_at) {
        const failDate = new Date(session.last_failure_at * 1000);
        console.log(`  Last failure: ${failDate.toISOString()}`);
        console.log(`  Failure type: ${session.last_failure_error || "(unknown)"}`);
      } else {
        console.log(`  Last failure: none`);
      }

      const five = session.rate_limits?.five_hour;
      if (five) {
        console.log(`  Five-hour: ${five.used_percentage}% used`);
        if (five.resets_at) {
          console.log(`    Resets at: ${new Date(five.resets_at * 1000).toISOString()}`);
        }
      }

      const seven = session.rate_limits?.seven_day;
      if (seven) {
        console.log(`  Seven-day: ${seven.used_percentage}% used`);
        if (seven.resets_at) {
          console.log(`    Resets at: ${new Date(seven.resets_at * 1000).toISOString()}`);
        }
      }

      if (session.manual_resets_at) {
        console.log(`  Manual reset at: ${new Date(session.manual_resets_at * 1000).toISOString()}`);
      }

      if (session.armed) {
        console.log(`\nNext action: cc-limit-resume wait --session ${session.session_id}`);
      } else {
        console.log(`\nSession not armed. Run "cc-limit-resume arm --session ${session.session_id}" to arm it.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`status error: ${msg}`);
      process.exit(1);
    }
  });

// ---- cancel ----
program
  .command("cancel")
  .description("Cancel armed state of a session")
  .option("--latest", "Use the latest session")
  .option("--session <id>", "Use a specific session ID")
  .option("--tool <tool>", "Tool to operate on (claude or codex)", "claude")
  .action((opts) => {
    try {
      const tool = opts.tool === "codex" ? "codex" : "claude";
      const session = opts.session
        ? getSession(opts.session)
        : getLatestSession(tool);

      if (!session) {
        console.error("No session found.");
        process.exit(1);
      }

      setArmed(session.session_id, false);
      console.error(`Session ${session.session_id} disarmed.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`cancel error: ${msg}`);
      process.exit(1);
    }
  });

program.parse();
