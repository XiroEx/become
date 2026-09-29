import { useCallback, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ProgramDetailResponseSchema,
  ActiveProgramsApiResponseSchema,
  ProgramMutationResponseSchema,
  type ProgramMutationResponse,
} from "@become/api-client";
import { ProgramDetail } from "@/components/programs/ProgramDetail";
import type { ProgramDetailViewModel } from "@/components/programs/ProgramDetail";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useMutation } from "@/lib/hooks/useMutation";
import { toProgramDetailViewModel } from "@/lib/programs/programDetail";

/** Local YYYY-MM-DD for the start-date mutation default. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ProgramDetailRoute() {
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
  const enrollMut = useMutation<{ programId: string }, ProgramMutationResponse>(
    "/api/programs/enroll",
    ProgramMutationResponseSchema,
    { method: "POST", ...mutOpts },
  );
  const startDateMut = useMutation<
    { programId: string; startDate: string },
    ProgramMutationResponse
  >("/api/programs/start-date", ProgramMutationResponseSchema, {
    method: "PUT",
    ...mutOpts,
  });
  const abandonMut = useMutation<{ programId: string }, ProgramMutationResponse>(
    "/api/programs/abandon",
    ProgramMutationResponseSchema,
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
        style={{ flex: 1, backgroundColor: "#0a0a0a" }}
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
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
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
