import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@become/api-client";
import { MeResponseSchema, type User } from "@become/api-client";
import {
  secureTokenStore,
  type TokenStore,
} from "@/lib/auth/secureStoreToken";

export interface UseAuthOptions {
  store?: TokenStore;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface UseAuthResult {
  user: User | null;
  token: string | null;
  loading: boolean;
  isAuthed: boolean;
  setToken: (value: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(options: UseAuthOptions = {}): UseAuthResult {
  const store = options.store ?? secureTokenStore;
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const mountedRef = useRef<boolean>(true);

  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchMe = useCallback(
    async (jwt: string): Promise<User | null> => {
      try {
        const opts = optsRef.current;
        const init: Parameters<typeof apiFetch>[2] = {
          method: "GET",
          getToken: () => jwt,
        };
        if (opts.baseUrl !== undefined) init.baseUrl = opts.baseUrl;
        if (opts.fetchImpl !== undefined) init.fetchImpl = opts.fetchImpl;
        const result = await apiFetch("/api/auth/me", MeResponseSchema, init);
        return result.user;
      } catch {
        return null;
      }
    },
    [],
  );

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    const stored = await store.get();
    if (!stored) {
      if (!mountedRef.current) return;
      setTokenState(null);
      setUser(null);
      setLoading(false);
      return;
    }
    const me = await fetchMe(stored);
    if (!mountedRef.current) return;
    if (me) {
      setTokenState(stored);
      setUser(me);
    } else {
      // Token is stale → drop it.
      await store.clear();
      setTokenState(null);
      setUser(null);
    }
    setLoading(false);
  }, [store, fetchMe]);

  const setToken = useCallback(
    async (value: string | null): Promise<void> => {
      if (value === null) {
        await store.clear();
        if (!mountedRef.current) return;
        setTokenState(null);
        setUser(null);
        return;
      }
      await store.set(value);
      const me = await fetchMe(value);
      if (!mountedRef.current) return;
      setTokenState(value);
      setUser(me);
    },
    [store, fetchMe],
  );

  const logout = useCallback(async (): Promise<void> => {
    await store.clear();
    if (!mountedRef.current) return;
    setTokenState(null);
    setUser(null);
  }, [store]);

  useEffect(() => {
    // Mount-time hydration from SecureStore — canonical data-fetch pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return {
    user,
    token,
    loading,
    isAuthed: !!token && !!user,
    setToken,
    refresh,
    logout,
  };
}
