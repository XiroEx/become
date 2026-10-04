import { useCallback, useState } from "react";
import { Modal, View } from "react-native";
import { useRouter } from "expo-router";
import {
  apiFetch,
  QuickSessionDeleteResponseSchema,
  QuickSessionPatchResponseSchema,
  type QuickSessionPatchRequest,
} from "@become/api-client";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { SlotConfirmDialog } from "@/components/schedule/SlotConfirmDialog";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { rebuildQuickSession } from "@/lib/quickSession/rebuild";
import {
  quickSessionOverviewHref,
  stashQuickSessionWithId,
} from "@/lib/quickSession/store";
import { localDateKey } from "@/lib/time/localDay";
import type { QuickCalItem } from "@/lib/schedule/slotStatus";

/**
 * QUICK SESSION MANAGE SHEET (NP-115).
 *
 * Native port of the web calendar's quick-session Manage sheet
 * (`CalendarClient.tsx` "Manage Session"): move to next day, move to an
 * arbitrary date (`PATCH /api/workouts/session { id, date }` — a move
 * re-dates the log only), skip / un-skip a planned one
 * (`PATCH /api/workouts/session { id, skipped }`), and delete after a
 * confirmation (`DELETE /api/workouts/session?id=`).
 *
 * Continuing happens on the day card itself (Continue / Start Workout rebuilds
 * the draft from the log under its OWN session id via `rebuildQuickSession`,
 * so finishing completes the same log — web `continueQuickSession`).
 */

export function nextDayKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
  dt.setDate(dt.getDate() + 1);
  return localDateKey(dt);
}

/** Local-day key of a quick item's instant (log dates are instants). */
export function quickItemDayKey(item: QuickCalItem): string {
  const d = new Date(item.date);
  if (Number.isNaN(d.getTime())) return item.date.slice(0, 10);
  return localDateKey(d);
}

export interface QuickSessionMenuProps {
  visible: boolean;
  item: QuickCalItem | null;
  pending: boolean;
  onClose: () => void;
  onMoveNextDay: () => void;
  onMoveToDate: (date: string) => void;
  onSkip: () => void;
  onUnskip: () => void;
  onDelete: () => void;
  testID?: string;
}

export function QuickSessionMenu({
  visible,
  item,
  pending,
  onClose,
  onMoveNextDay,
  onMoveToDate,
  onSkip,
  onUnskip,
  onDelete,
  testID = "quick-menu",
}: QuickSessionMenuProps) {
  const { scrim, colors } = useThemeTokens();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [moveDate, setMoveDate] = useState<string>(() =>
    item ? quickItemDayKey(item) : localDateKey(),
  );

  if (!visible || !item) return null;

  const isCompleted = item.status === "completed";
  const isSkipped = item.status === "skipped";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        testID={testID}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: scrim }}
      >
        <View
          style={{
            backgroundColor: colors.card,
            padding: 16,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            gap: 8,
          }}
        >
          <Text className="text-foreground text-lg font-bold">
            Manage Session
          </Text>
          <Text
            testID={`${testID}-subtitle`}
            className="text-muted-foreground text-sm"
          >
            {item.title} · {quickItemDayKey(item)}
          </Text>

          <Button
            testID={`${testID}-next-day`}
            variant="secondary"
            disabled={pending}
            loading={pending}
            onPress={onMoveNextDay}
          >
            Move to Next Day
          </Button>
          <Button
            testID={`${testID}-to-date`}
            variant="secondary"
            disabled={pending}
            onPress={() => {
              setMoveDate(quickItemDayKey(item));
              setDatePickerOpen((v) => !v);
            }}
          >
            Move to Date
          </Button>
          {datePickerOpen ? (
            <View testID={`${testID}-date-picker`} style={{ gap: 8 }}>
              <Input
                testID={`${testID}-date-input`}
                label="Move to date (YYYY-MM-DD)"
                value={moveDate}
                onChangeText={setMoveDate}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
              />
              <Button
                testID={`${testID}-move-confirm`}
                disabled={pending}
                loading={pending}
                onPress={() => {
                  setDatePickerOpen(false);
                  onMoveToDate(moveDate);
                }}
              >
                Move Session
              </Button>
            </View>
          ) : null}
          {!isCompleted ? (
            isSkipped ? (
              <Button
                testID={`${testID}-unskip`}
                variant="secondary"
                disabled={pending}
                loading={pending}
                onPress={onUnskip}
              >
                Un-skip Session
              </Button>
            ) : (
              <Button
                testID={`${testID}-skip`}
                variant="secondary"
                disabled={pending}
                loading={pending}
                onPress={onSkip}
              >
                Skip Session
              </Button>
            )
          ) : null}
          <Button
            testID={`${testID}-delete`}
            variant="destructive"
            disabled={pending}
            loading={pending}
            onPress={onDelete}
          >
            Delete Session
          </Button>
          <Button
            testID={`${testID}-close`}
            variant="secondary"
            onPress={() => {
              setDatePickerOpen(false);
              onClose();
            }}
          >
            Cancel
          </Button>
        </View>
      </View>
    </Modal>
  );
}

export interface UseQuickSessionActionsResult {
  menuItem: QuickCalItem | null;
  deleteConfirmOpen: boolean;
  skipConfirmOpen: boolean;
  pending: boolean;
  continuingId: string | null;
  openMenu: (item: QuickCalItem) => void;
  closeMenu: () => void;
  continueSession: (item: QuickCalItem) => void;
  moveNextDay: () => void;
  moveToDate: (date: string) => void;
  requestSkip: () => void;
  confirmSkip: () => void;
  cancelSkip: () => void;
  unskip: () => void;
  requestDelete: () => void;
  confirmDelete: () => void;
  cancelDelete: () => void;
}

/**
 * Quick-session writes for the calendar day sheet. Every write goes through
 * `apiFetch` (tz merged per request, never set by the screen) and re-pulls via
 * `onSuccess` so the grid reflects the change. Continuing rebuilds the draft
 * under the session's OWN id and pushes the NP-227 overview with `saved=1`.
 */
export function useQuickSessionActions(options: {
  onSuccess?: () => void;
}): UseQuickSessionActionsResult {
  const { token } = useAuth();
  const router = useRouter();
  const [menuItem, setMenuItem] = useState<QuickCalItem | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [continuingId, setContinuing] = useState<string | null>(null);
  const { onSuccess } = options;
  const notifySuccess = useCallback(() => onSuccess?.(), [onSuccess]);

  const openMenu = useCallback((item: QuickCalItem) => {
    setMenuItem(item);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuItem(null);
  }, []);

  const continueSession = useCallback(
    (item: QuickCalItem) => {
      if (!item.sessionId || continuingId) return;
      const sessionId = item.sessionId;
      setContinuing(sessionId);
      void (async () => {
        try {
          const rebuilt = await rebuildQuickSession(sessionId, {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          });
          if (!rebuilt) return;
          // Belt-and-braces: the rebuild already stashed under this id; the
          // overview href carries `saved=1&started=1` so edits write back.
          await stashQuickSessionWithId(
            {
              title: rebuilt.title,
              ...(rebuilt.focus ? { focus: rebuilt.focus } : {}),
              exercises: rebuilt.exercises,
            },
            sessionId,
            { needsName: rebuilt.needsName },
          );
          router.push(
            quickSessionOverviewHref(sessionId, {
              saved: true,
              started: true,
            }) as never,
          );
        } finally {
          setContinuing(null);
        }
      })();
    },
    [continuingId, router, token],
  );

  const patchSession = useCallback(
    async (body: QuickSessionPatchRequest) => {
      setPending(true);
      try {
        await apiFetch("/api/workouts/session", QuickSessionPatchResponseSchema, {
          method: "PATCH",
          body,
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        });
        notifySuccess();
      } finally {
        setPending(false);
      }
    },
    [notifySuccess, token],
  );

  const moveNextDay = useCallback(() => {
    if (!menuItem?.sessionId) return;
    const sessionId = menuItem.sessionId;
    const next = nextDayKey(quickItemDayKey(menuItem));
    void patchSession({ id: sessionId, date: next })
      .then(() => setMenuItem(null))
      .catch(() => {});
  }, [menuItem, patchSession]);

  const moveToDate = useCallback(
    (date: string) => {
      if (!menuItem?.sessionId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const sessionId = menuItem.sessionId;
      void patchSession({ id: sessionId, date })
        .then(() => setMenuItem(null))
        .catch(() => {});
    },
    [menuItem, patchSession],
  );

  const requestSkip = useCallback(() => {
    setSkipConfirmOpen(true);
  }, []);

  const confirmSkip = useCallback(() => {
    if (!menuItem?.sessionId) return;
    const sessionId = menuItem.sessionId;
    void patchSession({ id: sessionId, skipped: true })
      .then(() => {
        setSkipConfirmOpen(false);
        setMenuItem(null);
      })
      .catch(() => {
        setSkipConfirmOpen(false);
      });
  }, [menuItem, patchSession]);

  const cancelSkip = useCallback(() => {
    setSkipConfirmOpen(false);
  }, []);

  const unskip = useCallback(() => {
    if (!menuItem?.sessionId) return;
    const sessionId = menuItem.sessionId;
    void patchSession({ id: sessionId, skipped: false })
      .then(() => setMenuItem(null))
      .catch(() => {});
  }, [menuItem, patchSession]);

  const requestDelete = useCallback(() => {
    setDeleteConfirmOpen(true);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!menuItem?.sessionId) return;
    const sessionId = menuItem.sessionId;
    setPending(true);
    void (async () => {
      try {
        await apiFetch(
          `/api/workouts/session?id=${encodeURIComponent(sessionId)}`,
          QuickSessionDeleteResponseSchema,
          {
            method: "DELETE",
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        notifySuccess();
        setDeleteConfirmOpen(false);
        setMenuItem(null);
      } catch {
        setDeleteConfirmOpen(false);
      } finally {
        setPending(false);
      }
    })();
  }, [menuItem, notifySuccess, token]);

  const cancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false);
  }, []);

  return {
    menuItem,
    deleteConfirmOpen,
    skipConfirmOpen,
    pending,
    continuingId,
    openMenu,
    closeMenu,
    continueSession,
    moveNextDay,
    moveToDate,
    requestSkip,
    confirmSkip,
    cancelSkip,
    unskip,
    requestDelete,
    confirmDelete,
    cancelDelete,
  };
}

export interface QuickSessionConfirmsProps {
  skipOpen: boolean;
  deleteOpen: boolean;
  pending: boolean;
  onConfirmSkip: () => void;
  onCancelSkip: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

/** Confirm gates behind the destructive quick rows (web `window.confirm`). */
export function QuickSessionConfirms({
  skipOpen,
  deleteOpen,
  pending,
  onConfirmSkip,
  onCancelSkip,
  onConfirmDelete,
  onCancelDelete,
}: QuickSessionConfirmsProps) {
  return (
    <>
      <SlotConfirmDialog
        visible={skipOpen}
        title="Skip session?"
        message="It’ll be marked skipped and won’t count as done."
        confirmLabel="Skip"
        pending={pending}
        onConfirm={onConfirmSkip}
        onClose={onCancelSkip}
        testID="quick-confirm-skip"
      />
      <SlotConfirmDialog
        visible={deleteOpen}
        title="Delete session?"
        message="This can’t be undone."
        confirmLabel="Delete"
        pending={pending}
        onConfirm={onConfirmDelete}
        onClose={onCancelDelete}
        testID="quick-confirm-delete"
      />
    </>
  );
}

/** Hidden preload for tree-shaking the router import in tests. */
export function QuickSessionMenuPreload() {
  return null;
}
