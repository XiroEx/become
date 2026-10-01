const React = require("react");
const { View } = require("react-native");

class MockVideoPlayer {
  constructor(source, setup) {
    this.source = source;
    this._playing = false;
    this._loop = false;
    this._muted = true;
    this._currentTime = 0;
    this._duration = 10;
    this.timeUpdateEventInterval = 0;
    this.playbackRate = 1.0;
    this.volume = 1.0;
    this.status = "readyToPlay";
    this.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
    this.listeners = new Map();

    if (typeof setup === "function") {
      setup(this);
    }
  }

  get playing() {
    return this._playing;
  }

  get loop() {
    return this._loop;
  }

  set loop(val) {
    this._loop = Boolean(val);
  }

  get muted() {
    return this._muted;
  }

  set muted(val) {
    this._muted = Boolean(val);
    this.emit("mutedChange", { muted: this._muted });
  }

  get currentTime() {
    return this._currentTime;
  }

  set currentTime(val) {
    this._currentTime = Number(val);
  }

  get duration() {
    return this._duration;
  }

  set duration(val) {
    this._duration = Number(val);
  }

  play() {
    this._playing = true;
    this.status = "playing";
    this.emit("playingChange", { isPlaying: true });
  }

  pause() {
    this._playing = false;
    this.status = "paused";
    this.emit("playingChange", { isPlaying: false });
  }

  replay() {
    this._currentTime = 0;
    this.play();
  }

  seekBy(seconds) {
    this._currentTime += seconds;
  }

  replace(source) {
    this.source = source;
    this.emit("sourceChange", { source });
  }

  async replaceAsync(source) {
    this.replace(source);
  }

  addListener(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(listener);
    return {
      remove: () => {
        const set = this.listeners.get(event);
        if (set) {
          set.delete(listener);
        }
      },
    };
  }

  emit(event, payload = {}) {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of Array.from(set)) {
        try {
          listener(payload);
        } catch {
          // ignore error in listener
        }
      }
    }
  }
}

const mockPlayers = [];

function useVideoPlayer(source, setup) {
  const playerRef = React.useRef(null);
  if (!playerRef.current) {
    playerRef.current = new MockVideoPlayer(source, setup);
    mockPlayers.push(playerRef.current);
  } else if (playerRef.current.source !== source) {
    playerRef.current.replace(source);
  }
  return playerRef.current;
}

function createVideoPlayer(source, playerBuilderOptions) {
  const p = new MockVideoPlayer(source);
  mockPlayers.push(p);
  return p;
}

function VideoView(props) {
  const { player, contentFit, nativeControls, style, testID, ...rest } = props;
  return React.createElement(View, {
    testID: testID || "expo-video-view",
    contentFit,
    nativeControls,
    style,
    accessibilityLabel: "Video view",
    ...rest,
  });
}

module.exports = {
  __esModule: true,
  VideoView,
  useVideoPlayer,
  createVideoPlayer,
  isPictureInPictureSupported: jest.fn(() => false),
  clearVideoCacheAsync: jest.fn(async () => {}),
  setVideoCacheSizeAsync: jest.fn(async () => {}),
  getCurrentVideoCacheSize: jest.fn(() => 0),
  __mockPlayers: mockPlayers,
  MockVideoPlayer,
};
