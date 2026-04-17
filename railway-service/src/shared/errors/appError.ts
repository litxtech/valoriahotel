export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(args: { code: string; message: string; statusCode: number; details?: Record<string, unknown> }) {
    super(args.message);
    this.code = args.code;
    this.statusCode = args.statusCode;
    this.details = args.details;
  }
}

export const Errors = {
  unauthorized: (message = 'Unauthorized') => new AppError({ code: 'UNAUTHORIZED', message, statusCode: 401 }),
  forbidden: (message = 'Forbidden') => new AppError({ code: 'FORBIDDEN', message, statusCode: 403 }),
  badRequest: (message = 'Bad Request', details?: Record<string, unknown>) =>
    details
      ? new AppError({ code: 'BAD_REQUEST', message, statusCode: 400, details })
      : new AppError({ code: 'BAD_REQUEST', message, statusCode: 400 }),
  notFound: (message = 'Not Found') => new AppError({ code: 'NOT_FOUND', message, statusCode: 404 }),
  conflict: (message = 'Conflict') => new AppError({ code: 'CONFLICT', message, statusCode: 409 }),
  internal: (message = 'Internal Server Error') => new AppError({ code: 'INTERNAL', message, statusCode: 500 })
};

