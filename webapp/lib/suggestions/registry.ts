// In-memory suggestion-source registry. Process-singleton, server-only.
// Concrete sources call registerSource() at module load; the engine reads
// listSources() and fans out per request.

import type {
  RegisteredSource,
  SuggestionDomain,
  SuggestionSourceFn,
} from './types'

const sources = new Map<string, RegisteredSource>()

export function registerSource(
  id: string,
  domain: SuggestionDomain,
  run: SuggestionSourceFn,
): void {
  if (sources.has(id)) {
    throw new Error(`Suggestion source "${id}" is already registered`)
  }
  sources.set(id, { id, domain, run })
}

export function listSources(): RegisteredSource[] {
  return Array.from(sources.values())
}

export function listSourcesForDomain(
  domain: SuggestionDomain,
): RegisteredSource[] {
  return listSources().filter((s) => s.domain === domain)
}

// Test-only.
export function __resetSourceRegistryForTest(): void {
  sources.clear()
}
