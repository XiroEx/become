const React = require("react");
const { View } = require("react-native");

class MockVideoPlayer {
  constructor(source, setup) {
    this.source = source;
    this._currentTime = 0;
    this.duration = 10;
    this.muted = true;
    this.loop = true;
    this.playing = false;
    this.status = "readyToPlay";
    this.listeners = new Map();
    if (typeof setup === "function") {
      setup(this);
    }
  }

  get currentTime() {
    return this._currentTime;
  }

  set currentTime(val) {
    this._currentTime = val;
    this._emit("timeUpdate", { currentTime: val });
  }

  play() {
    this.playing = true;
    this._emit("statusChange", { status: "readyToPlay" });
  }

  pause() {
    this.playing = false;
  }

  replay() {
    this._currentTime = 0;
    this.playing = true;
    this._emit("timeUpdate", { currentTime: 0 });
  }

  seekBy(seconds) {
    this.currentTime += seconds;
  }

  addListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return {
      remove: () => {
        this.listeners.get(event)?.delete(callback);
      },
    };
  }

  _emit(event, payload) {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((cb) => cb(payload));
    }
  }
}

function createVideoPlayer(source, playerBuilderOptions) {
  return new MockVideoPlayer(source);
}

function useVideoPlayer(source, setup) {
  const sourceKey =
    typeof source === "object" && source !== null
      ? JSON.stringify(source)
      : String(source);

  return React.useMemo(
    () => {
      return new MockVideoPlayer(source, setup);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceKey],
  );
}

function VideoView({ player, style, contentFit, testID, ...props }) {
  return React.createElement(View, {
    testID: testID || "video-view",
    style,
    "data-content-fit": contentFit,
    "data-source": player?.source,
    ...props,
  });
}

function VideoAirPlayButton(props) {
  return React.createElement(View, { testID: "video-airplay-button", ...props });
}

module.exports = {
  VideoView,
  useVideoPlayer,
  createVideoPlayer,
  VideoAirPlayButton,
  isPictureInPictureSupported: () => false,
  clearVideoCacheAsync: async () => {},
  setVideoCacheSizeAsync: async () => {},
  getCurrentVideoCacheSize: () => 0,
};
