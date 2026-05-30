/* eslint-disable import/first */
import { act, fireEvent, render } from "@testing-library/react-native";
import { Text, Pressable } from "react-native";

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useFoodLog } from "@/lib/nutrition/useFoodLog";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function Harness() {
  const log = useFoodLog({ getToken: () => "test-jwt" });
  return (
    <>
      <Pressable
        testID="add"
        onPress={() =>
          log.addToLog({
            mealType: "lunch",
            date: "2026-06-01",
            food: {
              name: "Banana",
              servings: 1,
              nutrition: { calories: 89, protein: 1, carbs: 23, fats: 0 },
            },
          })
        }
      >
        <Text>add</Text>
      </Pressable>
      <Pressable
        testID="remove"
        onPress={() =>
          log.removeFromLog({ foodEntryId: "e1", date: "2026-06-01" })
        }
      >
        <Text>remove</Text>
      </Pressable>
      <Pressable
        testID="save"
        onPress={() =>
          log.saveFood({
            name: "Banana",
            category: "fruit",
            nutrition: { calories: 89, protein: 1, carbs: 23, fats: 0 },
            source: "usda",
          })
        }
      >
        <Text>save</Text>
      </Pressable>
    </>
  );
}

function findCall(path: string, method: string): unknown[] | undefined {
  return mockApiFetch.mock.calls.find(
    (c) =>
      String(c[0]).startsWith(path) &&
      (c[2] as { method?: string }).method === method,
  );
}

describe("useFoodLog", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({ success: true });
  });

  it("addToLog POSTs /api/nutrition/log with the entry body", async () => {
    const { getByTestId } = render(<Harness />);
    await act(async () => {
      fireEvent.press(getByTestId("add"));
    });
    const call = findCall("/api/nutrition/log", "POST")!;
    expect(call[0]).toBe("/api/nutrition/log");
    expect(call[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        baseUrl: WEBAPP_BASE_URL,
        body: {
          mealType: "lunch",
          date: "2026-06-01",
          food: {
            name: "Banana",
            servings: 1,
            nutrition: { calories: 89, protein: 1, carbs: 23, fats: 0 },
          },
        },
      }),
    );
    expect(
      (call[2] as { getToken?: () => string }).getToken?.(),
    ).toBe("test-jwt");
  });

  it("removeFromLog DELETEs /api/nutrition/log with foodEntryId + date query", async () => {
    const { getByTestId } = render(<Harness />);
    await act(async () => {
      fireEvent.press(getByTestId("remove"));
    });
    const call = findCall("/api/nutrition/log", "DELETE")!;
    expect(String(call[0])).toBe(
      "/api/nutrition/log?foodEntryId=e1&date=2026-06-01",
    );
    expect((call[2] as { method?: string }).method).toBe("DELETE");
  });

  it("saveFood POSTs /api/nutrition/foods with name + category + nutrition", async () => {
    const { getByTestId } = render(<Harness />);
    await act(async () => {
      fireEvent.press(getByTestId("save"));
    });
    const call = findCall("/api/nutrition/foods", "POST")!;
    expect(call[0]).toBe("/api/nutrition/foods");
    expect(call[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        baseUrl: WEBAPP_BASE_URL,
        body: {
          name: "Banana",
          category: "fruit",
          nutrition: { calories: 89, protein: 1, carbs: 23, fats: 0 },
          source: "usda",
        },
      }),
    );
  });
});
