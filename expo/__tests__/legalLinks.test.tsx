import { render, fireEvent } from "@testing-library/react-native";
import { LegalLinks, LEGAL_BASE_URL } from "@/components/legal/LegalLinks";
import { LEGAL_ENTITY, LEGAL_CONTACT_EMAIL } from "@become/core";

describe("LegalLinks", () => {
  it("renders all legal links and opens them via the launcher without leaving the app", () => {
    const launcher = jest.fn(async () => {});
    const { getByTestId } = render(<LegalLinks launcher={launcher} />);

    const links = [
      { id: "legal-link-terms", path: "/terms" },
      { id: "legal-link-privacy", path: "/privacy" },
      { id: "legal-link-health-data", path: "/health-data" },
      { id: "legal-link-support", path: "/support" },
      { id: "legal-link-delete-account", path: "/delete-account" },
    ];

    for (const link of links) {
      const el = getByTestId(link.id);
      expect(el).toBeTruthy();
      fireEvent.press(el);
      expect(launcher).toHaveBeenCalledWith(`${LEGAL_BASE_URL}${link.path}`);
    }
  });

  it("renders copyright line when showCopyright is true", () => {
    const { getByTestId } = render(<LegalLinks showCopyright />);
    const copyright = getByTestId("legal-copyright");
    expect(copyright).toBeTruthy();
    expect(copyright.props.children).toContain(LEGAL_ENTITY);
  });

  it("renders support address as text and opens mail link", () => {
    const openMail = jest.fn(async () => {});
    const { getByTestId } = render(
      <LegalLinks showSupportEmail openMail={openMail} />,
    );
    const emailEl = getByTestId("legal-support-email");
    expect(emailEl).toBeTruthy();
    expect(emailEl.props.children).toBe(LEGAL_CONTACT_EMAIL);

    fireEvent.press(emailEl);
    expect(openMail).toHaveBeenCalledWith(`mailto:${LEGAL_CONTACT_EMAIL}`);
  });
});
