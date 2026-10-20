/**
 * The API contract check.
 *
 * The question it answers: **does the frontend call the endpoints the backend
 * actually serves?** Today that was an assumption, and the assumption was
 * wrong in both directions:
 *
 *   * `fetchInvitableUnits` read `response.units` while the endpoint answers
 *     with a bare array — the `/admin/users` screen threw on every load, in
 *     production, and the test suite never noticed because the mock answered
 *     with the shape the *client* expected rather than the shape the *server*
 *     sends;
 *   * several client modules declare endpoints the server has never had.
 *
 * A renamed or deleted route breaks the client silently: the screen renders
 * an empty list instead of an error, and nothing in the build complains. This
 * script makes that impossible to miss — it runs in CI and fails the build.
 *
 * How it works
 * ------------
 * 1. Read the backend routers and collect every `METHOD /path` they declare,
 *    including the parameters Express declares (`:id`).
 * 2. Read every client API module and collect every path it calls.
 * 3. Match them: a client path matches a server path when the segments line
 *    up and every client segment that is not a template is a literal match.
 * 4. Report the two directions that matter: a client path with no server
 *    route (the client calls something that does not exist) and a server route
 *    nobody calls (dead surface, worth knowing about).
 *
 * Run it: `pnpm run check:api` from `frontend/`, or `node scripts/check-api-contract.mjs`
 * from the repository root.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(here, "..");
const backendRoutes = join(repoRoot, "backend", "src", "routes");
const frontendApi = join(repoRoot, "frontend", "src", "api");
const mobileApi = join(repoRoot, "mobile", "lib", "data", "api");

/** Every file in a directory (recursively), as absolute paths. */
function filesIn(dir) {
  if (!existsDir(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesIn(full));
    else if (/\.(ts|tsx|dart)$/.test(entry)) out.push(full);
  }
  return out;
}

function existsDir(dir) {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The server's routes.
 *
 * Read from the router files rather than from a running server: the check has
 * to work in CI, where there is no database and no booted process. A route is
 * recognised by the `router.get("/x"`, `router.post("/x"`, … shape; the
 * `app.use` mount prefixes are applied separately.
 */
function serverRoutes() {
  const routes = [];
  for (const file of filesIn(backendRoutes)) {
    const source = readFileSync(file, "utf8");
    // One match per declaration, capturing the whole literal list:
    //   `router.get("/x", ...)`  or  `router.get(["/x", "/auth/x"], ...)`
    const re =
      /\b(\w*[Rr]outer)\.(get|post|put|patch|delete)\(\s*(\[\s*"[^"]+"\s*(?:,\s*"[^"]+"\s*)*\]|"[^"]+")/g;
    let match;
    while ((match = re.exec(source)) !== null) {
      const [, routerName, method, literalList] = match;
      const literals = [...literalList.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      for (const path of literals) {
        routes.push({
          method: method.toUpperCase(),
          path: path === "/" ? "" : path,
          router: routerName,
          file: relative(repoRoot, file),
        });
      }
    }
  }
  // A few routes are declared straight on the app (the health check), not on a
  // router, so the app file is read as well.
  const appFile = join(repoRoot, "backend", "src", "app.ts");
  const appSource = readFileSync(appFile, "utf8");
  const appRe = /app\.(get|post|put|patch|delete)\(\s*(\[\s*"[^"]+"\s*(?:,\s*"[^"]+"\s*)*\])/g;
  let appMatch;
  while ((appMatch = appRe.exec(appSource)) !== null) {
    for (const literal of [...appMatch[2].matchAll(/"([^"]+)"/g)].map((m) => m[1])) {
      routes.push({
        method: appMatch[1].toUpperCase(),
        path: literal === "/" ? "" : literal,
        router: "app",
        file: relative(repoRoot, appFile),
      });
    }
  }
  return routes;
}

/** The mount prefixes the app uses (`app.use(["/api/v1/items", "/items"], itemsRouter)`). */
function mountPrefixes() {
  const appFile = join(repoRoot, "backend", "src", "app.ts");
  const source = readFileSync(appFile, "utf8");
  const prefixes = new Map(); // router file -> prefixes
  const re = /app\.use\(\s*\[([^\]]+)\]\s*,\s*(\w+)\s*\)/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const list = match[1]
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
    const router = match[2];
    const file = routerToFile(router);
    if (file) prefixes.set(file, list);
  }
  return prefixes;
}

/** `itemsRouter` -> `routes/items.ts` (the router is declared in a file of that name). */
function routerToFile(routerName) {
  const base = routerName.replace(/Router$/, "");
  const guess = join(backendRoutes, `${base}.ts`);
  if (existsDir(join(backendRoutes, base))) return guess;
  try {
    statSync(guess);
    return guess;
  } catch {
    return null;
  }
}

/** The client's calls: every path literal passed to apiClient / dio. */
function clientCalls() {
  const calls = [];
  const webFiles = filesIn(frontendApi);
  for (const file of webFiles) {
    const source = readFileSync(file, "utf8");
    const re = /(?:apiClient|client)\.(get|post|put|patch|delete)(?:<[^>]*>)?\(\s*`([^`]+)`/g;
    let match;
    while ((match = re.exec(source)) !== null) {
      calls.push({ method: match[1].toUpperCase(), path: match[2], file: relative(repoRoot, file) });
    }
  }
  const mobileFiles = filesIn(mobileApi);
  for (const file of mobileFiles) {
    const source = readFileSync(file, "utf8");
    // Dart writes the path on the next line, and the generic type may nest
    // (`<Map<String, dynamic>>`), so the path is taken as the first quoted
    // string after the call rather than by matching the type arguments.
    const re = /\.(get|post|put|patch|delete)[\s\S]{0,140}?'([^']+)'/g;
    let match;
    while ((match = re.exec(source)) !== null) {
      // Only a path counts: a captured `format` is a query key, not a route.
      if (!match[2].startsWith("/")) continue;
      calls.push({ method: match[1].toUpperCase(), path: match[2], file: relative(repoRoot, file) });
    }
  }
  return calls;
}

/** Turn a client path into segments, marking the template ones. */
function segments(path) {
  return path
    .split("/")
    .filter(Boolean)
    .map((s) => (s.startsWith(":") || s.startsWith("${") || s.includes("${") ? "*" : s));
}

/** Does a client path match a server path? */
function matches(clientPath, serverPath) {
  const c = segments(clientPath);
  const s = segments(serverPath);
  if (c.length !== s.length) return false;
  return c.every((seg, i) => seg === "*" || s[i] === "*" || seg === s[i]);
}

const prefixes = mountPrefixes();
const server = serverRoutes();

// Expand every router route with the prefixes it is mounted under.
const expanded = [];
for (const route of server) {
  const mounts = prefixes.get(join(repoRoot, route.file)) ?? [];
  const roots = mounts.length ? mounts : [""];
  for (const root of roots) {
    const full = `${root}${route.path}`.replace(/\/+$/, "") || "/";
    expanded.push({ ...route, path: full });
  }
}

const calls = clientCalls();
const problems = [];
const used = new Set();

for (const call of calls) {
  const found = expanded.find((r) => r.method === call.method && matches(call.path, r.path));
  if (found) {
    used.add(found);
    continue;
  }
  const sameMethod = expanded.filter((r) => r.method === call.method);
  problems.push(
    `CLIENT CALLS A ROUTE THAT DOES NOT EXIST\n` +
      `    ${call.method} ${call.path}\n` +
      `    called from: ${call.file}\n` +
      (sameMethod.length
        ? `    the server does have: ${sameMethod.map((r) => r.method + " " + r.path).join(", ")}\n`
        : `    the server has no ${call.method} route at all\n`),
  );
}

const uncalled = expanded.filter((r) => !used.has(r));

console.log("=".repeat(72));
console.log("API CONTRACT CHECK");
console.log("=".repeat(72));
console.log(`server routes : ${expanded.length} (from ${server.length} declarations)`);
console.log(`client calls  : ${calls.length}`);
console.log(`matched       : ${calls.length - problems.length}`);
console.log("");

if (problems.length) {
  console.log(`❌ ${problems.length} CLIENT CALL(S) WITH NO SERVER ROUTE\n`);
  for (const p of problems) console.log(p + "\n");
} else {
  console.log("✅ every client call resolves to a server route");
}

// Server routes nobody calls are not failures — an endpoint can exist for a
// mobile client, a cron, or a future screen — but they are worth knowing.
const interestingUncalled = uncalled.filter((r) => !r.path.startsWith("/auth/accept-invite"));
console.log(`\nserver routes with no client caller: ${interestingUncalled.length}`);
for (const r of interestingUncalled.slice(0, 40)) {
  console.log(`    ${r.method.padEnd(6)} ${r.path}`);
}
if (interestingUncalled.length > 40) {
  console.log(`    … and ${interestingUncalled.length - 40} more`);
}

if (problems.length) {
  console.error("\nCONTRACT BROKEN — fix the client or add the route before shipping.");
  process.exit(1);
}
