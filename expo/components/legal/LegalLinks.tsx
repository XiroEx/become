import { useCallback } from "react";
import { View, Pressable, Linking } from "react-native";
import { Text } from "@/components/Text";
import {
  LEGAL_ENTITY,
  LEGAL_LINKS,
  LEGAL_CONTACT_EMAIL,
} from "@become/core";
import {
  defaultBrowserLauncher,
  type BrowserLauncher,
} from "@/lib/programs/browserLauncher";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

export const LEGAL_BASE_URL = "https://becomeurbest.com";

export interface LegalLinksProps {
  showCopyright?: boolean;
  showSupportEmail?: boolean;
  launcher?: BrowserLauncher;
  openMail?: (url: string) => Promise<unknown>;
  testID?: string;
}

export function LegalLinks({
  showCopyright = false,
  showSupportEmail = false,
  launcher = defaultBrowserLauncher,
  openMail,
  testID = "legal-links",
}: LegalLinksProps) {
  const onOpenLink = useCallback(
    (href: string) => {
      const url = `${LEGAL_BASE_URL}${href}`;
      void launcher(url);
    },
    [launcher],
  );

  const onOpenEmail = useCallback(() => {
    const url = `mailto:${LEGAL_CONTACT_EMAIL}`;
    if (openMail) {
      void openMail(url);
    } else {
      void Linking.openURL(url);
    }
  }, [openMail]);

  return (
    <View testID={testID} style={{ gap: 8 }}>
      {showCopyright && (
        <Text
          testID="legal-copyright"
          className="text-muted-foreground text-xs"
        >
          &copy; {new Date().getFullYear()} {LEGAL_ENTITY}
        </Text>
      )}

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          columnGap: 16,
          rowGap: 8,
          alignItems: "center",
        }}
      >
        {LEGAL_LINKS.map((link) => {
          const slug = link.href.replace(/^\//, "");
          return (
            <Pressable
              key={link.href}
              testID={`legal-link-${slug}`}
              accessibilityRole="link"
              accessibilityLabel={link.label}
              onPress={() => onOpenLink(link.href)}
              style={[minTouchTarget, { flexShrink: 1, justifyContent: "center" }]}
            >
              <Text className="text-muted-foreground text-xs underline">
                {link.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {showSupportEmail && (
        <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center" }}>
          <Text className="text-muted-foreground text-xs" style={{ flexShrink: 1 }}>
            Support:{" "}
          </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Email support at ${LEGAL_CONTACT_EMAIL}`}
            onPress={onOpenEmail}
            style={[minTouchTarget, { flexShrink: 1, justifyContent: "center" }]}
          >
            <Text
              testID="legal-support-email"
              className="text-foreground text-xs underline font-medium"
            >
              {LEGAL_CONTACT_EMAIL}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
