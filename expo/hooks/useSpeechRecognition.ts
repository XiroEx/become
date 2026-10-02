import { useCallback, useEffect, useRef, useState } from "react";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

export interface UseSpeechRecognition {
  /** Speech recognition available on this device/platform. */
  supported: boolean;
  /** Which engine backs it (for parity / diagnostics). */
  api: "SpeechRecognition" | "webkitSpeechRecognition" | null;
  listening: boolean;
  /** Final + current interim transcript. */
  transcript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export interface UseSpeechRecognitionOptions {
  lang?: string;
  contextualStrings?: string[];
}

function checkSupported(): boolean {
  try {
    return ExpoSpeechRecognitionModule?.isRecognitionAvailable?.() ?? false;
  } catch {
    return false;
  }
}

export function useSpeechRecognition(
  opts?: UseSpeechRecognitionOptions,
): UseSpeechRecognition {
  const lang = opts?.lang ?? "en-US";
  const supported = checkSupported();
  const api: UseSpeechRecognition["api"] = supported ? "SpeechRecognition" : null;

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const finalRef = useRef("");
  const wantRef = useRef(false);
  const optsRef = useRef(opts);

  useEffect(() => {
    optsRef.current = opts;
  });

  const stop = useCallback(() => {
    wantRef.current = false;
    setListening(false);
    try {
      ExpoSpeechRecognitionModule?.stop?.();
    } catch {
      // ignore
    }
  }, []);

  const reset = useCallback(() => {
    finalRef.current = "";
    setTranscript("");
    setError(null);
  }, []);

  const start = useCallback(() => {
    if (!supported) {
      setError("not-supported");
      setListening(false);
      return;
    }

    wantRef.current = true;
    finalRef.current = "";
    setTranscript("");
    setError(null);

    const beginRecognition = () => {
      try {
        ExpoSpeechRecognitionModule?.start?.({
          lang,
          interimResults: true,
          continuous: true,
          maxAlternatives: 1,
          contextualStrings: optsRef.current?.contextualStrings,
        });
        setListening(true);
      } catch {
        setError("start-failed");
        setListening(false);
        wantRef.current = false;
      }
    };

    if (ExpoSpeechRecognitionModule?.requestPermissionsAsync) {
      ExpoSpeechRecognitionModule.requestPermissionsAsync()
        .then((perm) => {
          if (!perm.granted) {
            setError("not-allowed");
            setListening(false);
            wantRef.current = false;
            return;
          }
          if (wantRef.current) {
            beginRecognition();
          }
        })
        .catch(() => {
          setError("not-allowed");
          setListening(false);
          wantRef.current = false;
        });
    } else {
      beginRecognition();
    }
  }, [lang, supported]);

  useEffect(() => {
    const subStart = ExpoSpeechRecognitionModule?.addListener?.("start", () => {
      setListening(true);
    });

    const subResult = ExpoSpeechRecognitionModule?.addListener?.(
      "result",
      (event: { isFinal: boolean; results?: { transcript?: string }[] }) => {
        const text = event.results?.[0]?.transcript ?? "";
        if (event.isFinal) {
          finalRef.current = (finalRef.current + " " + text).trim() + " ";
          setTranscript(finalRef.current.trim());
        } else {
          setTranscript((finalRef.current + text).trim());
        }
      },
    );

    const subError = ExpoSpeechRecognitionModule?.addListener?.(
      "error",
      (event: { error: string }) => {
        if (event?.error !== "no-speech" && event?.error !== "aborted") {
          setError(event?.error ?? "unknown");
        }
      },
    );

    const subEnd = ExpoSpeechRecognitionModule?.addListener?.("end", () => {
      if (wantRef.current) {
        try {
          ExpoSpeechRecognitionModule?.start?.({
            lang,
            interimResults: true,
            continuous: true,
            maxAlternatives: 1,
            contextualStrings: optsRef.current?.contextualStrings,
          });
        } catch {
          setListening(false);
        }
      } else {
        setListening(false);
      }
    });

    return () => {
      wantRef.current = false;
      subStart?.remove?.();
      subResult?.remove?.();
      subError?.remove?.();
      subEnd?.remove?.();
      try {
        ExpoSpeechRecognitionModule?.abort?.();
      } catch {
        // ignore
      }
    };
  }, [lang]);

  return {
    supported,
    api,
    listening,
    transcript,
    error,
    start,
    stop,
    reset,
  };
}
