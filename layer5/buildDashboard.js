// layer5/buildDashboard.js
//
// Run with: node layer5/buildDashboard.js
// (after: npx hardhat run runFullDemo.js --no-compile, which writes
//  layer5/data/demo-output.json)
//
// Inlines the demo snapshot directly into the HTML template as a JSON
// script tag, so the resulting dashboard.html works by double-clicking it
// open in a browser — no local server, no fetch(), no CORS issues from
// file:// restrictions. This is the "functional wireframe" the team's
// own scope doc calls for Layer 5, not a live-data app.

const fs = require("fs");
const path = require("path");

function main() {
  const dataPath = path.join(__dirname, "data", "demo-output.json");
  if (!fs.existsSync(dataPath)) {
    console.error(`No demo snapshot found at ${dataPath}. Run "npx hardhat run runFullDemo.js --no-compile" first.`);
    process.exit(1);
  }

  const templatePath = path.join(__dirname, "dashboard.template.html");
  const template = fs.readFileSync(templatePath, "utf8");
  const demoJson = fs.readFileSync(dataPath, "utf8");

  // Guard against a stray "</script>" inside the JSON breaking out of the tag.
  const safeJson = demoJson.replace(/<\/script>/g, "<\\/script>");
  const html = template.replace("__DEMO_DATA_JSON__", safeJson);

  const outPath = path.join(__dirname, "dashboard.html");
  fs.writeFileSync(outPath, html);
  console.log(`Wrote ${outPath} — open it directly in a browser.`);
}

main();
