const React = require("react");
const { View } = require("react-native");

class MockVideoPlayer {
  constructor(source) {
    this._listeners = new Map();
    this.source = source;
    this.playing = false;
    this.muted = false;
    this.loop = false;
    this.currentTime = 0;
    this.duration = 10;
    this.status = "readyToPlay";
    this.timeUpdateEventInterval = 0.25;

    this.play = jest.fn(() => {
      this.playing = true;
      this._emit("playingChange", { isPlaying: true });
    });
    this.pause = jest.fn(() => {
      this.playing = false;
      this._emit("playingChange", { isPlaying: false });
    });
    this.replace = jest.fn((newSource) => {
      this.source = newSource;
      this._emit("sourceChange", { source: newSource });
    });
    this.replaceAsync = jest.fn(async (newSource) => {
      this.source = newSource;
      this._emit("sourceChange", { source: newSource });
    });
    this.seekBy = jest.fn((seconds) => {
      this.currentTime = Math.max(0, this.currentTime + seconds);
      this._emit("timeUpdate", { currentTime: this.currentTime });
    });
    this.addListener = jest.fn((event, handler) => {
      if (!this._listeners.has(event)) {
        this._listeners.set(event, new Set());
      }
      this._listeners.get(event).add(handler);
      return {
        remove: () => {
          this._listeners.get(event)?.delete(handler);
        },
      };
    });
    this.removeListener = jest.fn((event, handler) => {
      this._listeners.get(event)?.delete(handler);
    });
  }

  _emit(event, payload) {
    const handlers = this._listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(payload);
      }
    }
  }
}

function createVideoPlayer(source) {
  return new MockVideoPlayer(source);
}

function useVideoPlayer(source, setup) {
  const [player] = React.useState(() => {
    const p = createVideoPlayer(source);
    if (typeof setup === "function") {
      setup(p);
    }
    return p;
  });

  return player;
}

function VideoView({ player, contentFit, nativeControls, testID, style, ...props }) {
  return React.createElement(View, {
    testID: testID || "video-view",
    player,
    contentFit,
    nativeControls,
    style,
    ...props,
  });
}

module.exports = {
  __esModule: true,
  VideoView,
  useVideoPlayer,
  createVideoPlayer,
  MockVideoPlayer,
  isPictureInPictureSupported: jest.fn(() => false),
};
