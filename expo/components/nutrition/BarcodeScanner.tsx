import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal as RNModal,
  Pressable,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Keyboard, ScanBarcode, X } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  BARCODE_SCANNER_TYPES,
  shouldAcceptScan,
} from "@/lib/nutrition/barcodeLookup";

/**
 * Native barcode scanner (NP-088).
 *
 * The web's `BarcodeScanner.tsx` (ZXing): a full-screen camera view reading
 * EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, QR and Data Matrix, manual
 * code entry beside it, and manual entry as the fallback when the camera is
 * denied. This is that screen on `expo-camera`'s `CameraView`:
 * `barcodeScannerSettings` carries the same eight formats, duplicate reads
 * are debounced (the camera fires every frame; the web stops after one hit),
 * and a denial renders the manual form instead of a dead viewfinder.
 *
 * What happens after a read lives with the caller: `onDetected(code)` gets
 * the raw code, exactly like the web's `onDetected`. Lookup, miss copy and
 * the quantity picker are the search sheet's job.
 *
 * COLOURS. A viewfinder is a camera surface, not app chrome: it is black on
 * every phone in either mode, the way the web's scanner is `bg-black` with
 * white text. Tailwind's `bg-black/…` + `text-white/…` classes carry that
 * without a literal, which is what NP-123 bans — literals, not black.
 */

export interface BarcodeScannerProps {
  visible: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  /** Injection point; the app leaves it unset (`useCameraPermissions`). */
  permissionImpl?: typeof useCameraPermissions;
  /** Injection point; the app leaves it unset (`CameraView`). */
  cameraImpl?: typeof CameraView;
  testID?: string;
}

type ScanPhase = "checking" | "scanning" | "denied";

export function BarcodeScanner({
  visible,
  onClose,
  onDetected,
  permissionImpl = useCameraPermissions,
  cameraImpl: CameraImpl = CameraView,
  testID = "barcode-scanner",
}: BarcodeScannerProps) {
  const { colors } = useThemeTokens();
  const [permission, requestPermission] = permissionImpl();
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [requesting, setRequesting] = useState(false);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);

  const granted = permission?.granted === true;
  const denied = permission != null && permission.granted !== true;
  const phase: ScanPhase = granted
    ? "scanning"
    : denied
      ? "denied"
      : "checking";

  const handleRequestPermission = useCallback(async () => {
    setRequesting(true);
    try {
      await requestPermission();
    } finally {
      setRequesting(false);
    }
  }, [requestPermission]);

  const handleBarCodeScanned = useCallback(
    ({ data }: { data: string }) => {
      const now = Date.now();
      if (!shouldAcceptScan(data, lastScanRef.current, now)) return;
      lastScanRef.current = { code: data, at: now };
      onDetected(data);
    },
    [onDetected],
  );

  const handleManualSubmit = useCallback(() => {
    const code = manualCode.trim();
    if (!code) return;
    onDetected(code);
  }, [manualCode, onDetected]);

  if (!visible) return null;

  return (
    <RNModal
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
      testID={testID}
    >
      <View className="flex-1 bg-black" testID={`${testID}-root`}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Text className="text-sm font-semibold text-white">
            Scan Barcode
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {phase === "scanning" && !showManual ? (
              <Pressable
                testID={`${testID}-manual-toggle`}
                accessibilityRole="button"
                accessibilityLabel="Enter barcode manually"
                onPress={() => setShowManual(true)}
                hitSlop={8}
                className="bg-white/10 items-center justify-center rounded-full"
                style={{ width: 36, height: 36 }}
              >
                <Keyboard size={16} color={colors.background} />
              </Pressable>
            ) : null}
            <Pressable
              testID={`${testID}-close`}
              accessibilityRole="button"
              accessibilityLabel="Close scanner"
              onPress={onClose}
              hitSlop={8}
              className="bg-white/10 items-center justify-center rounded-full"
              style={{ width: 36, height: 36 }}
            >
              <X size={20} color={colors.background} />
            </Pressable>
          </View>
        </View>

        {/* Camera view */}
        <View style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {phase === "scanning" ? (
            <CameraImpl
              testID={`${testID}-camera`}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: [...BARCODE_SCANNER_TYPES],
              }}
              onBarcodeScanned={handleBarCodeScanned}
              style={{ flex: 1 }}
            />
          ) : null}

          {phase === "scanning" ? (
            <View
              pointerEvents="none"
              testID={`${testID}-viewfinder`}
              className="border-white/90 rounded-lg"
              style={{
                position: "absolute",
                left: "8%",
                top: "20%",
                width: "84%",
                height: "50%",
                borderLeftWidth: 2,
                borderRightWidth: 2,
                borderTopWidth: 2,
                borderBottomWidth: 2,
              }}
            />
          ) : null}
          {phase === "scanning" ? (
            <Text
              className="text-xs text-white/70 text-center"
              style={{
                position: "absolute",
                bottom: "18%",
                left: 0,
                right: 0,
              }}
            >
              Point the camera at a barcode
            </Text>
          ) : null}

          {phase === "checking" ? (
            <View
              testID={`${testID}-initializing`}
              className="bg-black/80 items-center justify-center"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                gap: 12,
              }}
            >
              <ActivityIndicator color={colors.background} />
              <Text className="text-sm text-white/70">Starting camera…</Text>
            </View>
          ) : null}

          {phase === "denied" && !showManual ? (
            <View
              testID={`${testID}-denied`}
              className="bg-black/90 items-center justify-center px-8"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                gap: 12,
              }}
            >
              <View
                className="bg-destructive/20 items-center justify-center rounded-full"
                style={{ width: 48, height: 48 }}
              >
                <ScanBarcode size={24} color={colors.destructive} />
              </View>
              <Text
                testID={`${testID}-denied-message`}
                className="text-sm text-white/80 text-center"
              >
                Camera access was denied. Allow camera permission in Settings,
                or enter the barcode manually below.
              </Text>
              <Button
                testID={`${testID}-request-permission`}
                variant="secondary"
                loading={requesting}
                onPress={() => void handleRequestPermission()}
              >
                Allow camera
              </Button>
              <Button
                testID={`${testID}-denied-manual`}
                variant="secondary"
                onPress={() => setShowManual(true)}
              >
                Enter code manually
              </Button>
            </View>
          ) : null}
        </View>

        {/* Manual entry panel — always offered beside the viewfinder, and the
            fallback when the camera is denied, exactly like the web. */}
        {(showManual || phase === "denied") && (
          <View
            testID={`${testID}-manual-form`}
            className="bg-card flex-row items-center px-4 py-3"
            style={{ gap: 8 }}
          >
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-manual-input`}
                placeholder="Enter barcode number"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numeric"
                value={manualCode}
                onChangeText={setManualCode}
                accessibilityLabel="Barcode number"
              />
            </View>
            <Button
              testID={`${testID}-manual-submit`}
              disabled={!manualCode.trim()}
              onPress={handleManualSubmit}
            >
              Look up
            </Button>
          </View>
        )}
      </View>
    </RNModal>
  );
}
