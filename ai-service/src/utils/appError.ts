// Expected, client-safe failure carrying an HTTP status code.
class AppError extends Error {
  public statusCode: number;
  public isOperational = true;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

export { AppError };
