import * as fs from "fs";
import * as path from "path";
import { Camera } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulatorModule from "expo-image-manipulator";
import {
  CAPTURE_FILE_NAME,
  CAPTURE_MIME_TYPE,
  MEAL_PHOTO_RESIZE,
  PLATE_PHOTO_RESIZE,
  SETTINGS_ACTION_LABEL,
  captureImage,
  openAppSettings,
  permissionDeniedMessage,
  pickPhoto,
  takePhoto,
  targetSize,
  type CaptureDeps,
  type PickedAsset,
  type ResizeRequest,
} from "@/lib/media/capture";

/**
 * NP-059 — taking a photo and picking one, natively.
 *
 * Two of the card's acceptances are decided here:
 *
 *   • "a member can take a photo and pick one from the library, and each
 *     returns a JPEG no wider than 1024 px" — the resize numbers are asserted
 *     against the WEB'S OWN SOURCE, and the default path is driven through the
 *     real expo-camera / expo-image-picker / expo-image-manipulator calls (the
 *     Node-module mocks in `__mocks__/` record instead of using a camera).
 *   • "denying camera permission shows a clear message with a way to Settings
 *     and does not crash" — a refusal comes back as a RESULT, and the sentence
 *     it carries is the one `PermissionDeniedNotice` renders.
 */

const REPO = path.resolve(__dirname, "..", "..");

// `__mocks__/expo-image-manipulator.js` records instead of decoding. One
// module instance, read through the same import the code under test uses.
const manipulatorModule = ImageManipulatorModule as unknown as {
  ImageManipulator: { manipulate: jest.Mock };
  __recorded: {
    uri: string;
    resizes: unknown[];
    saves: Record<string, unknown>[];
    renders: number;
  }[];
  __setSource: (next: { width?: number; height?: number }) => void;
  __setSaved: (next: Record<string, unknown>) => void;
  __reset: () => void;
};
const manipulatorMock = manipulatorModule.ImageManipulator;

const DENIED = {
  status: "denied",
  granted: false,
  canAskAgain: true,
  expires: "never",
};

function asset(overrides: Partial<PickedAsset> = {}): PickedAsset {
  return {
    uri: "file:///cache/original.heic",
    width: 4032,
    height: 3024,
    fileName: "IMG_0001.HEIC",
    ...overrides,
  };
}

/** Records what it was asked to resize, and answers with a plausible JPEG. */
function fakeDeps(
  overrides: Partial<CaptureDeps> = {},
): { deps: CaptureDeps; resizes: ResizeRequest[] } {
  const resizes: ResizeRequest[] = [];
  const deps: CaptureDeps = {
    requestPermission: async () => ({ granted: true, canAskAgain: true }),
    launch: async () => asset(),
    resize: async (request) => {
      resizes.push(request);
      return {
        uri: "file:///cache/resized.jpg",
        width: 1024,
        height: 768,
        base64: "QkFTRTY0",
      };
    },
    ...overrides,
  };
  return { deps, resizes };
}

beforeEach(() => {
  jest.clearAllMocks();
  manipulatorModule.__reset();
});

describe("the resize parameters are the web's", () => {
  it("1024 / 0.6 — the plate scan, the food report and the evidence picker", () => {
    expect(PLATE_PHOTO_RESIZE).toEqual({ maxDim: 1024, quality: 0.6 });
    const webSource = fs.readFileSync(
      path.join(REPO, "webapp", "app", "dashboard", "nutrition", "page.tsx"),
      "utf8",
    );
    expect(webSource).toContain("maxDim: 1024, quality: 0.6");
  });

  it("1600 / 0.82 — the meal and recipe photo", () => {
    expect(MEAL_PHOTO_RESIZE).toEqual({ maxDim: 1600, quality: 0.82 });
    const webSource = fs.readFileSync(
      path.join(REPO, "webapp", "components", "meals", "MealForm.tsx"),
      "utf8",
    );
    expect(webSource).toContain("maxDim: 1600, quality: 0.82");
  });

  it("1024 is the default, because that is what the AI calls are priced on", async () => {
    const { deps, resizes } = fakeDeps();
    await takePhoto({ deps });
    expect(resizes[0]?.spec).toEqual(PLATE_PHOTO_RESIZE);
  });
});

describe("targetSize — the web's branch, reproduced", () => {
  it("caps the LONG edge of a landscape photo and leaves the other to the decoder", () => {
    expect(targetSize(4032, 3024, 1024)).toEqual({ width: 1024 });
  });

  it("caps the long edge of a portrait photo by HEIGHT", () => {
    expect(targetSize(3024, 4032, 1024)).toEqual({ height: 1024 });
  });

  it("never enlarges: an image already inside the cap is left alone", () => {
    expect(targetSize(800, 600, 1024)).toBeNull();
    expect(targetSize(1024, 768, 1024)).toBeNull();
  });

  it("a square photo caps by width", () => {
    expect(targetSize(2000, 2000, 1024)).toEqual({ width: 1024 });
  });

  it("a dimension of 0 is not a size to divide by", () => {
    expect(targetSize(0, 0, 1024)).toBeNull();
    expect(targetSize(Number.NaN, 100, 1024)).toBeNull();
  });
});

describe("captureImage", () => {
  it("returns a JPEG uri AND a data URL the AI routes accept", async () => {
    const { deps } = fakeDeps();
    const result = await takePhoto({ deps });
    expect(result.status).toBe("captured");
    if (result.status !== "captured") return;
    expect(result.image.uri).toBe("file:///cache/resized.jpg");
    expect(result.image.mimeType).toBe(CAPTURE_MIME_TYPE);
    expect(result.image.width).toBeLessThanOrEqual(1024);
    expect(result.image.dataUrl).toBe("data:image/jpeg;base64,QkFTRTY0");
    expect(result.image.fileName).toBe(CAPTURE_FILE_NAME);
  });

  it("the library is the same flow with a different source", async () => {
    const sources: string[] = [];
    const { deps } = fakeDeps({
      launch: async (source) => {
        sources.push(source);
        return asset();
      },
    });
    const result = await pickPhoto({ deps });
    expect(result.status).toBe("captured");
    expect(sources).toEqual(["library"]);
  });

  it("a cancelled picker is not an error", async () => {
    const { deps } = fakeDeps({ launch: async () => null });
    expect(await pickPhoto({ deps })).toEqual({ status: "cancelled" });
  });

  it("carries the caller's filename when it has one", async () => {
    const { deps } = fakeDeps();
    const result = await takePhoto({ deps, fileName: "label.jpg" });
    expect(result.status === "captured" && result.image.fileName).toBe(
      "label.jpg",
    );
  });

  it("uses the meal parameters when the caller asks for them", async () => {
    const { deps, resizes } = fakeDeps();
    await takePhoto({ deps, spec: MEAL_PHOTO_RESIZE });
    expect(resizes[0]?.spec).toEqual({ maxDim: 1600, quality: 0.82 });
  });
});

describe("a refusal is an answer, not a crash", () => {
  it("does not launch anything, and says what to do about it", async () => {
    const launch = jest.fn(async () => asset());
    const { deps } = fakeDeps({
      requestPermission: async () => ({ granted: false, canAskAgain: true }),
      launch,
    });
    const result = await captureImage("camera", { deps });
    expect(result.status).toBe("permission-denied");
    if (result.status !== "permission-denied") return;
    expect(result.source).toBe("camera");
    expect(result.canAskAgain).toBe(true);
    expect(result.message).toMatch(/Become/);
    expect(result.message).toMatch(/Settings/);
    expect(launch).not.toHaveBeenCalled();
  });

  it("says Settings is the only way once the OS has stopped asking", () => {
    const hard = permissionDeniedMessage("camera", false);
    expect(hard).toMatch(/off for Become/);
    expect(hard).toMatch(/Settings/);
    expect(permissionDeniedMessage("library", false)).toMatch(/Settings/);
    expect(permissionDeniedMessage("library", true)).toMatch(/photos/);
  });

  it("names the button beside the message", () => {
    expect(SETTINGS_ACTION_LABEL).toBe("Open Settings");
  });

  it("a camera that throws is a failure with a sentence, not an exception", async () => {
    const { deps } = fakeDeps({
      launch: async () => {
        throw new Error("camera unavailable");
      },
    });
    const result = await captureImage("camera", { deps });
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.message).toMatch(/Become could not get that photo/);
  });

  it("an encoder that throws is a failure too", async () => {
    const { deps } = fakeDeps({
      resize: async () => {
        throw new Error("no base64");
      },
    });
    expect((await takePhoto({ deps })).status).toBe("failed");
  });

  it("a permission check that throws does not take the screen down", async () => {
    const { deps } = fakeDeps({
      requestPermission: async () => {
        throw new Error("module missing");
      },
    });
    expect((await takePhoto({ deps })).status).toBe("failed");
  });

  it("openAppSettings reports whether Settings opened, and never throws", async () => {
    expect(await openAppSettings({ openSettings: async () => {} })).toBe(true);
    expect(
      await openAppSettings({
        openSettings: async () => {
          throw new Error("no such url");
        },
      }),
    ).toBe(false);
  });
});

// ─── The default path: the real modules, through the recording mocks ──────────

describe("the default wiring", () => {
  it("asks expo-camera for the camera, launches the camera picker, and resizes to 1024 / 0.6", async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: "file:///cache/IMG_0001.jpg",
          width: 4032,
          height: 3024,
          fileName: "IMG_0001.jpg",
        },
      ],
    });

    const result = await takePhoto();

    expect(Camera.requestCameraPermissionsAsync).toHaveBeenCalled();
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(1);
    const options = (ImagePicker.launchCameraAsync as jest.Mock).mock
      .calls[0]?.[0] as Record<string, unknown>;
    expect(options.mediaTypes).toEqual(["images"]);
    // Full quality out of the picker: the one compression is the web's.
    expect(options.quality).toBe(1);

    expect(manipulatorMock.manipulate).toHaveBeenCalledWith(
      "file:///cache/IMG_0001.jpg",
    );
    const recorded = manipulatorModule.__recorded[0];
    expect(recorded?.resizes).toEqual([{ width: 1024 }]);
    expect(recorded?.saves[0]).toEqual({
      format: "jpeg",
      compress: 0.6,
      base64: true,
    });

    expect(result.status).toBe("captured");
    if (result.status !== "captured") return;
    expect(result.image.width).toBeLessThanOrEqual(1024);
    expect(result.image.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(
      true,
    );
  });

  it("asks expo-image-picker for the library, and launches the library picker", async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///cache/pick.jpg", width: 3024, height: 4032 }],
    });

    const result = await pickPhoto();

    expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    // Portrait: the LONG edge is the height, so that is the one capped.
    expect(manipulatorModule.__recorded[0]?.resizes).toEqual([
      { height: 1024 },
    ]);
    expect(result.status).toBe("captured");
  });

  it("a denied camera permission from the real module comes back as a refusal", async () => {
    (Camera.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      ...DENIED,
      canAskAgain: false,
    });
    const result = await takePhoto();
    expect(result.status).toBe("permission-denied");
    if (result.status !== "permission-denied") return;
    expect(result.canAskAgain).toBe(false);
    expect(result.message).toMatch(/Settings/);
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it("the member backing out of the system UI is `cancelled`", async () => {
    // The mock's default answer is a cancel.
    expect((await takePhoto()).status).toBe("cancelled");
    expect(manipulatorMock.manipulate).not.toHaveBeenCalled();
  });

  it("asks the decoder which edge is long when the picker reports no size", async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///cache/unknown.jpg", width: 0, height: 0 }],
    });
    manipulatorModule.__setSource({ width: 1500, height: 3000 });

    const result = await pickPhoto();

    const recorded = manipulatorModule.__recorded[0];
    // Two renders: one to learn the real size, one to produce the JPEG.
    expect(recorded?.renders).toBe(2);
    expect(recorded?.resizes).toEqual([{ height: 1024 }]);
    expect(result.status).toBe("captured");
  });

  it("an image already inside the cap is only re-encoded, never enlarged", async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///cache/small.jpg", width: 640, height: 480 }],
    });
    await pickPhoto();
    expect(manipulatorModule.__recorded[0]?.resizes).toEqual([]);
    expect(manipulatorModule.__recorded[0]?.saves[0]).toMatchObject({
      compress: 0.6,
    });
  });

  it("a manipulator that returns no base64 fails instead of building a broken data URL", async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///cache/x.jpg", width: 2000, height: 1000 }],
    });
    manipulatorModule.__setSaved({ base64: undefined });
    expect((await takePhoto()).status).toBe("failed");
  });
});
