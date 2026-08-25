"use client";

import { useEffect, useRef, useState } from "react";
import { X, Search, UserPlus, Loader2 } from "lucide-react";

interface Member {
  id: string;
  name?: string;
  email?: string;
}

interface ShareProgramModalProps {
  programId: string;
  programName: string;
  onClose: () => void;
}

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function ShareProgramModal({ programId, programName, onClose }: ShareProgramModalProps) {
  const [shared, setShared] = useState<Member[]>([]);
  const [loadingShared, setLoadingShared] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadShared = async () => {
    setLoadingShared(true);
    try {
      const res = await fetch(`/api/programs/${programId}/share`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setShared(Array.isArray(data.sharedWith) ? data.sharedWith : []);
      }
    } catch {
      // best-effort
    } finally {
      setLoadingShared(false);
    }
  };

  useEffect(() => {
    loadShared();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId]);

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    searchRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/programs/share-candidates?q=${encodeURIComponent(q)}`, {
          headers: authHeaders(),
        });
        const data = res.ok ? await res.json() : { members: [] };
        setResults(Array.isArray(data.members) ? data.members : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (searchRef.current) clearTimeout(searchRef.current);
    };
  }, [query]);

  const shareWith = async (member: Member) => {
    setAddingId(member.id);
    setError(null);
    try {
      const res = await fetch(`/api/programs/${programId}/share`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ userIds: [member.id] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to share");
      }
      const data = await res.json();
      setShared(Array.isArray(data.sharedWith) ? data.sharedWith : []);
      setQuery("");
      setResults([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to share");
    } finally {
      setAddingId(null);
    }
  };

  const unshare = async (userId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/programs/${programId}/share`, {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove");
      }
      const data = await res.json();
      setShared(Array.isArray(data.sharedWith) ? data.sharedWith : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove");
    }
  };

  const sharedIds = new Set(shared.map((m) => m.id));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 dark:bg-zinc-900 sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Share program</h2>
            <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">{programName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members by name or email"
            className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-9 pr-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          />
        </div>

        {(searching || results.length > 0) && (
          <div className="mb-4 space-y-1">
            {searching && <p className="px-1 py-1 text-xs text-zinc-400">Searching…</p>}
            {results
              .filter((m) => !sharedIds.has(m.id))
              .map((m) => (
                <button
                  key={m.id}
                  onClick={() => shareWith(m)}
                  disabled={adding === m.id}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-zinc-900 dark:text-white">
                      {m.name || "Unnamed"}
                    </span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{m.email}</span>
                  </span>
                  {adding === m.id ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-400" />
                  ) : (
                    <UserPlus className="h-4 w-4 shrink-0 text-zinc-400" />
                  )}
                </button>
              ))}
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Shared with
          </p>
          {loadingShared ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
          ) : shared.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Not shared with anyone yet.</p>
          ) : (
            <div className="space-y-1">
              {shared.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-zinc-900 dark:text-white">
                      {m.name || "Unnamed"}
                    </span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{m.email}</span>
                  </span>
                  <button
                    onClick={() => unshare(m.id)}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
