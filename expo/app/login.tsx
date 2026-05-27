import { useState } from "react";
import { KeyboardAvoidingView, Platform, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The real implementation calls /api/auth/send-link and then starts the
  // polling fallback via createPoller. P6 ships the wiring scaffolds — full
  // wiring lands in P7 alongside the dashboard hookup.
  const handleSubmit = () => {
    if (!email.includes("@")) {
      setError("Enter a valid email");
      return;
    }
    setError(null);
    setSubmitted(true);
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="login-screen"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        testID="login-screen-kav"
      >
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-foreground text-3xl font-bold mb-2">Become</Text>
        <Text className="text-muted-foreground text-base mb-6">
          Sign in with a magic link
        </Text>
        {submitted ? (
          <View testID="login-submitted" style={{ width: "100%" }}>
            <Text className="text-foreground text-center mb-2">
              Check your inbox
            </Text>
            <Text className="text-muted-foreground text-center text-sm">
              We sent a sign-in link to {email}. Tap it on your phone to
              continue — we&apos;ll pick it up automatically.
            </Text>
          </View>
        ) : (
          <View style={{ width: "100%" }}>
            <Input
              testID="login-email"
              label="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              error={error ?? undefined}
              placeholder="you@example.com"
            />
            <View style={{ height: 12 }} />
            <Button testID="login-submit" onPress={handleSubmit}>
              Send magic link
            </Button>
          </View>
        )}
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
