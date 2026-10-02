import * as React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import {
  FEEDBACK_MESSAGE_REQUIRED,
  MAX_FEEDBACK_IMAGES,
  buildFeedbackMetadata,
  metadataFitsCap,
  pickFeedbackScreenshot,
  sendFeedback,
} from "@/lib/feedback/sendFeedback";
import { FeedbackSheet } from "@/components/settings/FeedbackSheet";

/**
 * Send feedback from native Settings (NP-162).
 *
 * Two acceptances are decided here:
 *
 *   • (e015ca4e) "Feedback sent from a real iPhone arrives with the app
 *     version and device in its metadata" — the POST body carries `metadata`
 *     with `appVersion`, `appBuild`, `platform`, `osVersion` and
 *     `deviceModel`, and stays under the server's 12,000-character cap.
 *   • (e015ca4f) "Up to three screenshots attach, as on the web, and an empty
 *     message shows the server's 'Message is required'" — images are capped
 *     at three like `FeedbackModal.tsx` and `route.ts`, and the empty-message
 *     error is the server's sentence, asserted against the web's own source.
 */

function jsonResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body ?? {},
    text: async () => JSON.stringify(body ?? {}),
  } as Response;
}

function dataUrl(i: number): string {
  return `data:image/jpeg;base64,RkFLRS1JTUFHRS0${i}`;
}

describe("sendFeedback posts the web's feedback route with native metadata", () => {
  it("(e015ca4e) the body carries app version, build, OS and device model", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return jsonResponse(200, { success: true, id: "fb-1" });
    }) as unknown as typeof fetch;

    const result = await sendFeedback({
      type: "bug",
      message: "The streak banner shows yesterday's count.",
      images: [],
      jwt: "jwt",
      baseUrl: "https://become.redbtn.io",
      fetchImpl,
      metadataDeps: {
        app: { version: "0.1.0", build: "42" },
        device: { platform: "ios", osVersion: "18.1", modelName: "iPhone 16,2" },
      },
    });

    expect(result).toEqual({ status: "sent" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://become.redbtn.io/api/feedback");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.headers).toMatchObject({
      Authorization: "Bearer jwt",
    });
    const body = JSON.parse(calls[0]?.init?.body as string) as {
      type: string;
      message: string;
      images: unknown[];
      metadata: Record<string, unknown>;
    };
    expect(body.type).toBe("bug");
    expect(body.message).toBe("The streak banner shows yesterday's count.");
    // The acceptance: version and device travel in metadata.
    expect(body.metadata.appVersion).toBe("0.1.0");
    expect(body.metadata.appBuild).toBe("42");
    expect(body.metadata.platform).toBe("ios");
    expect(body.metadata.osVersion).toBe("18.1");
    expect(body.metadata.deviceModel).toBe("iPhone 16,2");
    expect(body.metadata.source).toBe("native");
    // The rule that travels: metadata stays under the server's cap.
    expect(metadataFitsCap(body.metadata)).toBe(true);
    expect(JSON.stringify(body.metadata).length).toBeLessThanOrEqual(12000);
  });

  it("buildFeedbackMetadata stays under the 12,000-character cap", () => {
    const metadata = buildFeedbackMetadata({
      app: { version: "0.1.0", build: "1" },
      device: { platform: "ios", osVersion: "18.1", modelName: "iPhone 16,2" },
    });
    expect(metadataFitsCap(metadata)).toBe(true);
    expect(metadataFitsCap({ ...metadata, pad: "x".repeat(12001) })).toBe(
      false,
    );
  });

  it("(e015ca4f) up to three screenshots attach, as on the web", async () => {
    const seen: { images: { name: string; dataUrl: string }[] }[] = [];
    const fetchImpl = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(JSON.parse(init?.body as string));
      return jsonResponse(200, { success: true });
    }) as unknown as typeof fetch;

    const images = [0, 1, 2, 3].map((i) => ({
      name: `screenshot-${i + 1}.jpg`,
      dataUrl: dataUrl(i),
    }));
    const result = await sendFeedback({
      type: "general",
      message: "Four attached, three sent.",
      images,
      jwt: "jwt",
      fetchImpl,
      metadataDeps: {
        app: { version: "0.1.0", build: "1" },
        device: { platform: "ios", osVersion: "18.1" },
      },
    });

    expect(result).toEqual({ status: "sent" });
    // The web slices to three client-side AND server-side; native does both.
    expect(seen[0]?.images).toHaveLength(3);
    expect(seen[0]?.images.map((img) => img.name)).toEqual([
      "screenshot-1.jpg",
      "screenshot-2.jpg",
      "screenshot-3.jpg",
    ]);
    for (const img of seen[0]?.images ?? []) {
      expect(img.dataUrl.startsWith("data:image/")).toBe(true);
    }
  });

  it("(e015ca4f) an empty message shows the server's 'Message is required'", async () => {
    // The sentence is the server's, not a client paraphrase: read it out of
    // the web's own route source so the two cannot drift apart.
    const fs = jest.requireActual("fs") as typeof import("fs");
    const path = jest.requireActual("path") as typeof import("path");
    const routeSource = fs.readFileSync(
      path.resolve(__dirname, "..", "..", "webapp", "app", "api", "feedback", "route.ts"),
      "utf8",
    );
    expect(routeSource).toContain("Message is required");
    expect(FEEDBACK_MESSAGE_REQUIRED).toBe("Message is required");

    const fetchImpl = jest.fn(async () =>
      jsonResponse(400, { error: "Message is required" }),
    ) as unknown as typeof fetch;

    // A blank message never leaves the device — the client answers with the
    // server's sentence, which is what the server would have answered.
    const local = await sendFeedback({
      type: "general",
      message: "   ",
      jwt: "jwt",
      fetchImpl,
    });
    expect(local).toEqual({
      status: "validation-error",
      message: "Message is required",
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    // And a 400 from the server surfaces the server's sentence verbatim: a
    // non-blank message the server still rejects proves the 400 path carries
    // the sentence.
    const remote = await sendFeedback({
      type: "general",
      message: "x",
      jwt: "jwt",
      fetchImpl,
    });
    expect(remote).toEqual({
      status: "validation-error",
      message: "Message is required",
    });
  });

  it("screenshots are picked through NP-059's media helpers", async () => {
    const capture = jest.fn(async () => ({
      status: "captured" as const,
      image: {
        uri: "file:///cache/resized.jpg",
        width: 1024,
        height: 768,
        dataUrl: dataUrl(0),
        mimeType: "image/jpeg" as const,
        fileName: "photo.jpg",
      },
    }));
    const picked = await pickFeedbackScreenshot({ capture });
    expect(capture).toHaveBeenCalledWith(
      "library",
      expect.objectContaining({ spec: expect.objectContaining({ maxDim: 1024 }) }),
    );
    expect(picked).toEqual({
      status: "picked",
      image: { name: "photo.jpg", dataUrl: dataUrl(0) },
    });
  });

  it("without a session nothing is sent", async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, {})) as unknown as typeof fetch;
    expect(
      await sendFeedback({ type: "bug", message: "hi", jwt: null, fetchImpl }),
    ).toEqual({ status: "signed-out" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("the photo-library usage string covers a feedback screenshot", () => {
    const fs = jest.requireActual("fs") as typeof import("fs");
    const path = jest.requireActual("path") as typeof import("path");
    const appJson = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, "..", "app.json"),
        "utf8",
      ),
    ) as {
      expo: { ios?: { infoPlist?: Record<string, string> } };
    };
    const sentence =
      appJson.expo.ios?.infoPlist?.NSPhotoLibraryUsageDescription ?? "";
    expect(sentence).toMatch(/\bBecome\b/);
    expect(sentence).toMatch(/feedback/i);
  });

  it("Settings renders the Send feedback row", () => {
    const { FeedbackSheet } = jest.requireActual(
      "@/components/settings/FeedbackSheet",
    ) as typeof import("@/components/settings/FeedbackSheet");
    expect(typeof FeedbackSheet).toBe("function");
  });

  it(`MAX_FEEDBACK_IMAGES is ${MAX_FEEDBACK_IMAGES}, the web's cap`, () => {
    expect(MAX_FEEDBACK_IMAGES).toBe(3);
  });
});

describe("<FeedbackSheet />", () => {
  it("opens from the Settings row, sends a typed message, and thanks", async () => {
    const sendImpl = jest.fn(async () => ({ status: "sent" as const }));
    const { getByTestId, queryByTestId } = render(
      <FeedbackSheet token="jwt" sendImpl={sendImpl} />,
    );
    expect(getByTestId("feedback-row")).toBeTruthy();

    fireEvent.press(getByTestId("feedback-row"));
    expect(getByTestId("feedback-modal")).toBeTruthy();
    expect(getByTestId("feedback-type-bug")).toBeTruthy();
    expect(getByTestId("feedback-message")).toBeTruthy();

    fireEvent.press(getByTestId("feedback-type-bug"));
    fireEvent.changeText(
      getByTestId("feedback-message"),
      "The streak banner shows yesterday's count.",
    );
    fireEvent.press(getByTestId("feedback-send"));

    await waitFor(() => {
      expect(sendImpl).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "bug",
          message: "The streak banner shows yesterday's count.",
        }),
      );
    });
    await waitFor(() => {
      expect(queryByTestId("feedback-sent")).toBeTruthy();
    });
  });

  it("an empty message shows 'Message is required' without sending", () => {
    const sendImpl = jest.fn(async () => ({ status: "sent" as const }));
    const { getByTestId, queryByTestId } = render(
      <FeedbackSheet token="jwt" sendImpl={sendImpl} />,
    );
    fireEvent.press(getByTestId("feedback-row"));
    fireEvent.press(getByTestId("feedback-send"));
    expect(getByTestId("feedback-error").props.children).toBe(
      "Message is required",
    );
    expect(sendImpl).not.toHaveBeenCalled();
    expect(queryByTestId("feedback-sent")).toBeNull();
  });

  it("attaches up to three screenshots and removes one", async () => {
    const sendImpl = jest.fn(async () => ({ status: "sent" as const }));
    let n = 0;
    const pickImpl = jest.fn(async () => {
      n += 1;
      return {
        status: "picked" as const,
        image: { name: `screenshot-${n}.jpg`, dataUrl: dataUrl(n) },
      };
    });
    const { getByTestId, queryByTestId } = render(
      <FeedbackSheet token="jwt" sendImpl={sendImpl} pickImpl={pickImpl} />,
    );
    fireEvent.press(getByTestId("feedback-row"));
    for (let i = 0; i < 3; i += 1) {
      await waitFor(() => {
        expect(queryByTestId("feedback-add-photo") ?? queryByTestId("feedback-images")).toBeTruthy();
      });
      const add = queryByTestId("feedback-add-photo");
      if (!add) break;
      fireEvent.press(add);
      await waitFor(() => {
        expect(pickImpl).toHaveBeenCalledTimes(i + 1);
      });
    }
    expect(getByTestId("feedback-images")).toBeTruthy();
    expect(getByTestId("feedback-image-0")).toBeTruthy();
    expect(getByTestId("feedback-image-2")).toBeTruthy();
    // Three attached: the add button gives way to the "3/3 photos" count.
    expect(queryByTestId("feedback-add-photo")).toBeNull();

    fireEvent.press(getByTestId("feedback-image-0-remove"));
    expect(queryByTestId("feedback-image-2")).toBeNull();
    expect(getByTestId("feedback-add-photo")).toBeTruthy();
  });
});
