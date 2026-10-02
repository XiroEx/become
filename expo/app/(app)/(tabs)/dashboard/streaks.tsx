import { useCallback, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  StreaksResponseSchema,
  FreezeSuccessResponseSchema,
  apiFetch,
  ApiError,
  type StreaksPayload,
} from "@become/api-client";
import { StreaksScreen } from "@/components/streaks/StreaksScreen";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { tzOffsetMinutes, withTz } from "@/lib/time/localDay";
import { useFetch } from "@/lib/hooks/useFetch";
import { writeCache } from "@/lib/cache/lastKnown";

export default function StreaksRoute() {
  const { token } = useAuth();
  const router = useRouter();
  const ready = !!token;
  const params = useLocalSearchParams<{ milestone?: string }>();
  const initialMilestone = params.milestone ? parseInt(params.milestone, 10) : null;
  const [milestoneCelebration, setMilestoneCelebration] = useState<number | null>(
    initialMilestone && !Number.isNaN(initialMilestone) ? initialMilestone : null,
  );

  const fetchOpts = {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !ready,
    useCache: true,
    cacheKey: "streaks",
  };

  const streaks = useFetch(
    ready ? withTz("/api/streaks") : null,
    StreaksResponseSchema,
    fetchOpts,
  );

  const [freezeData, setFreezeData] = useState<StreaksPayload | null>(null);
  const [freezing, setFreezing] = useState(false);
  const [freezeError, setFreezeError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const data = freezeData ?? streaks.data;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setFreezeError(null);
    try {
      await streaks.refetch();
      setFreezeData(null);
    } finally {
      setRefreshing(false);
    }
  }, [streaks]);

  const onUseFreeze = useCallback(async () => {
    if (freezing) return;
    setFreezing(true);
    setFreezeError(null);
    try {
      const res = await apiFetch(
        "/api/streaks/freeze",
        FreezeSuccessResponseSchema,
        {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          method: "POST",
          body: { tz: tzOffsetMinutes() },
        },
      );
      if (res?.streaks) {
        setFreezeData(res.streaks);
        void writeCache("streaks", res.streaks);
        void writeCache(withTz("/api/streaks"), res.streaks);
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const bodyObj =
          typeof e.body === "object" && e.body !== null
            ? (e.body as Record<string, unknown>)
            : null;
        const msg =
          typeof bodyObj?.error === "string" ? bodyObj.error : e.message;
        setFreezeError(msg);
      } else {
        setFreezeError(
          e instanceof Error ? e.message : "Could not use your freeze",
        );
      }
    } finally {
      setFreezing(false);
    }
  }, [freezing, token]);

  const onBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/dashboard");
    }
  }, [router]);

  const onOpenSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  return (
    <StreaksScreen
      data={data}
      loading={streaks.loading && !data}
      error={streaks.error ? "Couldn't load your streaks. Pull to refresh." : null}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={onBack}
      onOpenSettings={onOpenSettings}
      onUseFreeze={onUseFreeze}
      freezing={freezing}
      freezeError={freezeError}
      milestoneCelebration={milestoneCelebration}
      onCloseMilestoneCelebration={() => setMilestoneCelebration(null)}
    />
  );
}
