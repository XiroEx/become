import { renderHook, waitFor } from "@testing-library/react-native";
import {
  noopBiometricsCapability,
  useColdOpenRedirect,
} from "@/lib/auth/coldOpenRedirect";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";
import type { BiometricsCapability } from "@/lib/auth/biometrics";

function alwaysSucceedsBio(): BiometricsCapability {
  return {
    hasHardware: async () => true,
    isEnrolled: async () => true,
    authenticate: async () => ({ success: true }),
  };
}

describe("useColdOpenRedirect", () => {
  it("resolves to login when no JWT is stored", async () => {
    const onResolve = jest.fn();
    const { result } = renderHook(() =>
      useColdOpenRedirect({
        tokenStore: createMemoryTokenStore(null),
        optInStore: createMemoryTokenStore(null),
        biometrics: alwaysSucceedsBio(),
        onResolve,
      }),
    );
    await waitFor(() => {
      expect(result.current?.resolving).toBe(false);
    });
    expect(result.current?.verdict?.kind).toBe("login");
    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "login" }),
    );
  });

  it("resolves to dashboard with a JWT and biometric success", async () => {
    const onResolve = jest.fn();
    const { result } = renderHook(() =>
      useColdOpenRedirect({
        tokenStore: createMemoryTokenStore("jwt-xyz"),
        optInStore: createMemoryTokenStore("yes"),
        biometrics: alwaysSucceedsBio(),
        onResolve,
      }),
    );
    await waitFor(() => {
      expect(result.current?.verdict?.kind).toBe("dashboard");
    });
  });

  it("noopBiometricsCapability reports no hardware → cold-open degrades to dashboard", async () => {
    const { result } = renderHook(() =>
      useColdOpenRedirect({
        tokenStore: createMemoryTokenStore("jwt-xyz"),
        optInStore: createMemoryTokenStore("yes"),
        biometrics: noopBiometricsCapability,
        onResolve: () => {},
      }),
    );
    await waitFor(() => {
      expect(result.current?.verdict?.kind).toBe("dashboard");
    });
  });
});
