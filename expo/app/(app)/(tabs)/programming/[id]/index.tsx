import { useCallback, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ProgramDetailResponseSchema,
  ActiveProgramsApiResponseSchema,
  ProgramEnrollResponseSchema,
  ProgramStartDateResponseSchema,
  ProgramAbandonResponseSchema,
  type ProgramAbandonRequest,
  type ProgramAbandonResponse,
  type ProgramEnrollRequest,
  type ProgramEnrollResponse,
  type ProgramStartDateRequest,
  type ProgramStartDateResponse,
} from "@become/api-client";
import { ProgramDetail } from "@/components/programs/ProgramDetail";
import type { ProgramDetailViewModel } from "@/components/programs/ProgramDetail";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useMutation } from "@/lib/hooks/useMutation";
import { toProgramDetailViewModel } from "@/lib/programs/programDetail";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/** Local YYYY-MM-DD for the start-date mutation default. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ProgramDetailRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { token } = useAuth();

  const fetchOpts = {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
  };

  const { data, error } = useFetch(
    id ? `/api/programs/${encodeURIComponent(id)}` : null,
    ProgramDetailResponseSchema,
    fetchOpts,
  );

  // Active-programs read kept here so the enroll/start-date/abandon mutations
  // can re-pull it on success (no shared query cache yet).
  const active = useFetch(
    "/api/programs/active",
    ActiveProgramsApiResponseSchema,
    { ...fetchOpts, skip: !token },
  );

  const mutOpts = {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    onSuccess: () => {
      void active.refetch();
    },
  };
  // One schema per route (NP-019). ProgramEnrollResponseSchema parses BOTH
  // enrol answers — the fresh one and the already-enrolled one, which share a
  // 200 and differ only by `alreadyEnrolled`.
  const enrollMut = useMutation<ProgramEnrollRequest, ProgramEnrollResponse>(
    "/api/programs/enroll",
    ProgramEnrollResponseSchema,
    { method: "POST", ...mutOpts },
  );
  const startDateMut = useMutation<
    ProgramStartDateRequest,
    ProgramStartDateResponse
  >("/api/programs/start-date", ProgramStartDateResponseSchema, {
    method: "PUT",
    ...mutOpts,
  });
  const abandonMut = useMutation<ProgramAbandonRequest, ProgramAbandonResponse>(
    "/api/programs/abandon",
    ProgramAbandonResponseSchema,
    { method: "POST", ...mutOpts },
  );

  const [actionPending, setActionPending] = useState(false);
  const runAction = useCallback(async (fn: () => Promise<unknown>) => {
    setActionPending(true);
    try {
      await fn();
    } catch {
      // Surface nothing for now; the action buttons re-enable below.
    } finally {
      setActionPending(false);
    }
  }, []);

  const onEnroll = useCallback(
    () => runAction(() => enrollMut.mutate({ programId: id })),
    [runAction, enrollMut, id],
  );
  const onSetStartDate = useCallback(
    () =>
      runAction(() =>
        startDateMut.mutate({ programId: id, startDate: todayIso() }),
      ),
    [runAction, startDateMut, id],
  );
  const onAbandon = useCallback(
    () => runAction(() => abandonMut.mutate({ programId: id })),
    [runAction, abandonMut, id],
  );

  if (!id) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View style={{ padding: 16 }}>
          <Text className="text-destructive">Missing program id</Text>
        </View>
      </SafeAreaView>
    );
  }

  const program: ProgramDetailViewModel = data
    ? toProgramDetailViewModel(data)
    : { id, name: "Loading…", description: "", phases: [] };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="programming-detail-route"
    >
      {error ? (
        <View style={{ padding: 16 }}>
          <Text testID="programming-detail-error" className="text-destructive">
            Couldn&apos;t load this program.
          </Text>
        </View>
      ) : null}
      <ProgramDetail
        program={program}
        onPhasePress={(phaseIndex) =>
          router.push(`/(tabs)/programming/${id}/phase/${phaseIndex}`)
        }
        onEnroll={onEnroll}
        onSetStartDate={onSetStartDate}
        onAbandon={onAbandon}
        actionPending={actionPending}
      />
    </SafeAreaView>
  );
}
