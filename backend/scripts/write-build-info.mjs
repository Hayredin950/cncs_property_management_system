/**
 * Writes the build stamp the system-status screen reads.
 *
 * "When was this deployed?" is the first question anyone asks when something
 * looks wrong, and the answer has to be in the app rather than in a deploy log
 * somebody has to go and find. The stamp is the moment the build ran and the
 * revision it built — the two facts that answer it.
 *
 * The file is generated, not committed: it is true of one build and of no other.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "build-info.json");

const stamp = {
  builtAt: new Date().toISOString(),
  commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? "unknown",
};

writeFileSync(target, `${JSON.stringify(stamp, null, 2)}\n`);
console.log(`build stamp written: ${stamp.builtAt} (${stamp.commit.slice(0, 7)})`);
