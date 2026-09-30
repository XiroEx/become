import { View, ScrollView } from "react-native";
import { Text } from "@/components/Text";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge } from "@/components/Badge";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { Toggle } from "@/components/Toggle";
import { PermissionDeniedNotice } from "@/components/media/PermissionDeniedNotice";
import { permissionDeniedMessage } from "@/lib/media/capture";
import { devOnlyRoute } from "@/lib/dev/devOnlyRoute";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * The component gallery. `_stories` is not a private filename to expo-router —
 * it ignores only `+api`, `+html` and `+native-intent` — so this shipped as a
 * live route reachable at `become://_stories`. `devOnlyRoute` (below) sends it
 * to Home in anything but a development build.
 */
export function StoriesGallery() {
  const { colors } = useThemeTokens();
  const [text, setText] = useState("");
  const [toggleOn, setToggleOn] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="stories-screen"
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        testID="stories-scroll"
      >
        <Text className="text-foreground text-2xl font-bold">Become — Stories</Text>

        <Card testID="card-default" title="Card" subtitle="Surface for grouped content">
          <Text className="text-foreground">Default card content goes here.</Text>
        </Card>

        <Card testID="card-buttons" title="Buttons">
          <View style={{ gap: 8 }}>
            <Button testID="btn-primary" variant="primary">Primary</Button>
            <Button testID="btn-secondary" variant="secondary">Secondary</Button>
            <Button testID="btn-destructive" variant="destructive">Destructive</Button>
            <Button testID="btn-ghost" variant="ghost">Ghost</Button>
            <Button testID="btn-loading" variant="primary" loading>Loading</Button>
            <Button testID="btn-disabled" variant="primary" disabled>Disabled</Button>
          </View>
        </Card>

        <Card testID="card-inputs" title="Input">
          <Input
            testID="input-name"
            label="Display name"
            value={text}
            onChangeText={setText}
            placeholder="Jon"
          />
          <View style={{ height: 8 }} />
          <Input
            testID="input-error"
            label="Email"
            value="not-an-email"
            error="Enter a valid email"
            editable={false}
          />
        </Card>

        <Card testID="card-toggle" title="Toggle">
          <Toggle
            testID="toggle-feature"
            value={toggleOn}
            onValueChange={setToggleOn}
            accessibilityLabel="Toggle feature"
          />
        </Card>

        <Card testID="card-badges" title="Badges">
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Badge testID="badge-default">Default</Badge>
            <Badge testID="badge-primary" variant="primary">Primary</Badge>
            <Badge testID="badge-muted" variant="muted">Muted</Badge>
            <Badge testID="badge-destructive" variant="destructive">Destructive</Badge>
            <Badge testID="badge-accent" variant="accent">Accent</Badge>
          </View>
        </Card>

        <Card testID="card-overlays" title="Overlays">
          <View style={{ gap: 8 }}>
            <Button testID="btn-open-modal" onPress={() => setModalOpen(true)}>
              Open modal
            </Button>
            <Button
              testID="btn-open-sheet"
              variant="secondary"
              onPress={() => setSheetOpen(true)}
            >
              Open bottom sheet
            </Button>
          </View>
        </Card>

        {/*
          The one thing a member sees when they refuse the camera or their
          photos (NP-059). It is here because it is the hardest state to reach
          on purpose — you have to deny the permission first — and because a
          sentence that has to be read under stress is worth looking at.
        */}
        <Card testID="card-media" title="Permission denied">
          <PermissionDeniedNotice
            testID="media-permission-denied"
            denial={{
              status: "permission-denied",
              source: "camera",
              canAskAgain: false,
              message: permissionDeniedMessage("camera", false),
            }}
          />
        </Card>
      </ScrollView>

      <Modal
        testID="modal-demo"
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Modal demo"
      >
        <Text className="text-foreground mb-4">
          Tap outside the card to dismiss.
        </Text>
        <Button testID="modal-confirm" onPress={() => setModalOpen(false)}>
          Confirm
        </Button>
      </Modal>

      <BottomSheet
        testID="sheet-demo"
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Bottom sheet demo"
      >
        <Text className="text-foreground mb-4">
          Swipe down or tap outside to dismiss (drag-to-dismiss is P19 polish).
        </Text>
        <Button testID="sheet-confirm" onPress={() => setSheetOpen(false)}>
          Confirm
        </Button>
      </BottomSheet>
    </SafeAreaView>
  );
}

export default devOnlyRoute(StoriesGallery);
