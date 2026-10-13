// `expo-image-manipulator` decodes and re-encodes on the native side, which
// does not exist under Jest. Applied automatically as a Node-module mock (see
// `expo-font.js`).
//
// It RECORDS instead of resizing, because the thing worth asserting about a
// native resize is the numbers it was asked for: the web's long-edge cap and
// JPEG quality, and nothing else (NP-059). `__recorded` is every context the
// app built, in order; `__setSource` decides what the decoder claims the image
// is, so a test can drive the "the picker reported no dimensions" path.
const recorded = [];

let source = { width: 4032, height: 3024 };
let saved = {
  uri: "file:///cache/resized.jpg",
  width: 1024,
  height: 768,
  base64: "QkFTRTY0",
};

function makeContext(uri) {
  const entry = { uri, resizes: [], saves: [], renders: 0, released: 0 };
  recorded.push(entry);
  const context = {
    resize: jest.fn((size) => {
      entry.resizes.push(size);
      return context;
    }),
    rotate: jest.fn(() => context),
    flip: jest.fn(() => context),
    crop: jest.fn(() => context),
    reset: jest.fn(() => context),
    release: jest.fn(() => {
      entry.released += 1;
    }),
    renderAsync: jest.fn(async () => {
      entry.renders += 1;
      return {
        width: source.width,
        height: source.height,
        release: jest.fn(),
        saveAsync: jest.fn(async (options) => {
          entry.saves.push(options);
          return { ...saved };
        }),
      };
    }),
  };
  return context;
}

module.exports = {
  __esModule: true,
  ImageManipulator: {
    manipulate: jest.fn((uri) => makeContext(uri)),
  },
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
  FlipType: { Vertical: "vertical", Horizontal: "horizontal" },
  manipulateAsync: jest.fn(async () => ({ ...saved })),
  useImageManipulator: jest.fn(() => makeContext("hook")),
  __recorded: recorded,
  __setSource: (next) => {
    source = { ...source, ...next };
  },
  __setSaved: (next) => {
    saved = { ...saved, ...next };
  },
  __reset: () => {
    recorded.length = 0;
    source = { width: 4032, height: 3024 };
    saved = {
      uri: "file:///cache/resized.jpg",
      width: 1024,
      height: 768,
      base64: "QkFTRTY0",
    };
  },
};
