#!/usr/bin/env node

import { Command } from "commander";
import { readPackageJsonAtPath, diffPackages, formatDiff, formatJson } from "./diff.js";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import fs from "node:fs";

const VERSION = "1.0.0";

const program = new Command();

program
  .name("lockdiff")
  .description("See dependency changes between git refs at a glance")
  .version(VERSION)
  .argument("<from>", "Base ref (branch, tag, commit) or 'workspace'")
  .argument("<to>", "Target ref (branch, tag, commit) or 'workspace'")
  .option("-p, --path <dir>", "Path to git repo", ".")
  .option("-f, --file <file>", "Package file to compare", "package.json")
  .option("--json", "Output as JSON")
  .option("--lockfile", "Compare lockfiles instead (package-lock.json)")
  .option("--check", "Exit with code 1 if changes found (CI mode)")
  .action(
    (from: string, to: string, opts: { path: string; file: string; json?: boolean; lockfile?: boolean; check?: boolean }) => {
      const repoPath = resolve(opts.path);
      const file = opts.lockfile ? "package-lock.json" : opts.file;

      // Validate repo
      if (!fs.existsSync(resolve(repoPath, ".git"))) {
        console.error(`Not a git repo: ${repoPath}`);
        process.exit(1);
      }

      // Resolve refs
      const fromRef = resolveRef(repoPath, from);
      const toRef = resolveRef(repoPath, to);

      const before = readPackageJsonAtPath(repoPath, fromRef, file);
      const after = readPackageJsonAtPath(repoPath, toRef, file);

      if (!before && !after) {
        console.error(`No ${file} found at either ref`);
        process.exit(1);
      }

      const result = diffPackages(before ?? {}, after ?? {}, from, to);

      if (opts.json) {
        console.log(formatJson(result));
      } else {
        console.log(formatDiff(result));
      }

      if (opts.check && result.changes.length > 0) {
        process.exit(1);
      }
    }
  );

function resolveRef(repoPath: string, ref: string): string {
  if (ref === "workspace" || ref === "local" || ref === ".") {
    return "workspace";
  }

  try {
    // Try to resolve the ref
    execSync(`git rev-parse --verify ${ref}`, {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return ref;
  } catch {
    console.error(`Invalid ref: ${ref}`);
    process.exit(1);
  }
}

program.parse();
