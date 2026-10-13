import { act, renderHook } from "@testing-library/react-native";
import { useToast } from "@/lib/toast/useToast";

describe("useToast", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows a toast, then auto-dismisses it after the duration", () => {
    const { result } = renderHook(() => useToast(1000));
    expect(result.current.toast).toBeNull();

    act(() => {
      result.current.showToast("Saved to your Foods — tap again to log it", "success");
    });
    expect(result.current.toast).toEqual({
      message: "Saved to your Foods — tap again to log it",
      type: "success",
    });

    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(result.current.toast).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.toast).toBeNull();
  });

  it("defaults the type to neutral", () => {
    const { result } = renderHook(() => useToast(1000));
    act(() => {
      result.current.showToast("Hello");
    });
    expect(result.current.toast?.type).toBe("neutral");
  });

  it("a fresh call replaces the current toast and restarts the clock", () => {
    const { result } = renderHook(() => useToast(1000));
    act(() => {
      result.current.showToast("First", "error");
    });
    act(() => {
      jest.advanceTimersByTime(900);
    });
    act(() => {
      result.current.showToast("Second", "success");
    });
    expect(result.current.toast).toEqual({ message: "Second", type: "success" });

    // The first timer's remaining 100ms must not clear the second toast.
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.toast).toEqual({ message: "Second", type: "success" });

    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(result.current.toast).toBeNull();
  });

  it("hideToast clears the toast immediately", () => {
    const { result } = renderHook(() => useToast(5000));
    act(() => {
      result.current.showToast("Hi");
    });
    expect(result.current.toast).not.toBeNull();
    act(() => {
      result.current.hideToast();
    });
    expect(result.current.toast).toBeNull();
  });
});
