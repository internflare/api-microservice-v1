import type { RequestHandler } from "express";
import { config } from "../config.js";
import { AppError } from "../utils/appError.js";

interface AuthSession {
  user?: {
    id?: string;
    email?: string;
    name?: string;
  };
}

async function authenticate(request: Parameters<RequestHandler>[0]): Promise<void> {
  const cookie = request.headers.cookie;
  const authorization = request.headers.authorization;
  if (!cookie && !authorization) {
    throw new AppError("Authentication is required", 401);
  }

  try {
    const response = await fetch(
      new URL("/api/auth/get-session", config.authServiceUrl),
      {
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(authorization ? { authorization } : {}),
        },
        signal: AbortSignal.timeout(5_000),
      },
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new AppError("Authentication is required", 401);
      }
      throw new AppError("Authentication service is unavailable", 503);
    }

    const session = (await response.json()) as AuthSession | null;
    if (!session?.user?.id) {
      throw new AppError("Authentication is required", 401);
    }

    request.user = {
      id: session.user.id,
      ...(session.user.email ? { email: session.user.email } : {}),
      ...(session.user.name ? { name: session.user.name } : {}),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      error instanceof Error && error.name === "TimeoutError"
        ? "Authentication service timed out"
        : "Authentication service is unavailable",
      503,
    );
  }
}

export const requireAuth: RequestHandler = async (request, _response, next) => {
  try {
    await authenticate(request);
    next();
  } catch (error) {
    next(error);
  }
};

export const optionalAuth: RequestHandler = async (request, _response, next) => {
  if (!request.headers.cookie && !request.headers.authorization) {
    next();
    return;
  }

  try {
    await authenticate(request);
    next();
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401) {
      next();
      return;
    }
    next(error);
  }
};
