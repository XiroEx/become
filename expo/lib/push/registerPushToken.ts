export interface RegisterPushTokenOptions {
  token: string;
  jwt: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Max retry attempts on 5xx / network error. Default: 3. */
  maxRetries?: number;
  /** Base backoff in ms — doubled per retry. Default: 500. */
  retryDelayMs?: number;
  setTimeoutImpl?: typeof setTimeout;
}

export interface RegisterPushTokenResult {
  ok: boolean;
  attempts: number;
  lastStatus?: number;
}

/**
 * Posts the Expo push token to /api/push/subscribe with retry-on-5xx and
 * no-retry-on-4xx semantics. Returns ok=true on first 2xx, ok=false after
 * `maxRetries` exhausted.
 */
export async function registerPushToken(
  options: RegisterPushTokenOptions,
): Promise<RegisterPushTokenResult> {
  const baseUrl = options.baseUrl ?? "https://become.redbtn.io";
  const url = `${baseUrl.replace(/\/$/, "")}/api/push/subscribe`;
  const fetchImpl =
    options.fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
  if (!fetchImpl) {
    throw new Error("No fetch implementation available.");
  }
  const maxRetries = options.maxRetries ?? 3;
  const baseDelay = options.retryDelayMs ?? 500;
  const setT = options.setTimeoutImpl ?? setTimeout;

  let lastStatus: number | undefined;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.jwt}`,
        },
        body: JSON.stringify({ token: options.token }),
      });
    } catch {
      // network error — fall through to retry
      res = null;
    }
    if (res) {
      lastStatus = res.status;
      if (res.ok) {
        const result: RegisterPushTokenResult = { ok: true, attempts: attempt };
        if (lastStatus !== undefined) result.lastStatus = lastStatus;
        return result;
      }
      if (res.status >= 400 && res.status < 500) {
        // 4xx — auth / payload problem, won't get better with retry
        return { ok: false, attempts: attempt, lastStatus };
      }
    }
    if (attempt < maxRetries) {
      await new Promise<void>((resolve) =>
        setT(resolve, baseDelay * Math.pow(2, attempt - 1)),
      );
    }
  }
  const finalResult: RegisterPushTokenResult = {
    ok: false,
    attempts: maxRetries,
  };
  if (lastStatus !== undefined) finalResult.lastStatus = lastStatus;
  return finalResult;
}
