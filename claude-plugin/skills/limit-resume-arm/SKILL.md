# limit-resume-arm

Arm the current Claude Code session for explicit one-shot resume after a rate-limit reset.

## When to use

You are about to be rate-limited (or were just rate-limited and Claude Code asked you to try again later).

## What it does

Marks the current session in `cc-limit-resume` local state so it can be explicitly resumed later via:

```
cc-limit-resume arm --latest --max-runs 1
```

## Important

This tool:

- Does **not** start a daemon or background process.
- Does **not** inject terminal input or keystrokes.
- Does **not** bypass, evade, or circumvent Anthropic rate limits.
- Does **not** automatically retry; the user must explicitly run the wait/resume command.
- Waits until the reset time reported by the Claude Code statusline plus a safety margin.
- Resumes by calling the official `claude --resume <session-id> -p <resume-prompt>`.
- Cannot restore interrupted subprocesses or subagents; it resumes from transcript and repository state.

## Instructions

1. Run the following shell command to arm the latest session:

```bash
cc-limit-resume arm --latest --max-runs 1
```

2. Tell the user to run the following command once the rate limit resets (or immediately if they prefer to wait):

```bash
cc-limit-resume wait --latest
```

3. Explain that `cc-limit-resume wait` will:
   - Display the inferred reset time and countdown.
   - Wait until the reset time plus a 60-second margin.
   - Then automatically call `claude --resume <session-id> -p <resume-prompt>`.

4. If the user needs to cancel the armed state:

```bash
cc-limit-resume cancel --latest
```
