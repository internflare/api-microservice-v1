export type LogLevel = "info" | "warn" | "error";

// ISO timestamps include the full date, time, and timezone for easier log correlation.
export function logger(
  level: LogLevel,
  message: string,
  ...details: unknown[]
): void {
  const timestamp = new Date().toISOString();
  console[level](`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...details);
}
