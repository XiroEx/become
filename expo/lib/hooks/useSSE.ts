import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimum EventSource-like contract. React Native doesn't ship one natively;
 * consumers pick a polyfill (e.g. `react-native-sse`) and pass a factory.
 * The hook stays portable + jest-mockable behind this interface.
 */
export interface EventSourceLike {
  addEventListener: (
    type: "open" | "message" | "error" | "close",
    listener: (event: { data?: string }) => void,
  ) => void;
  removeEventListener: (
    type: "open" | "message" | "error" | "close",
    listener: (event: { data?: string }) => void,
  ) => void;
  close: () => void;
}

export type EventSourceFactory = (url: string) => EventSourceLike;

export interface UseSSEOptions<TMessage> {
  factory?: EventSourceFactory;
  /** Parses a raw message string into a typed payload. Default: JSON.parse. */
  parse?: (raw: string) => TMessage;
  onMessage?: (message: TMessage) => void;
  onError?: (error: unknown) => void;
  /** Disable auto-reconnect (default: enabled with exponential backoff). */
  noReconnect?: boolean;
  /** Initial reconnect delay in ms. Doubles each failure up to `maxBackoffMs`. */
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  /** Inject a custom timer for tests. Default: globalThis.setTimeout. */
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

export interface UseSSEResult<TMessage> {
  messages: TMessage[];
  connected: boolean;
  error: unknown;
  close: () => void;
  reconnect: () => void;
}

export function useSSE<TMessage>(
  url: string | null,
  options: UseSSEOptions<TMessage> = {},
): UseSSEResult<TMessage> {
  const [messages, setMessages] = useState<TMessage[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [error, setError] = useState<unknown>(null);
  const esRef = useRef<EventSourceLike | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef<number>(options.initialBackoffMs ?? 500);
  const closedManuallyRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);
  const optsRef = useRef(options);
  // connectRef holds the latest `connect` so the timer callback inside onError
  // / onClose can recurse without a forward reference. Mutated only in an
  // effect (refs must not be written during render).
  const connectRef = useRef<() => void>(() => {
    /* assigned below */
  });

  useEffect(() => {
    optsRef.current = options;
  });

  const connect = useCallback((): void => {
    if (!url) return;
    const opts = optsRef.current;
    if (!opts.factory) return;
    closedManuallyRef.current = false;

    const es = opts.factory(url);
    esRef.current = es;
    setError(null);

    const onOpen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      backoffRef.current = opts.initialBackoffMs ?? 500;
    };
    const onMessage = (event: { data?: string }) => {
      if (!mountedRef.current) return;
      try {
        const raw = event.data ?? "";
        const parse = opts.parse ?? ((s: string) => JSON.parse(s) as TMessage);
        const parsed = parse(raw);
        setMessages((prev) => [...prev, parsed]);
        opts.onMessage?.(parsed);
      } catch (parseErr) {
        setError(parseErr);
        opts.onError?.(parseErr);
      }
    };
    const scheduleReconnect = (): void => {
      const delay = backoffRef.current;
      const max = opts.maxBackoffMs ?? 30000;
      backoffRef.current = Math.min(delay * 2, max);
      const setT = opts.setTimeoutImpl ?? setTimeout;
      timerRef.current = setT(() => {
        if (!mountedRef.current) return;
        connectRef.current();
      }, delay);
    };
    const onError = (event: unknown) => {
      if (!mountedRef.current) return;
      setError(event);
      opts.onError?.(event);
      setConnected(false);
      if (opts.noReconnect || closedManuallyRef.current) return;
      scheduleReconnect();
    };
    const onClose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      if (opts.noReconnect || closedManuallyRef.current) return;
      scheduleReconnect();
    };

    es.addEventListener("open", onOpen);
    es.addEventListener("message", onMessage);
    es.addEventListener("error", onError);
    es.addEventListener("close", onClose);
  }, [url]);

  // Keep the recursion-target ref pointed at the current `connect`.
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const close = useCallback((): void => {
    closedManuallyRef.current = true;
    const clearT = optsRef.current.clearTimeoutImpl ?? clearTimeout;
    if (timerRef.current) {
      clearT(timerRef.current);
      timerRef.current = null;
    }
    esRef.current?.close();
    esRef.current = null;
    setConnected(false);
  }, []);

  const reconnect = useCallback((): void => {
    close();
    closedManuallyRef.current = false;
    backoffRef.current = optsRef.current.initialBackoffMs ?? 500;
    connect();
  }, [close, connect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      const clearT = optsRef.current.clearTimeoutImpl ?? clearTimeout;
      if (timerRef.current) {
        clearT(timerRef.current);
        timerRef.current = null;
      }
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);

  return { messages, connected, error, close, reconnect };
}
