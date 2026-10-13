/* eslint-disable import/first */
const mockAuth: { token: string | null } = { token: "jwt-member-a" };
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    status: mockAuth.token ? "signed-in" : "signed-out",
    token: mockAuth.token,
    user: null,
    loading: false,
    isAuthed: !!mockAuth.token,
    signedOutReason: null,
    setToken: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
    logout: jest.fn(),
  }),
}));

import { render, waitFor } from "@testing-library/react-native";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  AuthedImage,
  AUTHED_IMAGE_ERROR_MESSAGE,
} from "@/components/media/AuthedImage";
import {
  authedImageCacheSize,
  authedImageUrl,
  becomeApiPath,
  clearAuthedImageCache,
  loadAuthedImage,
  normaliseImageDataUrl,
} from "@/lib/media/authedBlob";
/* eslint-enable import/first */

/**
 * NP-059 — a per-member image, natively.
 *
 * `GET /api/blob/<key>` needs a session for every per-member key and answers
 * **404** to anyone else, so the same URL that renders for its owner is a 404
 * without one — which is exactly the card's second acceptance, and what the
 * component has to survive. Native has no cookie and an `<Image>` cannot set a
 * header, so the bytes are fetched with the Bearer token and handed over as a
 * `data:` URL.
 *
 * The cache is the card's travelling rule: per-member images are never cached
 * where another account on the device could read them. Nothing here touches
 * disk, and every entry is keyed by the token that fetched it.
 */

const BLOB_PATH = "/api/blob/scans/member-a/abc.jpg";

function imageResponse(
  status = 200,
  contentType = "image/jpeg",
  body = "bytes",
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    blob: async () => new Blob([body], { type: contentType }),
    text: async () => body,
    headers: { get: (name: string) => (/content-type/i.test(name) ? contentType : null) },
  } as unknown as Response;
}

function recordingFetch(
  responses: Response[] | (() => Response),
): { fetchImpl: typeof fetch; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  let index = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (typeof responses === "function") return responses();
    return responses[Math.min(index++, responses.length - 1)];
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

beforeEach(() => {
  clearAuthedImageCache();
  mockAuth.token = "jwt-member-a";
});

describe("the token only ever goes to Become", () => {
  it("takes a path as it comes", () => {
    expect(becomeApiPath(BLOB_PATH)).toBe(BLOB_PATH);
  });

  it("takes an absolute URL on the Become origin, as a path", () => {
    expect(becomeApiPath(`${WEBAPP_BASE_URL}${BLOB_PATH}`)).toBe(BLOB_PATH);
  });

  it("refuses another origin, a protocol-relative host and a backslash", () => {
    expect(becomeApiPath("https://evil.example/api/blob/x.jpg")).toBeNull();
    expect(becomeApiPath("//evil.example/api/blob/x.jpg")).toBeNull();
    expect(becomeApiPath("https://become.redbtn.io.evil.test/x")).toBeNull();
    expect(becomeApiPath("\\\\evil.example\\x")).toBeNull();
    expect(becomeApiPath("")).toBeNull();
  });

  it("prefixes WEBAPP_BASE_URL to build the URL it reads", () => {
    expect(authedImageUrl(BLOB_PATH)).toBe(`${WEBAPP_BASE_URL}${BLOB_PATH}`);
    expect(authedImageUrl("https://evil.example/x.jpg")).toBeNull();
  });

  it("a foreign target is refused WITHOUT a request", async () => {
    const { fetchImpl, calls } = recordingFetch([imageResponse()]);
    const result = await loadAuthedImage({
      target: "https://evil.example/api/blob/x.jpg",
      token: "jwt-member-a",
      fetchImpl,
    });
    expect(result).toEqual({ status: "refused" });
    expect(calls).toHaveLength(0);
  });
});

describe("loadAuthedImage", () => {
  it("sends the Bearer header to the Become URL and returns a data URL", async () => {
    const { fetchImpl, calls } = recordingFetch([imageResponse()]);
    const result = await loadAuthedImage({
      target: BLOB_PATH,
      token: "jwt-member-a",
      fetchImpl,
      toDataUrl: async () => "data:image/jpeg;base64,Ynl0ZXM=",
    });
    expect(result).toEqual({
      status: "loaded",
      dataUrl: "data:image/jpeg;base64,Ynl0ZXM=",
      fromCache: false,
    });
    expect(calls[0]?.url).toBe(`${WEBAPP_BASE_URL}${BLOB_PATH}`);
    expect(
      (calls[0]?.init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer jwt-member-a");
  });

  it("asks for nothing at all with no session on the device", async () => {
    const { fetchImpl, calls } = recordingFetch([imageResponse()]);
    const result = await loadAuthedImage({
      target: BLOB_PATH,
      token: null,
      fetchImpl,
    });
    expect(result).toEqual({ status: "signed-out" });
    expect(calls).toHaveLength(0);
  });

  it("404 — the answer for an object that is gone, or was never yours", async () => {
    const { fetchImpl } = recordingFetch([imageResponse(404, "application/json")]);
    expect(
      await loadAuthedImage({ target: BLOB_PATH, token: "t", fetchImpl }),
    ).toEqual({ status: "not-found" });
  });

  it("401 — the session has ended", async () => {
    const { fetchImpl } = recordingFetch([imageResponse(401, "application/json")]);
    expect(
      await loadAuthedImage({ target: BLOB_PATH, token: "t", fetchImpl }),
    ).toEqual({ status: "unauthorized" });
  });

  it("anything else is a failure, carrying the status", async () => {
    const { fetchImpl } = recordingFetch([imageResponse(500, "application/json")]);
    expect(
      await loadAuthedImage({ target: BLOB_PATH, token: "t", fetchImpl }),
    ).toEqual({ status: "failed", httpStatus: 500 });
  });

  it("labels a typeless blob with the response's own content type", () => {
    expect(
      normaliseImageDataUrl("data:application/octet-stream;base64,AAAA", "image/png"),
    ).toBe("data:image/png;base64,AAAA");
    expect(normaliseImageDataUrl("data:image/jpeg;base64,AAAA", null)).toBe(
      "data:image/jpeg;base64,AAAA",
    );
    expect(normaliseImageDataUrl("data:;base64,AAAA", "text/html")).toBe(
      "data:image/jpeg;base64,AAAA",
    );
  });
});

describe("the cache is in memory, and it belongs to ONE session", () => {
  const toDataUrl = async (): Promise<string> => "data:image/jpeg;base64,AAAA";

  it("serves the second read of the same image without a request", async () => {
    const { fetchImpl, calls } = recordingFetch(() => imageResponse());
    const first = await loadAuthedImage({
      target: BLOB_PATH,
      token: "jwt-member-a",
      fetchImpl,
      toDataUrl,
    });
    const second = await loadAuthedImage({
      target: BLOB_PATH,
      token: "jwt-member-a",
      fetchImpl,
      toDataUrl,
    });
    expect(first.status === "loaded" && first.fromCache).toBe(false);
    expect(second.status === "loaded" && second.fromCache).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("NEVER serves one member's image to another session on the device", async () => {
    const { fetchImpl, calls } = recordingFetch(() => imageResponse());
    await loadAuthedImage({
      target: BLOB_PATH,
      token: "jwt-member-a",
      fetchImpl,
      toDataUrl,
    });
    const other = await loadAuthedImage({
      target: BLOB_PATH,
      token: "jwt-member-b",
      fetchImpl,
      toDataUrl,
    });
    // Fetched again under B's own token, so the SERVER decides whether B may
    // see it — which for a `scans/<member-a>/…` key is a 404.
    expect(calls).toHaveLength(2);
    expect(
      (calls[1]?.init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer jwt-member-b");
    expect(other.status === "loaded" && other.fromCache).toBe(false);
    // A's entry did not survive B's arrival.
    expect(authedImageCacheSize()).toBe(1);
  });

  it("empties on sign-out", async () => {
    const { fetchImpl } = recordingFetch(() => imageResponse());
    await loadAuthedImage({
      target: BLOB_PATH,
      token: "jwt-member-a",
      fetchImpl,
      toDataUrl,
    });
    expect(authedImageCacheSize()).toBe(1);
    clearAuthedImageCache();
    expect(authedImageCacheSize()).toBe(0);
  });
});

describe("<AuthedImage>", () => {
  it("renders the fetched bytes, with the name a screen reader reads", async () => {
    const { fetchImpl, calls } = recordingFetch([imageResponse()]);
    const { getByTestId } = render(
      <AuthedImage
        source={BLOB_PATH}
        accessibilityLabel="Your plate photo"
        testID="scan-photo"
        fetchImpl={fetchImpl}
      />,
    );

    await waitFor(() => expect(getByTestId("scan-photo")).toBeTruthy());
    const image = getByTestId("scan-photo");
    expect(String(image.props.source.uri).startsWith("data:image/jpeg")).toBe(
      true,
    );
    expect(image.props.accessibilityLabel).toBe("Your plate photo");
    expect(calls[0]?.url).toBe(`${WEBAPP_BASE_URL}${BLOB_PATH}`);
  });

  it("says so, rather than crashing, when the URL answers 404", async () => {
    const { fetchImpl } = recordingFetch([imageResponse(404, "application/json")]);
    const { getByTestId, getByText } = render(
      <AuthedImage
        source={BLOB_PATH}
        accessibilityLabel="Your plate photo"
        testID="scan-photo"
        fetchImpl={fetchImpl}
      />,
    );
    await waitFor(() => expect(getByTestId("scan-photo-error")).toBeTruthy());
    expect(getByText(AUTHED_IMAGE_ERROR_MESSAGE)).toBeTruthy();
  });

  it("makes no request at all when the member is signed out", async () => {
    mockAuth.token = null;
    const { fetchImpl, calls } = recordingFetch([imageResponse()]);
    const statuses: string[] = [];
    const { getByTestId } = render(
      <AuthedImage
        source={BLOB_PATH}
        accessibilityLabel="Your plate photo"
        testID="scan-photo"
        fetchImpl={fetchImpl}
        onStatus={(result) => statuses.push(result.status)}
      />,
    );
    await waitFor(() => expect(statuses).toEqual(["signed-out"]));
    expect(calls).toHaveLength(0);
    expect(getByTestId("scan-photo-error")).toBeTruthy();
  });
});
