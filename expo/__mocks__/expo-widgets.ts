// `expo-widgets` talks to the WidgetKit extension, which does not exist under
// Jest (and the package's own proxy throws on first property access where the
// native side is absent). The draw path (`lib/widgets/update.ts`) reaches it
// through the `loadIosWidgetUpdaters` loader, so tests inject fakes there —
// this mock only has to exist so importing the module never throws, and so a
// test that asserts the wiring can watch what the app asked for.
//
// A Node module mock in `<rootDir>/__mocks__` is used automatically — the same
// arrangement as `expo-font.js` and `expo-splash-screen.js` beside it.
function makeWidget() {
  return {
    updateTimeline: jest.fn(),
    updateSnapshot: jest.fn(),
    reload: jest.fn(),
    getTimeline: jest.fn(async () => []),
  };
}

module.exports = {
  __esModule: true,
  createWidget: jest.fn((name, layout) => ({
    name,
    layout,
    ...makeWidget(),
  })),
  createLiveActivity: jest.fn(() => ({
    start: jest.fn(),
    getInstances: jest.fn(() => []),
  })),
  addUserInteractionListener: jest.fn(() => ({ remove: jest.fn() })),
  addPushToStartTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  widgetsDirectory: "",
};
