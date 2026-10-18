export type LogLevel = "info" | "warn" | "error";

// ISO timestamps make logs sortable and comparable across service instances.
export function logger(level: LogLevel, message: string, ...details: unknown[]): void {
  console[level](`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`, ...details);
}
