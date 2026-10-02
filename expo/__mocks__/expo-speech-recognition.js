// `expo-speech-recognition` is a native module: under Jest there is no native
// speech engine and no microphone. A Node-module mock in `<rootDir>/__mocks__`
// is applied automatically by Jest.

const listeners = new Map();

function addListener(event, callback) {
  const current = listeners.get(event) || [];
  current.push(callback);
  listeners.set(event, current);
  return {
    remove: () => {
      const remaining = (listeners.get(event) || []).filter((cb) => cb !== callback);
      listeners.set(event, remaining);
    },
  };
}

function emit(event, payload) {
  const cbs = [...(listeners.get(event) || [])];
  for (const cb of cbs) {
    cb(payload);
  }
}

function clearAllListeners() {
  listeners.clear();
}

const GRANTED = {
  status: "granted",
  granted: true,
  canAskAgain: true,
  expires: "never",
};

const ExpoSpeechRecognitionModule = {
  isRecognitionAvailable: jest.fn(() => true),
  supportsOnDeviceRecognition: jest.fn(() => true),
  supportsRecording: jest.fn(() => true),
  requestPermissionsAsync: jest.fn(async () => GRANTED),
  getPermissionsAsync: jest.fn(async () => GRANTED),
  start: jest.fn(() => {
    emit("start", null);
  }),
  stop: jest.fn(() => {
    emit("end", null);
  }),
  abort: jest.fn(() => {
    emit("end", null);
  }),
  addListener: jest.fn(addListener),
  emit,
  __listeners: listeners,
  __clearAllListeners: clearAllListeners,
  __GRANTED: GRANTED,
};

module.exports = {
  __esModule: true,
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent: jest.fn(),
  ExpoWebSpeechRecognition: class ExpoWebSpeechRecognition {},
  ExpoWebSpeechGrammar: class ExpoWebSpeechGrammar {},
  ExpoWebSpeechGrammarList: class ExpoWebSpeechGrammarList {},
  AVAudioSessionCategory: {},
  AVAudioSessionCategoryOptions: {},
  AVAudioSessionMode: {},
  RecognizerIntentExtraLanguageModel: {},
  RecognizerIntentEnableLanguageSwitch: {},
  AudioEncodingAndroid: {},
  TaskHintIOS: {},
  SpeechRecognizerErrorAndroid: {},
};
