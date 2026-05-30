import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  WEBAPP_BASE_URL as REEXPORTED_BASE_URL,
  programEditUrl,
} from "@/lib/programs/browserLauncher";

describe("config", () => {
  it("exposes the webapp base URL as an absolute https origin", () => {
    expect(WEBAPP_BASE_URL).toBe("https://become.redbtn.io");
    expect(WEBAPP_BASE_URL).toMatch(/^https:\/\//);
  });

  it("browserLauncher re-exports the same single-source constant", () => {
    expect(REEXPORTED_BASE_URL).toBe(WEBAPP_BASE_URL);
  });

  it("programEditUrl is built from the shared base URL", () => {
    expect(programEditUrl("p1")).toBe(
      `${WEBAPP_BASE_URL}/dashboard/programming/p1/edit`,
    );
  });
});
