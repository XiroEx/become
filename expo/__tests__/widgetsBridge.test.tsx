/* eslint-disable import/first */
/**
 * ─── The bridge that keeps the home screen in step with the session ──────────
 *
 * It renders nothing and does two things: hand the widgets token over when the
 * member is signed in, and wipe the tiles when they are not.
 *
 * The bug it is shaped to avoid: mounting it inside `(app)`. The transition that
 * matters is signed-in → signed-out, and that transition unmounts everything
 * behind `AuthGuard` — so the effect would never run and the member's streak and
 * calories would stay on the home screen of a phone they had just signed out of.
 * It is mounted at the ROOT (`app/_layout.tsx`), which is also asserted here.
 */
const mockAuth = {
  status: "loading" as "loading" | "signed-in" | "signed-out",
  token: null as string | null,
};
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    status: mockAuth.status,
    token: mockAuth.token,
    user: null,
    loading: mockAuth.status === "loading",
    isAuthed: mockAuth.status === "signed-in",
    signedOutReason: null,
    setToken: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
    logout: jest.fn(),
  }),
}));

import * as fs from "fs";
import * as path from "path";
import { render, waitFor } from "@testing-library/react-native";
import { WidgetsBridge } from "@/components/widgets/WidgetsBridge";

beforeEach(() => {
  mockAuth.status = "loading";
  mockAuth.token = null;
});

describe("WidgetsBridge", () => {
  it("renders nothing", () => {
    mockAuth.status = "signed-in";
    mockAuth.token = "jwt";
    const { toJSON } = render(
      <WidgetsBridge handOff={async () => null} onSignedOut={async () => null} />,
    );
    expect(toJSON()).toBeNull();
  });

  // `loading` is the launch read of the secure store, not a verdict. Acting on it
  // would clear the token of a member who is about to be signed in.
  it("does nothing while the session is still being read", () => {
    const handOff = jest.fn(async () => null);
    const onSignedOut = jest.fn(async () => null);
    render(<WidgetsBridge handOff={handOff} onSignedOut={onSignedOut} />);
    expect(handOff).not.toHaveBeenCalled();
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it("hands the token over once per session token", async () => {
    mockAuth.status = "signed-in";
    mockAuth.token = "jwt";
    const handOff = jest.fn(async () => null);
    const { rerender } = render(
      <WidgetsBridge handOff={handOff} onSignedOut={async () => null} />,
    );

    await waitFor(() => expect(handOff).toHaveBeenCalledWith("jwt"));

    // A re-render, and a sliding-session refresh that hands back the SAME jwt.
    rerender(<WidgetsBridge handOff={handOff} onSignedOut={async () => null} />);
    expect(handOff).toHaveBeenCalledTimes(1);
  });

  it("hands over again when the session token actually changes", async () => {
    mockAuth.status = "signed-in";
    mockAuth.token = "jwt-1";
    const handOff = jest.fn(async () => null);
    const { rerender } = render(
      <WidgetsBridge handOff={handOff} onSignedOut={async () => null} />,
    );
    await waitFor(() => expect(handOff).toHaveBeenCalledTimes(1));

    mockAuth.token = "jwt-2";
    rerender(<WidgetsBridge handOff={handOff} onSignedOut={async () => null} />);
    await waitFor(() => expect(handOff).toHaveBeenCalledTimes(2));
    expect(handOff).toHaveBeenLastCalledWith("jwt-2");
  });

  it("wipes the widgets on sign-out — the criterion", async () => {
    mockAuth.status = "signed-in";
    mockAuth.token = "jwt";
    const handOff = jest.fn(async () => null);
    const onSignedOut = jest.fn(async () => null);
    const { rerender } = render(
      <WidgetsBridge handOff={handOff} onSignedOut={onSignedOut} />,
    );
    await waitFor(() => expect(handOff).toHaveBeenCalledTimes(1));

    mockAuth.status = "signed-out";
    mockAuth.token = null;
    rerender(<WidgetsBridge handOff={handOff} onSignedOut={onSignedOut} />);

    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1));
  });

  it("wipes them once, not once per render", async () => {
    mockAuth.status = "signed-out";
    const onSignedOut = jest.fn(async () => null);
    const { rerender } = render(
      <WidgetsBridge handOff={async () => null} onSignedOut={onSignedOut} />,
    );
    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1));
    rerender(
      <WidgetsBridge handOff={async () => null} onSignedOut={onSignedOut} />,
    );
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it("draws the prompt on a launch that was never signed in", async () => {
    mockAuth.status = "signed-out";
    const onSignedOut = jest.fn(async () => null);
    render(
      <WidgetsBridge handOff={async () => null} onSignedOut={onSignedOut} />,
    );
    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1));
  });

  it("hands over again after a sign-out and a new sign-in", async () => {
    mockAuth.status = "signed-out";
    const handOff = jest.fn(async () => null);
    const onSignedOut = jest.fn(async () => null);
    const { rerender } = render(
      <WidgetsBridge handOff={handOff} onSignedOut={onSignedOut} />,
    );
    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1));

    mockAuth.status = "signed-in";
    mockAuth.token = "jwt";
    rerender(<WidgetsBridge handOff={handOff} onSignedOut={onSignedOut} />);
    await waitFor(() => expect(handOff).toHaveBeenCalledWith("jwt"));
  });

  it("a rejected hand-off never reaches the tree", async () => {
    mockAuth.status = "signed-in";
    mockAuth.token = "jwt";
    const handOff = jest.fn(async () => {
      throw new Error("widget hand-off exploded");
    });
    expect(() =>
      render(
        <WidgetsBridge handOff={handOff} onSignedOut={async () => null} />,
      ),
    ).not.toThrow();
    await waitFor(() => expect(handOff).toHaveBeenCalledTimes(1));
  });

  it("a rejected sign-out wipe never reaches the tree either", async () => {
    mockAuth.status = "signed-out";
    const onSignedOut = jest.fn(async () => {
      throw new Error("no widget module");
    });
    expect(() =>
      render(
        <WidgetsBridge handOff={async () => null} onSignedOut={onSignedOut} />,
      ),
    ).not.toThrow();
    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1));
  });
});

describe("where it is mounted", () => {
  const layout = fs.readFileSync(
    path.resolve(__dirname, "..", "app", "_layout.tsx"),
    "utf8",
  );

  it("is in the ROOT layout, inside AuthProvider", () => {
    expect(layout).toMatch(/<WidgetsBridge \/>/);
    const provider = layout.indexOf("<AuthProvider>");
    const bridge = layout.indexOf("<WidgetsBridge />");
    expect(provider).toBeGreaterThan(-1);
    expect(bridge).toBeGreaterThan(provider);
  });

  it("is not inside the (app) group, which a sign-out unmounts", () => {
    const appGroup = path.resolve(__dirname, "..", "app", "(app)");
    const mountedInGroup = fs
      .readdirSync(appGroup)
      .some(
        (entry) =>
          entry.endsWith(".tsx") &&
          fs
            .readFileSync(path.join(appGroup, entry), "utf8")
            .includes("WidgetsBridge"),
      );
    expect(mountedInGroup).toBe(false);
  });
});
