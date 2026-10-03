/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockToken = "test-jwt";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: mockToken,
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

jest.mock("expo-camera", () => {
  const React = require("react");
  const { View } = require("react-native");
  const GRANTED = {
    status: "granted",
    granted: true,
    canAskAgain: true,
    expires: "never",
  };
  const DENIED = {
    status: "denied",
    granted: false,
    canAskAgain: false,
    expires: "never",
  };
  const state: { permission: typeof GRANTED | typeof DENIED } = {
    permission: GRANTED,
  };
  const useCameraPermissions = jest.fn(() => [
    state.permission,
    jest.fn(async () => state.permission),
  ]);
  return {
    __esModule: true,
    __cameraPermissionState: state,
    __GRANTED: GRANTED,
    __DENIED: DENIED,
    CameraView: ({ onBarcodeScanned, testID }: any) => (
      <View
        testID={testID ?? "mock-camera-view"}
        mockOnBarcodeScanned={onBarcodeScanned}
      />
    ),
    useCameraPermissions,
    PermissionStatus: { GRANTED: "granted", UNDETERMINED: "undetermined", DENIED: "denied" },
  };
});

import { apiFetch } from "@become/api-client";
import { FoodSearchSheet } from "@/components/nutrition/FoodSearchSheet";
import { BarcodeScanner } from "@/components/nutrition/BarcodeScanner";
import {
  BARCODE_SCANNER_TYPES,
  barcodeMissMessage,
  BARCODE_LOOKUP_FAILED_MESSAGE,
  lookupBarcode,
  shouldAcceptScan,
} from "@/lib/nutrition/barcodeLookup";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const scannedFood = {
  _id: "6512c0ffee0000000000b001",
  name: "Scanned Peanut Butter",
  brand: "Jar Co",
  source: "openfoodfacts",
  servingSize: 100,
  servingUnit: "g",
  nutrition: { calories: 588, protein: 25, carbs: 20, fats: 50 },
  variants: [],
};

const importedScannedFood = {
  _id: "6512c0ffee0000000000b002",
  name: "Scanned Peanut Butter",
  brand: "Jar Co",
  source: "openfoodfacts",
  servingSize: 100,
  servingUnit: "g",
  nutrition: { calories: 588, protein: 25, carbs: 20, fats: 50 },
  variants: [],
};

function mockBarcodeLookup(food: unknown) {
  mockApiFetch.mockImplementation(async (url: string) => {
    if (String(url).startsWith("/api/nutrition/foods/barcode")) {
      return { food };
    }
    if (String(url).startsWith("/api/nutrition/foods/overview")) {
      return { foods: [], recent: [], frequent: [], meals: [] };
    }
    if (String(url).startsWith("/api/meals")) {
      return { meals: [] };
    }
    return {};
  });
}

describe("barcodeLookup — unit", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it("lookupBarcode hits GET /api/nutrition/foods/barcode?code= and returns the food", async () => {
    mockApiFetch.mockResolvedValueOnce({ food: scannedFood });
    const result = await lookupBarcode(" 012345678905 ", () => mockToken);
    expect(result).toEqual({
      status: "found",
      code: "012345678905",
      food: scannedFood,
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [url, , opts] = mockApiFetch.mock.calls[0]!;
    expect(String(url)).toBe(
      "/api/nutrition/foods/barcode?code=012345678905",
    );
    expect((opts as { baseUrl?: string }).baseUrl).toBeTruthy();
    expect((opts as { getToken?: () => string }).getToken?.()).toBe(mockToken);
  });

  it("a miss resolves with the web's message, not a throw", async () => {
    mockApiFetch.mockResolvedValueOnce({ food: null });
    const result = await lookupBarcode("000000000000", () => mockToken);
    expect(result).toEqual({
      status: "miss",
      code: "000000000000",
      message: barcodeMissMessage("000000000000"),
    });
    expect(barcodeMissMessage("000000000000")).toBe(
      "No food found for barcode 000000000000. Try searching by name.",
    );
  });

  it("a network failure resolves with the web's failure message", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("offline"));
    const result = await lookupBarcode("012345678905", () => mockToken);
    expect(result).toEqual({
      status: "failed",
      code: "012345678905",
      message: BARCODE_LOOKUP_FAILED_MESSAGE,
    });
    expect(BARCODE_LOOKUP_FAILED_MESSAGE).toBe(
      "Barcode lookup failed. Try searching by name.",
    );
  });

  it("the scanner reads the formats the web's reader accepts", () => {
    expect([...BARCODE_SCANNER_TYPES]).toEqual([
      "ean13",
      "ean8",
      "upc_a",
      "upc_e",
      "code128",
      "code39",
      "qr",
      "datamatrix",
    ]);
  });

  it("duplicate reads within the window are debounced", () => {
    expect(shouldAcceptScan("123", null, 1000)).toBe(true);
    expect(
      shouldAcceptScan("123", { code: "123", at: 1000 }, 2000),
    ).toBe(false);
    expect(
      shouldAcceptScan("123", { code: "123", at: 1000 }, 5000),
    ).toBe(true);
    expect(
      shouldAcceptScan("456", { code: "123", at: 1000 }, 1500),
    ).toBe(true);
    expect(shouldAcceptScan("", null, 1000)).toBe(false);
  });
});

describe("BarcodeScanner — component", () => {
  beforeEach(() => {
    const expoCamera = jest.requireMock("expo-camera");
    expoCamera.__cameraPermissionState.permission = expoCamera.__GRANTED;
  });

  it("falls back to manual entry when the camera is denied", async () => {
    const expoCamera = jest.requireMock("expo-camera");
    expoCamera.__cameraPermissionState.permission = expoCamera.__DENIED;
    const onDetected = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <BarcodeScanner
        visible={true}
        onClose={() => {}}
        onDetected={onDetected}
      />,
    );
    await waitFor(() => {
      expect(getByTestId("barcode-scanner-denied")).toBeTruthy();
    });
    expect(getByTestId("barcode-scanner-manual-form")).toBeTruthy();
    expect(queryByTestId("barcode-scanner-camera")).toBeNull();

    fireEvent.changeText(
      getByTestId("barcode-scanner-manual-input"),
      "012345678905",
    );
    fireEvent.press(getByTestId("barcode-scanner-manual-submit"));
    expect(onDetected).toHaveBeenCalledWith("012345678905");
  });

  it("offers manual entry beside the live viewfinder when granted", async () => {
    const onDetected = jest.fn();
    const { getByTestId } = render(
      <BarcodeScanner
        visible={true}
        onClose={() => {}}
        onDetected={onDetected}
      />,
    );
    await waitFor(() => {
      expect(getByTestId("barcode-scanner-camera")).toBeTruthy();
    });
    fireEvent.press(getByTestId("barcode-scanner-manual-toggle"));
    await waitFor(() => {
      expect(getByTestId("barcode-scanner-manual-form")).toBeTruthy();
    });
    fireEvent.changeText(
      getByTestId("barcode-scanner-manual-input"),
      " 012345678905 ",
    );
    fireEvent.press(getByTestId("barcode-scanner-manual-submit"));
    expect(onDetected).toHaveBeenCalledWith("012345678905");
  });
});

describe("FoodSearchSheet — barcode scan (NP-088)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
  });

  it("(id: e015c8a0) a scanned code opens the quantity picker on the server's food with the web's calories", async () => {
    mockBarcodeLookup(scannedFood);
    const onPickFood = jest.fn();
    const { getByTestId } = render(
      <FoodSearchSheet
        visible={true}
        onClose={() => {}}
        onPickFood={onPickFood}
        debounceMs={0}
      />,
    );

    // Reachable from the search sheet.
    fireEvent.press(getByTestId("food-search-barcode-button"));
    await waitFor(() => {
      expect(getByTestId("food-search-barcode-scanner")).toBeTruthy();
    });

    // Simulate the camera read through the scanner's manual form (same
    // onDetected path the CameraView callback takes).
    fireEvent.press(getByTestId("food-search-barcode-scanner-manual-toggle"));
    fireEvent.changeText(
      getByTestId("food-search-barcode-scanner-manual-input"),
      "012345678905",
    );
    await act(async () => {
      fireEvent.press(getByTestId("food-search-barcode-scanner-manual-submit"));
    });

    // Lookup went to the barcode route, not the name search.
    await waitFor(() => {
      expect(
        mockApiFetch.mock.calls.some((c) =>
          String(c[0]).startsWith("/api/nutrition/foods/barcode?code="),
        ),
      ).toBe(true);
    });
    const barcodeCall = mockApiFetch.mock.calls.find((c) =>
      String(c[0]).startsWith("/api/nutrition/foods/barcode?code="),
    )!;
    expect(String(barcodeCall[0])).toBe(
      "/api/nutrition/foods/barcode?code=012345678905",
    );

    // The quantity picker opens on the scanned food with the server's
    // calories — the same number the web shows for that code.
    await waitFor(() => {
      expect(onPickFood).toHaveBeenCalledTimes(1);
    });
    const picked = onPickFood.mock.calls[0]![0];
    expect(picked.name).toBe("Scanned Peanut Butter");
    expect(picked.nutrition.calories).toBe(588);
  });

  it("(id: e015c8a1) an unknown code offers search by name instead of an error", async () => {
    mockBarcodeLookup(null);
    const onPickFood = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <FoodSearchSheet
        visible={true}
        onClose={() => {}}
        onPickFood={onPickFood}
        debounceMs={0}
      />,
    );

    fireEvent.press(getByTestId("food-search-barcode-button"));
    await waitFor(() => {
      expect(getByTestId("food-search-barcode-scanner")).toBeTruthy();
    });
    fireEvent.press(getByTestId("food-search-barcode-scanner-manual-toggle"));
    fireEvent.changeText(
      getByTestId("food-search-barcode-scanner-manual-input"),
      "000000000000",
    );
    await act(async () => {
      fireEvent.press(getByTestId("food-search-barcode-scanner-manual-submit"));
    });

    // The web's miss message, with a Search by name button — not an error.
    await waitFor(() => {
      expect(getByTestId("food-search-barcode-error")).toBeTruthy();
    });
    expect(onPickFood).not.toHaveBeenCalled();
    expect(queryByTestId("food-search-error")).toBeNull();

    // Search by name dismisses the miss and leaves the name search in place.
    fireEvent.press(getByTestId("food-search-barcode-search-name"));
    await waitFor(() => {
      expect(queryByTestId("food-search-barcode-error")).toBeNull();
    });
    expect(getByTestId("food-search-input")).toBeTruthy();
  });

  it("(id: e015c8a2) UPC-A and EAN-13 forms resolve through the same server lookup", async () => {
    // The server treats UPC-A and EAN-13 as one code (candidates on the
    // route); the client sends each form verbatim and opens the same food.
    mockApiFetch.mockImplementation(async (url: string) => {
      if (String(url).startsWith("/api/nutrition/foods/barcode")) {
        return { food: scannedFood };
      }
      if (String(url).startsWith("/api/nutrition/foods/overview")) {
        return { foods: [], recent: [], frequent: [], meals: [] };
      }
      if (String(url).startsWith("/api/meals")) {
        return { meals: [] };
      }
      return {};
    });
    const onPickFood = jest.fn();
    const { getByTestId } = render(
      <FoodSearchSheet
        visible={true}
        onClose={() => {}}
        onPickFood={onPickFood}
        debounceMs={0}
        lookupBarcodeImpl={async (code, getToken) =>
          lookupBarcode(code, getToken)
        }
      />,
    );

    const upcResult = await lookupBarcode("123456789012", () => mockToken);
    const eanResult = await lookupBarcode("0123456789012", () => mockToken);
    expect(upcResult.status).toBe("found");
    expect(eanResult.status).toBe("found");
    if (upcResult.status === "found" && eanResult.status === "found") {
      expect(upcResult.food._id).toBe(eanResult.food._id);
      expect(upcResult.food.nutrition?.calories).toBe(
        eanResult.food.nutrition?.calories,
      );
    }
    const codes = mockApiFetch.mock.calls
      .filter((c) =>
        String(c[0]).startsWith("/api/nutrition/foods/barcode?code="),
      )
      .map((c) => String(c[0]));
    expect(codes).toEqual([
      "/api/nutrition/foods/barcode?code=123456789012",
      "/api/nutrition/foods/barcode?code=0123456789012",
    ]);
    expect(getByTestId("food-search-input")).toBeTruthy();
    expect(importedScannedFood._id).toBeTruthy();
  });

  it("a persistable:false preview shows the web's message and never logs", async () => {
    mockBarcodeLookup({ ...scannedFood, persistable: false });
    const onPickFood = jest.fn();
    const { getByTestId } = render(
      <FoodSearchSheet
        visible={true}
        onClose={() => {}}
        onPickFood={onPickFood}
        debounceMs={0}
      />,
    );
    fireEvent.press(getByTestId("food-search-barcode-button"));
    await waitFor(() => {
      expect(getByTestId("food-search-barcode-scanner")).toBeTruthy();
    });
    fireEvent.press(getByTestId("food-search-barcode-scanner-manual-toggle"));
    fireEvent.changeText(
      getByTestId("food-search-barcode-scanner-manual-input"),
      "012345678905",
    );
    await act(async () => {
      fireEvent.press(getByTestId("food-search-barcode-scanner-manual-submit"));
    });
    // A preview is not a real food: the pick path refuses it with the same
    // message the name search shows, and nothing is handed to the picker.
    await waitFor(() => {
      expect(getByTestId("food-search-error")).toBeTruthy();
    });
    expect(onPickFood).not.toHaveBeenCalled();
  });

  it("initialBarcodeOpen opens the sheet straight onto the scanner", async () => {
    mockBarcodeLookup(scannedFood);
    const { getByTestId } = render(
      <FoodSearchSheet
        visible={true}
        onClose={() => {}}
        debounceMs={0}
        initialBarcodeOpen={true}
      />,
    );
    await waitFor(() => {
      expect(getByTestId("food-search-barcode-scanner")).toBeTruthy();
    });
  });
});
