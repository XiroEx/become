import type { ApiClient } from "@become/api-client";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";
import { setUnauthorizedHandler } from "@/lib/auth/unauthorized";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  BLOB_UPLOAD_FIELD,
  FOOD_FLAG_IMAGE_PATH,
  MEAL_UPLOAD_FIELD,
  SCAN_IMAGE_PATH,
  imageUrlFrom,
  mealImagePath,
  multipartFileFor,
  uploadFoodFlagImage,
  uploadImage,
  uploadMealImage,
  uploadScanImage,
  type FormDataLike,
} from "@/lib/media/upload";

/**
 * NP-059 — a native multipart upload.
 *
 * The part that matters and that nothing else can check: React Native's
 * FormData takes `{ uri, name, type }` (it streams the file off disk itself),
 * the request goes through the SHARED client so it carries the Bearer token,
 * and `Content-Type` is left alone so the networking layer can put its own
 * multipart boundary on it. A hand-set content type is the classic way to make
 * `request.formData()` fail on the server with no useful error.
 */

/** Records the parts, because a jsdom FormData stringifies a file object. */
function recordingForm(): { form: FormDataLike; parts: [string, unknown][] } {
  const parts: [string, unknown][] = [];
  return {
    form: {
      append(name, value) {
        parts.push([name, value]);
      },
    },
    parts,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  } as unknown as Response;
}

function fakeClient(response: Response | (() => Promise<Response>)): {
  client: ApiClient;
  calls: { path: string; init: unknown }[];
} {
  const calls: { path: string; init: unknown }[] = [];
  const client: ApiClient = {
    call: async () => {
      throw new Error("not used");
    },
    raw: async (path, init) => {
      calls.push({ path, init });
      return typeof response === "function" ? response() : response;
    },
  };
  return { client, calls };
}

const IMAGE = { uri: "file:///cache/resized.jpg" };

describe("the multipart part", () => {
  it("is `{ uri, name, type }` — what React Native streams off disk", () => {
    expect(multipartFileFor(IMAGE)).toEqual({
      uri: "file:///cache/resized.jpg",
      name: "photo.jpg",
      type: "image/jpeg",
    });
  });

  it("takes the caller's name and type when it has them", () => {
    expect(
      multipartFileFor({
        uri: "file:///x.png",
        fileName: "label.png",
        mimeType: "image/png",
      }),
    ).toEqual({ uri: "file:///x.png", name: "label.png", type: "image/png" });
  });

  it("goes under the field name the route reads", async () => {
    const { client, calls } = fakeClient(
      jsonResponse(200, { imageUrl: "/api/blob/scans/u1/abc.jpg" }),
    );
    const { form, parts } = recordingForm();
    await uploadImage({
      path: SCAN_IMAGE_PATH,
      image: IMAGE,
      deps: { client, createFormData: () => form },
    });
    expect(parts).toEqual([
      [
        BLOB_UPLOAD_FIELD,
        { uri: IMAGE.uri, name: "photo.jpg", type: "image/jpeg" },
      ],
    ]);
    expect(calls[0]?.path).toBe(SCAN_IMAGE_PATH);
    expect(calls[0]?.init).toMatchObject({ method: "POST" });
  });

  it("the meal route reads `image`, not `file`", async () => {
    const { client, calls } = fakeClient(
      jsonResponse(200, { success: true, imageUrl: "/api/meals/m1/image?v=2" }),
    );
    const { form, parts } = recordingForm();
    const result = await uploadMealImage("m1", IMAGE, {
      client,
      createFormData: () => form,
    });
    expect(parts[0]?.[0]).toBe(MEAL_UPLOAD_FIELD);
    expect(calls[0]?.path).toBe("/api/meals/m1/image");
    expect(result).toEqual({
      status: "uploaded",
      imageUrl: "/api/meals/m1/image?v=2",
    });
  });

  it("escapes the meal id rather than pasting it into the path", () => {
    expect(mealImagePath("a/../b")).toBe("/api/meals/a%2F..%2Fb/image");
  });
});

describe("uploadImage", () => {
  it("returns the same-origin /api/blob URL the web gets", async () => {
    const { client } = fakeClient(
      jsonResponse(200, { imageUrl: "/api/blob/scans/u1/abc.jpg" }),
    );
    expect(await uploadScanImage(IMAGE, { client })).toEqual({
      status: "uploaded",
      imageUrl: "/api/blob/scans/u1/abc.jpg",
    });
  });

  it("food-flag photos go to their own route", async () => {
    const { client, calls } = fakeClient(
      jsonResponse(200, { imageUrl: "/api/blob/food-flags/u1/abc.jpg" }),
    );
    await uploadFoodFlagImage(IMAGE, { client });
    expect(calls[0]?.path).toBe(FOOD_FLAG_IMAGE_PATH);
  });

  it("sends NOTHING when the device has no session", async () => {
    const result = await uploadScanImage(IMAGE, {
      store: createMemoryTokenStore(null),
    });
    expect(result).toEqual({ status: "signed-out" });
  });

  it("passes the server's own refusal through", async () => {
    const { client } = fakeClient(
      jsonResponse(415, { error: "Unsupported image type" }),
    );
    expect(await uploadScanImage(IMAGE, { client })).toEqual({
      status: "failed",
      httpStatus: 415,
      message: "Unsupported image type",
    });
  });

  it("a 401 ends the session, through the one handler that does that", async () => {
    const seen: string[] = [];
    const unsubscribe = setUnauthorizedHandler((reason) => seen.push(reason));
    const { client } = fakeClient(jsonResponse(401, { error: "Unauthorized" }));
    const result = await uploadScanImage(IMAGE, { client });
    unsubscribe();
    expect(result.status).toBe("failed");
    expect(seen).toEqual(["unauthorized"]);
  });

  it("a network error is a failure, not a throw", async () => {
    const client: ApiClient = {
      call: async () => {
        throw new Error("no");
      },
      raw: async () => {
        throw new Error("offline");
      },
    };
    expect((await uploadScanImage(IMAGE, { client })).status).toBe("failed");
  });

  it("a 200 with no imageUrl is a failure, not a silent success", async () => {
    const { client } = fakeClient(jsonResponse(200, { success: true }));
    expect((await uploadScanImage(IMAGE, { client })).status).toBe("failed");
  });

  it("imageUrlFrom only trusts a non-empty string", () => {
    expect(imageUrlFrom({ imageUrl: "/api/blob/x.jpg" })).toBe(
      "/api/blob/x.jpg",
    );
    expect(imageUrlFrom({ imageUrl: "" })).toBeNull();
    expect(imageUrlFrom({ url: "/api/blob/x.jpg" })).toBeNull();
    expect(imageUrlFrom(null)).toBeNull();
    expect(imageUrlFrom("ok")).toBeNull();
  });
});

describe("the request the shared client actually sends", () => {
  it("is a real FormData, Bearer-authenticated, with no hand-set Content-Type", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return jsonResponse(200, { imageUrl: "/api/blob/scans/u1/a.jpg" });
    }) as unknown as typeof fetch;

    const result = await uploadScanImage(IMAGE, {
      store: createMemoryTokenStore("jwt-123"),
      fetchImpl,
    });

    expect(result.status).toBe("uploaded");
    const request = seen[0];
    expect(request?.url.startsWith(`${WEBAPP_BASE_URL}${SCAN_IMAGE_PATH}`)).toBe(
      true,
    );
    expect(request?.init.method).toBe("POST");
    const headers = request?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer jwt-123");
    // The boundary belongs to the networking layer.
    expect(headers["Content-Type"]).toBeUndefined();
    // Passed through untouched — `createApiClient` only does that for a real
    // FormData, and a JSON-stringified body would never parse as multipart.
    expect(request?.init.body instanceof FormData).toBe(true);
  });
});
