# cc-limit-resume

Explicit, one-shot Claude Code rate-limit resume helper.

## What this does

When you hit a rate limit in Claude Code, `cc-limit-resume` lets you:

1. **Arm** the session (marks it for one-shot resume).
2. **Wait** until the reported reset time plus a safety margin.
3. **Resume** the session using `claude --resume <session-id>` (interactive, subscription billing) or `claude --resume <session-id> -p <resume-prompt>` (headless, API/Agent SDK billing).

It stores minimal local state under `~/.local/state/cc-limit-resume/` (or `~/Library/Application Support/cc-limit-resume/` on macOS).

## What this deliberately does not do

- Does **not** alias or wrap the `claude` command globally.
- Does **not** monitor arbitrary tmux panes.
- Does **not** inject keystrokes into terminals.
- Does **not** run a hidden background daemon.
- Does **not** bypass, evade, or circumvent Anthropic/Claude rate limits.
- Does **not** auto-retry. You must explicitly run `cc-limit-resume wait`.
- Does **not** restore interrupted subprocesses or subagents — it resumes from transcript and repository state.
- Does **not** send telemetry, analytics, or network requests.

## Billing and quota

By default, `cc-limit-resume` resumes Claude Code in **interactive mode** (`claude --resume <id>`), which draws from your **subscription usage pool** (Max / Pro / Team). This is usually what you want.

Use `--headless` on `arm`, `wait`, or `resume` to switch to **headless mode** (`claude --resume <id> -p <prompt>`), which draws from the **Agent SDK credit pool** or **API key billing**.

| Mode | Command | Billing |
|------|---------|---------|
| Default (interactive) | `claude --resume <id>` | Subscription usage pool (Max/Pro/Team) |
| `--headless` | `claude --resume <id> -p <prompt>` | Agent SDK credits or API pay-per-token |

**API key warning:** If `ANTHROPIC_API_KEY` is set in your environment, it overrides your subscription — all usage bills per-token regardless of mode. `cc-limit-resume` will warn you when this is detected. Unset `ANTHROPIC_API_KEY` to use your subscription quota, or pass `--headless` to suppress the warning.

Codex CLI resumes (`--tool codex`) are unaffected by this setting.

## First to Use

Requirements: Node.js >= 20.

```bash
npx cc-limit-resume status
```

## Usage flow

### 1. Wire up the statusline tap (one-time setup)

Add this to your `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Statusline": {
      "command": "cc-limit-resume tap-statusline",
      "matcher": ""
    }
  }
}
```

This pipes Claude Code statusline JSON into `cc-limit-resume` each time the statusline updates, capturing session metadata and rate-limit percentages.

### 2. Wire up the StopFailure hook (one-time setup)

Add this to the same hooks section:

```json
{
  "hooks": {
    "StopFailure": {
      "command": "cc-limit-resume log-stop-failure",
      "matcher": ""
    }
  }
}
```

This records rate-limit and other stop failures automatically.

### 2a. Wire up Codex Stop hook (for Codex CLI users)

If you use Codex CLI, install the [Codex plugin](#codex-cli-plugin) and add this to `~/.codex/hooks.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "cc-limit-resume tap-codex-stop",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

Enable hooks with `codex features enable codex_hooks`. See the plugin installation section for full Codex setup.

### 3. Arm the session

When you know you're about to be rate-limited, or immediately after a rate-limit stop:

```bash
cc-limit-resume arm --latest
```

Or from within Claude Code, use the `/limit-resume-arm` skill (if the plugin is installed).

### 4. Wait and resume

After arming, run:

```bash
cc-limit-resume wait --latest
```

This will:
- Display the inferred reset time.
- Show a countdown (updates every 30 seconds).
- Wait until reset time + 60-second margin.
- Then automatically run `claude --resume <session-id>` (interactive, subscription billing by default; use `--headless` for API/Agent SDK mode).

### 5. Manual bootstrap (if no statusline data)

```bash
cc-limit-resume arm --manual \
  --session <session-id> \
  --cwd /path/to/repo \
  --transcript-path ~/.claude/projects/.../abc123.jsonl \
  --reset "2026-05-22 13:50 UTC"
```

## Commands

| Command | Description |
|---------|-------------|
| `cc-limit-resume tap-statusline` | Read statusline JSON from stdin, update state |
| `cc-limit-resume log-stop-failure` | Read StopFailure hook JSON from stdin, update state |
| `cc-limit-resume arm --latest` | Mark latest session as armed for one-shot resume |
| `cc-limit-resume arm --session <id>` | Arm a specific session |
| `cc-limit-resume arm --manual ...` | Bootstrap a session manually |
| `cc-limit-resume arm --latest --headless` | Arm with headless/API billing mode |
| `cc-limit-resume arm --latest --tool codex` | Arm a Codex CLI session |
| `cc-limit-resume wait --latest` | Wait for reset time then resume |
| `cc-limit-resume wait --latest --dry-run` | Show what would happen without waiting |
| `cc-limit-resume wait --latest --reset "<time>"` | Override the inferred reset time |
| `cc-limit-resume wait --latest --margin-seconds 120` | Use a larger safety margin |
| `cc-limit-resume wait --latest --headless` | Resume in headless/API billing mode |
| `cc-limit-resume resume --latest` | Resume immediately without waiting |
| `cc-limit-resume resume --latest --print-command` | Print the claude command that would run |
| `cc-limit-resume resume --latest --dry-run` | Show plan without executing |
| `cc-limit-resume resume --latest --headless` | Resume in headless/API billing mode |
| `cc-limit-resume status` | Show current state |
| `cc-limit-resume status --json` | Show state as JSON |
| `cc-limit-resume status --tool codex` | Show only Codex sessions |
| `cc-limit-resume cancel --latest` | Disarm the latest session |

## Plugin installation

### From npm (recommended)

After installing the CLI globally, symlink the bundled plugin:

```bash
ln -s "$(npm root -g)/cc-limit-resume/claude-plugin" ~/.claude/plugins/cc-limit-resume
```

### From source

```bash
ln -s "$(pwd)/claude-plugin" ~/.claude/plugins/cc-limit-resume
```

The plugin provides:
- A `/limit-resume-arm` skill to arm sessions from within Claude Code.
- A StopFailure hook to automatically log failures.

### Codex CLI plugin

The Codex plugin provides `--tool codex` session tracking and `codex exec resume` support. It requires explicit hook setup since Codex does not currently support plugin-bundled hooks.

**Step 1: Install the Codex plugin**

```bash
# From npm
ln -s "$(npm root -g)/cc-limit-resume/codex-plugin" ~/.codex/plugins/cc-limit-resume

# From source
ln -s "$(pwd)/codex-plugin" ~/.codex/plugins/cc-limit-resume
```

**Step 2: Enable hooks in Codex**

```bash
codex features enable codex_hooks
```

Or add to `~/.codex/config.toml`:

```toml
[features]
codex_hooks = true
```

**Step 3: Add the Stop hook**

Add this to `~/.codex/hooks.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "cc-limit-resume tap-codex-stop",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

This Stop hook fires when Codex finishes a turn (including rate-limit stops). `cc-limit-resume` parses the assistant message text for rate-limit indicators and records the session state for later resume.

**Step 4: Verify**

```bash
cc-limit-resume status --tool codex
```

**Codex resume flow:**

```bash
# Arm the latest Codex session
cc-limit-resume arm --latest --tool codex

# Wait for reset then resume via codex exec resume
cc-limit-resume wait --latest --tool codex

# Or resume immediately
cc-limit-resume resume --latest --tool codex
```

The Codex resume command runs `codex exec --skip-git-repo-check resume <session_id> <prompt>`. The original session's model, sandbox mode, and approval settings are inherited.

**Known Codex limitations:**

- Codex does not support plugin-bundled hooks; the Stop hook must be manually added to `~/.codex/hooks.json`.
- Codex Stop hook payloads do not include dedicated `stop_reason` or `error` fields. Rate-limit detection parses `last_assistant_message` text for keywords ("rate limit", "message limit", "quota exceeded", "try again in", etc.). This is best-effort and may miss edge cases.
- There is a [known Codex bug](https://github.com/openai/codex/issues/8310) where resuming after a rate limit may lose task context. Consider creating a `SESSION_HANDOFF.md` checkpoint file before hitting limits.
- `codex exec resume` only supports headless mode (no interactive TUI resume from automation). Interactive resume via `codex resume` is not supported by this tool.

## Development

```bash
pnpm install
pnpm test          # Run tests
pnpm build         # Build distributable CLI
pnpm dev <cmd>     # Run CLI via tsx (no build needed)
```

## Troubleshooting

**"No session found"**
Run Claude Code at least once with the statusline tap enabled, or use `cc-limit-resume arm --manual ...`.

**"Session not armed"**
Run `cc-limit-resume arm --latest` before `wait` or `resume`.

**"Cannot infer reset time"**
Provide it explicitly: `cc-limit-resume wait --latest --reset "2026-05-22 13:50 UTC"`.

The reset time can be:
- Unix epoch seconds: `1779443400`
- ISO 8601: `2026-05-22T13:50:00Z`
- Human string: `2026-05-22 13:50 UTC`

**"claude command not found"**
Make sure Claude Code CLI is installed and in your PATH.

## State location

- **Linux**: `~/.local/state/cc-limit-resume/index.json` (respects `$XDG_STATE_HOME`)
- **macOS**: `~/Library/Application Support/cc-limit-resume/index.json`

State is stored as plain JSON. No database. No daemon. To reset everything, delete the directory.

## Security model

- All state is local to your machine.
- No network calls are made.
- No telemetry or analytics.
- State files are written with mode `0600`.
- Atomic writes (temp file + rename) prevent corruption.
- Corrupt state is backed up as `index.corrupt.<timestamp>.json` rather than crashing.
- The tool calls `claude --resume` with your exact session ID and prompt — it never modifies or reads your API keys.
- It does read `ANTHROPIC_API_KEY` from the environment to warn you when resume would bypass your subscription billing.

## Limitations

- Cannot restore interrupted subprocesses or subagents.
- Resume starts from transcript and repository state, not exact terminal state.
- Requires manual setup of statusline/StopFailure hooks.
- Only supports one active armed session at a time (the "latest" model).
- The wait command blocks the terminal during countdown (Ctrl+C to cancel).
- Default interactive resume opens a new interactive Claude Code session — not suitable for fully unattended/headless environments (use `--headless` for those).
- Codex rate-limit detection is best-effort: the Codex Stop hook does not include dedicated error/stop_reason fields, so we parse the assistant message text for rate-limit keywords. Unusual phrasings may be missed.
- Codex does not support plugin-bundled hooks; its Stop hook must be installed manually into `~/.codex/hooks.json`.
- `codex exec resume` inherits the original session's model, sandbox, and approval settings — you cannot override them on resume.

## License

MIT
