import { render } from "@testing-library/react-native";
import {
  makeConfirmOnBack,
  useAndroidBackHandler,
  type BackHandlerLike,
} from "@/lib/android/backHandler";

interface FakeBackHandler {
  backHandler: BackHandlerLike;
  fire: () => boolean | undefined;
  listeners: (() => boolean)[];
  unsubscribes: number;
}

function makeFakeBackHandler(): FakeBackHandler {
  const state = {
    listeners: [] as (() => boolean)[],
    unsubscribes: 0,
  };
  const backHandler: BackHandlerLike = {
    addEventListener: (_type, handler) => {
      state.listeners.push(handler);
      return {
        remove: () => {
          state.unsubscribes += 1;
          const idx = state.listeners.indexOf(handler);
          if (idx >= 0) state.listeners.splice(idx, 1);
        },
      };
    },
  };
  return {
    backHandler,
    fire: () => state.listeners[0]?.(),
    get listeners() {
      return state.listeners;
    },
    get unsubscribes() {
      return state.unsubscribes;
    },
  };
}

function TestComponent({
  enabled,
  onBack,
  backHandler,
}: {
  enabled: boolean;
  onBack: () => boolean;
  backHandler?: BackHandlerLike;
}) {
  useAndroidBackHandler({ enabled, onBack, backHandler });
  return null;
}

describe("useAndroidBackHandler", () => {
  it("does NOT subscribe when enabled=false", () => {
    const fake = makeFakeBackHandler();
    render(
      <TestComponent
        enabled={false}
        onBack={() => true}
        backHandler={fake.backHandler}
      />,
    );
    expect(fake.listeners).toHaveLength(0);
  });

  it("subscribes when enabled=true", () => {
    const fake = makeFakeBackHandler();
    render(
      <TestComponent
        enabled
        onBack={() => true}
        backHandler={fake.backHandler}
      />,
    );
    expect(fake.listeners).toHaveLength(1);
  });

  it("unsubscribes on unmount", () => {
    const fake = makeFakeBackHandler();
    const { unmount } = render(
      <TestComponent
        enabled
        onBack={() => true}
        backHandler={fake.backHandler}
      />,
    );
    unmount();
    expect(fake.unsubscribes).toBe(1);
    expect(fake.listeners).toHaveLength(0);
  });

  it("forwards back-press to onBack and returns its value", () => {
    const fake = makeFakeBackHandler();
    const onBack = jest.fn(() => true);
    render(<TestComponent enabled onBack={onBack} backHandler={fake.backHandler} />);
    const result = fake.fire();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });
});

describe("makeConfirmOnBack", () => {
  it("first press triggers onConfirm + intercepts (returns true)", () => {
    const onConfirm = jest.fn();
    const handler = makeConfirmOnBack({
      onConfirm,
      isConfirmed: () => false,
    });
    expect(handler()).toBe(true);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("after isConfirmed flips true, the next press allows the back (returns false)", () => {
    let confirmed = false;
    const handler = makeConfirmOnBack({
      onConfirm: () => {
        confirmed = true;
      },
      isConfirmed: () => confirmed,
    });
    expect(handler()).toBe(true);
    expect(handler()).toBe(false);
  });
});
