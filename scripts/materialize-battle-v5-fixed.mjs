import fs from "node:fs";
import zlib from "node:zlib";

const root = new URL("./", import.meta.url);
const payload = [1, 2, 3]
  .map(part => fs.readFileSync(new URL(`.battle-v5-part${part}`, root), "utf8").trim())
  .join("");

const source = zlib.gunzipSync(Buffer.from(payload, "base64")).toString("utf8");
if (!source.includes("export const BATTLE_RULES_VERSION = 5;")) {
  throw new Error("Invalid Battle Sim v5 payload");
}

const target = new URL("../js/battle-engine-v5.js", import.meta.url);
fs.writeFileSync(target, source);
console.log(`Materialized ${target.pathname} (${source.length} bytes)`);
