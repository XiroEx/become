import { z } from 'zod';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API error ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export class SchemaValidationError extends Error {
  readonly zodError: z.ZodError;
  constructor(zodError: z.ZodError) {
    super(`Schema validation failed: ${zodError.message}`);
    this.name = 'SchemaValidationError';
    this.zodError = zodError;
  }
}

export type ApiErrorKind = 'auth' | 'client' | 'server' | 'network';

export function mapStatusToErrorKind(status: number): ApiErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status >= 400 && status < 500) return 'client';
  if (status >= 500) return 'server';
  return 'network';
}
