# cc-limit-resume

Explicit, one-shot Claude Code rate-limit resume helper.

## What this does

When you hit a rate limit in Claude Code, `cc-limit-resume` lets you:

1. **Arm** the session (marks it for one-shot resume).
2. **Wait** until the reported reset time plus a safety margin.
3. **Resume** the session automatically using `claude --resume <session-id> -p <resume-prompt>`.

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

## Install from source

Requirements: Node.js >= 20, pnpm.

```bash
git clone https://github.com/user/cc-limit-resume.git
cd cc-limit-resume
pnpm install
pnpm build

# Optional: link globally so `cc-limit-resume` is available from anywhere
pnpm link --global
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
- Then automatically run `claude --resume <session-id> -p <resume-prompt>`.

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
| `cc-limit-resume wait --latest` | Wait for reset time then resume |
| `cc-limit-resume wait --latest --dry-run` | Show what would happen without waiting |
| `cc-limit-resume wait --latest --reset "<time>"` | Override the inferred reset time |
| `cc-limit-resume wait --latest --margin-seconds 120` | Use a larger safety margin |
| `cc-limit-resume resume --latest` | Resume immediately without waiting |
| `cc-limit-resume resume --latest --print-command` | Print the claude command that would run |
| `cc-limit-resume resume --latest --dry-run` | Show plan without executing |
| `cc-limit-resume status` | Show current state |
| `cc-limit-resume status --json` | Show state as JSON |
| `cc-limit-resume cancel --latest` | Disarm the latest session |

## Plugin installation

Copy or symlink the plugin into your Claude Code plugins directory:

```bash
# Link the plugin
ln -s "$(pwd)/claude-plugin" ~/.claude/plugins/cc-limit-resume
```

Or install via Claude Code plugin registry once available.

The plugin provides:
- A `/limit-resume-arm` skill to arm sessions from within Claude Code.
- A StopFailure hook to automatically log failures.

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

## Limitations

- Cannot restore interrupted subprocesses or subagents.
- Resume starts from transcript and repository state, not exact terminal state.
- Requires manual setup of statusline/StopFailure hooks.
- Only supports one active armed session at a time (the "latest" model).
- The wait command blocks the terminal during countdown (Ctrl+C to cancel).

## License

MIT
