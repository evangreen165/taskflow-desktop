import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const conf = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));

if (pkg.version !== conf.version) {
  console.error(`version mismatch: package.json=${pkg.version} tauri.conf.json=${conf.version}`);
  process.exit(1);
}

console.log(`version OK: ${pkg.version}`);
