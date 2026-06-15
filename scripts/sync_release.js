#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "dist", "visual-qa-release");
const RESERVED_NAMES = new Set(["_metadata", "__MACOSX", ".DS_Store"]);
const RELEASE_ENTRIES = [
  "manifest.json",
  "visual-qa.js",
  "service_worker.js",
  "content-bridge.js",
  "icons",
  "assets"
];

function rmIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyEntry(entryName) {
  const sourcePath = path.join(ROOT, entryName);
  const targetPath = path.join(RELEASE_DIR, entryName);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source entry: ${entryName}`);
  }

  rmIfExists(targetPath);
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}

function cleanReservedEntries(dirPath) {
  const entryNames = fs.readdirSync(dirPath);
  for (const entryName of entryNames) {
    const entryPath = path.join(dirPath, entryName);
    const stat = fs.lstatSync(entryPath);

    if (RESERVED_NAMES.has(entryName)) {
      fs.rmSync(entryPath, { recursive: true, force: true });
      continue;
    }

    if (stat.isDirectory()) {
      cleanReservedEntries(entryPath);
    }
  }
}

function main() {
  ensureDir(RELEASE_DIR);

  for (const entryName of fs.readdirSync(RELEASE_DIR)) {
    rmIfExists(path.join(RELEASE_DIR, entryName));
  }

  for (const entryName of RELEASE_ENTRIES) {
    copyEntry(entryName);
  }

  cleanReservedEntries(RELEASE_DIR);
  console.log(`Release directory is ready: ${RELEASE_DIR}`);
}

main();
