import { useEffect, useState } from "react";

/**
 * Returns a value that updates `delayMs` after the input value stops changing.
 * Used to debounce search box input before firing an API request.
 *
 * The timer impls are injectable for jest tests that prefer not to use
 * `jest.useFakeTimers()`.
 */
export function useDebouncedValue<T>(
  value: T,
  delayMs: number,
  setTimeoutImpl: typeof setTimeout = setTimeout,
  clearTimeoutImpl: typeof clearTimeout = clearTimeout,
): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeoutImpl(() => {
      setDebounced(value);
    }, delayMs);
    return () => clearTimeoutImpl(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delayMs]);

  return debounced;
}
