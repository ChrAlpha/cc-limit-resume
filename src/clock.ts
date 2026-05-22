import { execSync } from "node:child_process";

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function formatCountdown(totalSeconds: number): string {
  const abs = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const seconds = abs % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

export function sleepSeconds(seconds: number): void {
  execSync(`sleep ${Math.max(0, seconds)}`, { stdio: "ignore" });
}

export function countdownWait(
  targetEpochSeconds: number,
  marginSeconds: number,
  { onTick }: { onTick?: (remaining: number) => void } = {},
): { waited: boolean } {
  const target = targetEpochSeconds + marginSeconds;
  let remaining = target - nowSeconds();

  if (remaining <= 0) {
    return { waited: false };
  }

  console.error(`Waiting ${formatCountdown(remaining)} until ${new Date(target * 1000).toISOString()}`);
  onTick?.(remaining);

  while (remaining > 0) {
    // Sleep 1 second at a time for responsive interrupt handling
    sleepSeconds(1);
    remaining = target - nowSeconds();
    if (remaining <= 0) break;

    // Print countdown every 30 seconds
    if (remaining % 30 === 0) {
      console.error(`  ${formatCountdown(remaining)} remaining...`);
      onTick?.(remaining);
    }
  }

  return { waited: true };
}
