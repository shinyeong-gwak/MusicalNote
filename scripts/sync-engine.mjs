import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
if (!target) throw new Error("Usage: npm run sync:lickgo -- /path/to/PleasePracticeJazz");
const checkout = resolve(target);
if (!existsSync(resolve(checkout, "templates")) || !existsSync(resolve(checkout, "static"))) {
    throw new Error("Target must be a LickGo checkout with templates/ and static/.");
}
execFileSync(resolve(root, "node_modules/.bin/esbuild"), [
    "packages/score-engine/src/index.ts", "--bundle", "--platform=browser", "--target=es2018",
    "--format=iife", "--global-name=LickGoScore", "--minify", "--legal-comments=inline",
    "--outfile=dist/score-engine.js",
], {cwd: root, stdio: "inherit"});
const destination = resolve(checkout, "static/vendor/lickgo-score-engine");
mkdirSync(destination, {recursive: true});
copyFileSync(resolve(root, "dist/score-engine.js"), resolve(destination, "score-engine.js"));
copyFileSync(resolve(root, "opensheetmusicdisplay.LICENSE.txt"), resolve(destination, "opensheetmusicdisplay.LICENSE.txt"));
const {version} = JSON.parse(readFileSync(resolve(root, "packages/score-engine/package.json"), "utf8"));
for (const template of ["music/licks.html", "music/render.html", "v2/music/library.html", "v2/music/render.html"]) {
    const file = resolve(checkout, "templates", template);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const updated = text.replace(/(vendor\/lickgo-score-engine\/score-engine\.js\?v=)[^"]+/g, (_, prefix) => prefix + version);
    if (updated !== text) writeFileSync(file, updated);
}
console.log("Updated LickGo score engine " + version + " at " + destination);
