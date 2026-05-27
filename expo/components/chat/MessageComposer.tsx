import { useState } from "react";
import { View } from "react-native";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";

export interface MessageComposerProps {
  onSend: (text: string) => Promise<void> | void;
  sending?: boolean;
  testID?: string;
}

export function MessageComposer({
  onSend,
  sending = false,
  testID = "composer",
}: MessageComposerProps) {
  const [text, setText] = useState<string>("");

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    await onSend(trimmed);
    setText("");
  };

  const canSend = text.trim().length > 0 && !sending;

  return (
    <View
      testID={testID}
      style={{ padding: 12, gap: 8 }}
      className="border-t border-border bg-card"
    >
      <Input
        testID={`${testID}-input`}
        placeholder="Type a message…"
        value={text}
        onChangeText={setText}
        multiline
      />
      <Button
        testID={`${testID}-send`}
        onPress={handleSend}
        disabled={!canSend}
        loading={sending}
      >
        Send
      </Button>
    </View>
  );
}
