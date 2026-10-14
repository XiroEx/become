// expo-audio talks to a native audio session jest does not have. Every caller
// goes through `lib/feedback/restSound.ts`, which swallows failures, so the
// mock only has to resolve — and recording the calls is what lets the rest
// alert suite assert that the timer reaching zero asked for a SOUND as well as
// a vibration (NP-082: both channels, every time).
//
// One shared player instance, like a real `createAudioPlayer` memo: a test can
// read `__restSoundPlayer.play` without having to capture the return value.
const player = {
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn(() => Promise.resolve()),
  remove: jest.fn(),
  volume: 1,
};

module.exports = {
  __esModule: true,
  createAudioPlayer: jest.fn(() => player),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  setIsAudioActiveAsync: jest.fn(() => Promise.resolve()),
  /** @internal The single player `createAudioPlayer` hands back. */
  __restSoundPlayer: player,
};
