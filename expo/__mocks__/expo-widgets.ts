/**
 * Manual mock for `expo-widgets` (iOS WidgetKit bridge, SDK 57 line).
 *
 * The real module's native side exists only in a prebuilt binary — never in
 * jest — so every test that touches the iOS draw path (`update.ts`,
 * `ios/widgets.ts`) runs against this. `createWidget` returns an object whose
 * `updateTimeline` / `updateSnapshot` / `reload` are `jest.fn`s, keyed by
 * widget name in `__instances` so a test can fail one widget without touching
 * the others.
 */
type TimelineEntry = { date: Date; props: unknown };

interface MockWidget {
  name: string;
  updateTimeline: jest.Mock;
  updateSnapshot: jest.Mock;
  reload: jest.Mock;
  getTimeline: jest.Mock;
}

const __instances: Record<string, MockWidget> = {};

function makeWidget(name: string): MockWidget {
  const widget: MockWidget = {
    name,
    updateTimeline: jest.fn(),
    updateSnapshot: jest.fn(),
    reload: jest.fn(),
    getTimeline: jest.fn(async () => [] as TimelineEntry[]),
  };
  __instances[name] = widget;
  return widget;
}

export function createWidget(
  name: string,
  _component: unknown,
): MockWidget {
  return makeWidget(name);
}

export function __getWidgetInstance(name: string): MockWidget | null {
  return __instances[name] ?? null;
}

export function __allWidgetInstances(): MockWidget[] {
  return Object.values(__instances);
}

export function __resetWidgetInstances(): void {
  for (const key of Object.keys(__instances)) delete __instances[key];
}
