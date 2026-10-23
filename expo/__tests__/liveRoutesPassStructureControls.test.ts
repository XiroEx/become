import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Track's Move up / Move down / Remove, Ungroup and the superset toggle only
// render when the route hands LiveWorkoutClient an `onExerciseChange`. The
// quick-session route once left it out and quick sessions silently lost every
// one of those controls (Jon, 2026-10-23). Every route that renders the live
// client must pass it.
function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return /\.tsx$/.test(name) ? [path] : [];
  });
}

describe("every live workout route passes the structure controls", () => {
  const routes = routeFiles(join(__dirname, "..", "app")).filter((file) =>
    readFileSync(file, "utf8").includes("<LiveWorkoutClient"),
  );

  it("finds the live routes", () => {
    expect(routes.length).toBeGreaterThanOrEqual(2);
  });

  it.each(routes.map((r) => [r.split("/app/")[1], r]))(
    "%s passes onExerciseChange",
    (_name, file) => {
      // Each route renders the client once; the prop must be on it.
      const src = readFileSync(file, "utf8");
      expect(src.match(/<LiveWorkoutClient\b/g)).toHaveLength(1);
      expect(src).toMatch(/\bonExerciseChange=\{/);
    },
  );
});
