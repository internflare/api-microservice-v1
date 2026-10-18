export type LogLevel = "info" | "warn" | "error";

export function logger(
  level: LogLevel,
  message: string,
  ...details: unknown[]
): void {
  console[level](
    `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`,
    ...details,
  );
}
