import { useEffect, useMemo, useState } from "react";
import { Text } from "@/components/Text";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";

const WORD_MS = 360;

// Extra beat after a word, by its trailing punctuation — a full stop / ellipsis
// lands harder than a comma, a comma harder than nothing.
function pauseAfter(word: string): number {
  if (/[.…!?]+["”'’)]?$/.test(word)) return 650;
  if (/[,;:]+["”'’)]?$/.test(word)) return 340;
  return 0;
}

export interface RevealTextProps {
  text: string;
  onComplete?: () => void;
  className?: string;
  /** Multiplier on every delay — >1 reveals more slowly (e.g. 4 = 4× slower). */
  speed?: number;
  testID?: string;
}

export function RevealText({
  text,
  onComplete,
  className = "",
  speed = 1,
  testID,
}: RevealTextProps): React.JSX.Element {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(() => (reduced ? words.length : 0));

  // Restart the reveal if the line changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prop update resets reveal
    setShown(reduced ? words.length : 0);
    if (reduced) {
      onComplete?.();
    }
  }, [text, reduced, words.length, onComplete]);

  useEffect(() => {
    if (reduced) return;
    if (shown >= words.length) {
      if (shown > 0) onComplete?.();
      return;
    }
    const justShown = shown > 0 ? (words[shown - 1] ?? "") : "";
    const base = shown === 0 ? 320 : WORD_MS + pauseAfter(justShown);
    const delay = base * speed;
    const t = setTimeout(() => setShown((n) => n + 1), delay);
    return () => clearTimeout(t);
    // onComplete intentionally omitted — fires once when the line finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, words, speed, reduced]);

  return (
    <Text testID={testID} className={className}>
      {words.map((w, i) => (
        <Text key={i} style={{ opacity: i < shown ? 1 : 0.14 }}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </Text>
      ))}
    </Text>
  );
}

export default RevealText;
