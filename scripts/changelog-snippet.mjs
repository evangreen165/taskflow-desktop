import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
const version = pkg.version;
const lines = changelog.split("\n");

const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
if (start === -1) {
  console.error(`CHANGELOG.md has no section for [${version}]`);
  process.exit(1);
}

const block = [];
for (let i = start; i < lines.length; i++) {
  if (i > start && lines[i].startsWith("## ")) break;
  block.push(lines[i]);
}
console.log(block.join("\n"));
