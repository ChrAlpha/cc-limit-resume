import { homedir, platform } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

export function getStateDir(): string {
  if (platform() === "darwin") {
    const dir = join(homedir(), "Library", "Application Support", "cc-limit-resume");
    mkdirSync(dir, { recursive: true });
    return dir;
  }
  const xdg = process.env.XDG_STATE_HOME;
  const dir = xdg
    ? join(xdg, "cc-limit-resume")
    : join(homedir(), ".local", "state", "cc-limit-resume");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getIndexPath(): string {
  return join(getStateDir(), "index.json");
}
