import { z } from 'zod';
import { ApiError, SchemaValidationError } from './errors';
import { appendTz, detectTimezone } from './tz';

export interface ApiFetchOptions {
  baseUrl?: string;
  getToken?: () => string | undefined | Promise<string | undefined>;
  tz?: string | undefined;
  fetchImpl?: typeof fetch;
}

export interface ApiCallInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface ApiClient {
  call: <T>(path: string, schema: z.ZodType<T>, init?: ApiCallInit) => Promise<T>;
  raw: (path: string, init?: ApiCallInit) => Promise<Response>;
}

export function createApiClient(options: ApiFetchOptions = {}): ApiClient {
  const fetchCandidate =
    options.fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
  if (!fetchCandidate) {
    throw new Error(
      'No fetch implementation available. Pass options.fetchImpl explicitly.',
    );
  }
  const fetchImpl: typeof fetch = fetchCandidate;

  async function raw(path: string, init: ApiCallInit = {}): Promise<Response> {
    const tz = options.tz ?? detectTimezone();
    const pathWithTz = appendTz(path, tz);
    const fullUrl = options.baseUrl
      ? `${options.baseUrl.replace(/\/$/, '')}${pathWithTz}`
      : pathWithTz;
    const token = options.getToken ? await options.getToken() : undefined;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(init.headers ?? {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (init.body !== undefined) {
      const raw = init.body;
      if (
        typeof raw === 'string' ||
        (typeof FormData !== 'undefined' && raw instanceof FormData) ||
        (typeof Blob !== 'undefined' && raw instanceof Blob) ||
        raw instanceof ArrayBuffer
      ) {
        body = raw as BodyInit;
      } else {
        body = JSON.stringify(raw);
        if (!('Content-Type' in headers)) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }
    const method = init.method ?? (init.body !== undefined ? 'POST' : 'GET');
    const requestInit: RequestInit = { method, headers };
    if (body !== undefined) requestInit.body = body;
    if (init.signal) requestInit.signal = init.signal;
    return fetchImpl(fullUrl, requestInit);
  }

  async function call<T>(
    path: string,
    schema: z.ZodType<T>,
    init: ApiCallInit = {},
  ): Promise<T> {
    const response = await raw(path, init);
    let body: unknown = undefined;
    const text = await response.text();
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!response.ok) {
      throw new ApiError(response.status, body);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new SchemaValidationError(parsed.error);
    }
    return parsed.data;
  }

  return { call, raw };
}

export async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  init: ApiCallInit & ApiFetchOptions = {},
): Promise<T> {
  const { method, body, headers, signal, ...clientOpts } = init;
  const client = createApiClient(clientOpts);
  const callInit: ApiCallInit = {};
  if (method !== undefined) callInit.method = method;
  if (body !== undefined) callInit.body = body;
  if (headers !== undefined) callInit.headers = headers;
  if (signal !== undefined) callInit.signal = signal;
  return client.call(path, schema, callInit);
}
