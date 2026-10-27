/** Errors that are safe to show to the caller. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what = 'Resource') => new AppError('not_found', `${what} not found`, 404);
export const forbidden = (message = 'You do not have permission to do that') =>
  new AppError('forbidden', message, 403);
export const unauthenticated = () => new AppError('unauthenticated', 'Please sign in to continue', 401);
export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(code, message, 409, details);
export const invalid = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(code, message, 422, details);
export const tooMany = (message = 'Too many attempts. Please wait a few minutes and try again.') =>
  new AppError('rate_limited', message, 429);

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
