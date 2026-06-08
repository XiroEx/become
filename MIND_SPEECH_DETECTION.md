# Mind — Speech Detection (Option A: Web Speech API streaming)

## Goal
Make the camera/mic affirm modalities (**Speak**, **Mirror**) *verify* that you actually
said the statement, instead of the hollow "hold to affirm" gesture. Use **streaming**
recognition so words light up green **as you speak them** (karaoke), with near-zero latency.

## Why Web Speech API (not Whisper, not cloud)
- Our self-hosted Whisper is too slow for a record→upload→transcribe round trip (>1–2s).
- Web Speech API streams **interim results** locally as you talk — no server hop, free,
  on-device on iOS.
- Verification for affirmations doesn't need perfect ASR; we only need "did they roughly
  say it" with a forgiving threshold. Web Speech is more than good enough for that.
- Tradeoff: uneven support (great on Chrome/Android, decent on Safari/iOS, **absent on
  Firefox**). So it's a **progressive enhancement** — where unsupported/denied, fall back
  to the existing hold-to-affirm. Nobody gets stuck.

## Architecture

```
lib/mind/speechMatch.ts        Pure matching: normalize + greedy in-order token match → per-word matched[] + ratio
hooks/useSpeechRecognition.ts  Thin Web Speech API wrapper (start/stop, interim+final transcript, support flag, errors, auto-restart)
hooks/useSpeechMatch.ts        Composes the two: sticky per-word matched (never un-lights), ratio, passed (≥ threshold), onPassed
components/mind/session/SpeechMatchTester.tsx   Mind Lab tester UI
  → wired into the Mind Lab as a new "Speech" tab
```

### Matching (forgiving by design)
- Normalize: lowercase, strip punctuation, keep apostrophes, collapse whitespace.
- Greedy **in-order** alignment of target words against the spoken stream, allowing the
  speaker to skip/insert filler. A spoken word matches a target word if equal after
  normalization, or within Levenshtein distance 1 (for words ≥4 chars) to absorb minor
  mis-hears / homophones.
- `ratio = matchedWords / targetWords`. Default pass threshold **0.7** (tunable in Lab).
- **Sticky:** once a word lights up it stays lit, so interim-result flicker never un-lights
  progress.

### UX principles (mindset app, not a dictation test)
- Encouraging, never punitive: "I heard you" > "82% match."
- Always an escape: "lock it in anyway" so a misheard word never traps anyone (consistent
  with existing skip philosophy).
- Live karaoke highlight is the magic — words turn green in real time as you speak.

## Phase 1 — Lab tester (THIS CHANGE)
Build the core (`speechMatch`, `useSpeechRecognition`, `useSpeechMatch`) and a **Speech tab**
in the Mind Lab:
- Browser-support readout (supported? which API — `SpeechRecognition` vs `webkitSpeechRecognition`).
- Editable target statement + threshold slider.
- Mic start/stop; live per-word highlight of the target; live transcript readout; running
  ratio; PASS state when ratio ≥ threshold; error surface.
This lets us validate real device behavior before touching the production scenes.

## Phase 2 — Wire into scenes (NEXT, after Lab validation)
- **SpeakScene:** replace the hold-to-record proxy with `useSpeechMatch`. Words light up as
  spoken; on pass → "Locked in." Keep mic-unavailable → existing hold fallback; keep
  "write instead" escape. (Optional: still record audio for the "hear yourself" replay.)
- **MirrorScene:** enable audio (`getUserMedia` is currently `audio:false`); overlay the
  statement on the camera with live highlight as you watch yourself say it; hold fallback
  where Web Speech is unsupported.
- Both keep "lock it in anyway."

## Phase 3 — optional
- Deepgram (cloud websocket streaming) as a fallback **only** for the unsupported set
  (Firefox, flaky iOS), if real-world testing proves Web Speech insufficient. Costs money +
  audio leaves to a third party, so prove the free path first.

## Notes
- Web Speech on Chrome routes audio to Google under the hood (needs network); iOS is
  on-device. For affirmations this is acceptable; documented for transparency.
- TS: Web Speech types aren't in the standard DOM lib — `useSpeechRecognition.ts` declares
  minimal local interfaces (no `any`).
