import fs from "node:fs";
import assert from "node:assert/strict";

const read = path => fs.readFileSync(path, "utf8");
const version = JSON.parse(read("version.json")).version;
const codex = read("js/codex-client.js");
const loader = read("js/data-loader.js");
const report = read("js/update-report.js");
const referenceWorkflow = read(".github/workflows/update-reference-decks.yml");

assert.equal(version, "01.04.001", "Beyond Codex migration must remain intact in app version 01.04.001");
assert.match(codex, /SomostVE\/beyond_codex\/main\/api\/v1/, "Beyond Decks must consume Beyond Codex v1");
assert.match(codex, /LOCAL_OFFICIAL_BASE = "\.\/data\/official"/, "Embedded official data must remain as a safe migration fallback");
assert.match(loader, /loadOfficialCardData/, "Main data loader must use the Beyond Codex client");
assert.doesNotMatch(loader, /fetch\("\.\/data\/official\/cards\.json"/, "Main data loader must not directly own the official card snapshot");
assert.match(report, /loadOfficialChangelog/, "Update report must use the Beyond Codex changelog");
assert.doesNotMatch(report, /fetch\("\.\/data\/official\/changelog\.json"/, "Update report must not directly own the official changelog");
assert.equal(fs.existsSync("scripts/update-cards.mjs"), false, "Official card updater belongs in Beyond Codex, not Beyond Decks");
assert.equal(fs.existsSync(".github/workflows/update-cards.yml"), false, "Official card update workflow belongs in Beyond Codex");
assert.equal(fs.existsSync(".github/workflows/update-reference-decks.yml"), true, "Beyond Decks must retain its application-specific reference deck updater");
assert.doesNotMatch(referenceWorkflow, /schedule:/, "Beyond Decks must not run a weekly official-data schedule");
assert.doesNotMatch(referenceWorkflow, /scripts\/update-cards\.mjs/, "Reference deck workflow must not call the removed official card updater");
assert.equal(fs.existsSync("data/official/cards.json"), true, "Migration fallback snapshot must remain until Codex has proven stable");

console.log("Beyond Codex migration regression: OK");
