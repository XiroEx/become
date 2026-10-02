import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

export interface ItemLayout {
  y: number;
  height: number;
}

export interface UseSingleVideoPlayerOptions {
  /** Optional callback fired when an active video is released. */
  onRelease?: (slug: string) => void;
  /** Extra vertical padding (in px) beyond viewport bounds before considering an item offscreen. Defaults to 0. */
  offscreenThreshold?: number;
}

export interface SingleVideoPlayerState {
  /** Slug of the currently playing video in the list, or null if none is playing. */
  activeSlug: string | null;
  /** Set or clear the actively playing video slug. */
  setActiveSlug: (slug: string | null) => void;
  /** Play the specified video, releasing any previously playing video so only one demo plays at a time. */
  play: (slug: string) => void;
  /** Pause/release playback for the given slug, or all if no slug provided. */
  pause: (slug?: string) => void;
  /** Release the active video player. */
  release: () => void;
  /** Toggle play/release for the given slug. */
  toggle: (slug: string) => void;
  /** Check if the given slug is currently playing. */
  isPlaying: (slug: string) => boolean;
  /** Register layout bounds (y and height in scroll coordinates) for an item. */
  registerLayout: (slug: string, layout: ItemLayout) => void;
  /** Unregister layout when an item unmounts. */
  unregisterLayout: (slug: string) => void;
  /** Scroll handler to attach to ScrollView. Releases player when it scrolls off screen. */
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Check visibility manually against scroll position and viewport height. */
  checkOffscreen: (scrollY: number, viewportHeight: number) => boolean;
  /** Total number of currently playing videos (at most 1). */
  playingCount: number;
}

/**
 * Hook to manage video demo playback in lists (Program previews, swap sheets, exercise lists).
 *
 * Guarantees:
 * 1. Only ONE demo plays at a time in any list — starting playback for one item
 *    immediately deactivates and releases any other item.
 * 2. Releases players that scroll off screen, avoiding decoder exhaustion and maintaining
 *    60fps scroll performance.
 */
export function useSingleVideoPlayer(
  options: UseSingleVideoPlayerOptions = {},
): SingleVideoPlayerState {
  const { onRelease, offscreenThreshold = 0 } = options;
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const layoutsRef = useRef<Record<string, ItemLayout>>({});
  const activeSlugRef = useRef<string | null>(activeSlug);

  React.useEffect(() => {
    activeSlugRef.current = activeSlug;
  }, [activeSlug]);

  const release = useCallback(() => {
    const prev = activeSlugRef.current;
    if (prev) {
      setActiveSlug(null);
      onRelease?.(prev);
    }
  }, [onRelease]);

  const play = useCallback((slug: string) => {
    setActiveSlug(slug);
  }, []);

  const pause = useCallback(
    (slug?: string) => {
      if (!slug || activeSlugRef.current === slug) {
        release();
      }
    },
    [release],
  );

  const toggle = useCallback(
    (slug: string) => {
      if (activeSlugRef.current === slug) {
        release();
      } else {
        play(slug);
      }
    },
    [play, release],
  );

  const isPlaying = useCallback(
    (slug: string) => activeSlug === slug,
    [activeSlug],
  );

  const registerLayout = useCallback((slug: string, layout: ItemLayout) => {
    layoutsRef.current[slug] = layout;
  }, []);

  const unregisterLayout = useCallback((slug: string) => {
    delete layoutsRef.current[slug];
  }, []);

  const checkOffscreen = useCallback(
    (scrollY: number, viewportHeight: number): boolean => {
      const current = activeSlugRef.current;
      if (!current) return false;

      const layout = layoutsRef.current[current];
      if (!layout) return false;

      const itemTop = layout.y;
      const itemBottom = layout.y + layout.height;
      const viewportTop = scrollY - offscreenThreshold;
      const viewportBottom = scrollY + viewportHeight + offscreenThreshold;

      // Offscreen if item is completely above or completely below viewport
      const isOff = itemBottom < viewportTop || itemTop > viewportBottom;
      if (isOff) {
        release();
        return true;
      }
      return false;
    },
    [offscreenThreshold, release],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement } = e.nativeEvent;
      checkOffscreen(contentOffset.y, layoutMeasurement.height);
    },
    [checkOffscreen],
  );

  return {
    activeSlug,
    setActiveSlug,
    play,
    pause,
    release,
    toggle,
    isPlaying,
    registerLayout,
    unregisterLayout,
    onScroll,
    checkOffscreen,
    playingCount: activeSlug !== null ? 1 : 0,
  };
}

const SingleVideoPlayerContext = createContext<SingleVideoPlayerState | null>(null);

export function SingleVideoPlayerProvider({
  children,
  options,
}: {
  children: React.ReactNode;
  options?: UseSingleVideoPlayerOptions;
}) {
  const value = useSingleVideoPlayer(options);
  return (
    <SingleVideoPlayerContext.Provider value={value}>
      {children}
    </SingleVideoPlayerContext.Provider>
  );
}

export function useSingleVideoPlayerContext(): SingleVideoPlayerState | null {
  return useContext(SingleVideoPlayerContext);
}
