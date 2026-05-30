import { execSync } from "node:child_process";
import { PackageJson, DepChange, DiffResult } from "./types.js";
import fs from "node:fs";

/**
 * Read package.json at a given git ref (or "workspace" for local files)
 */
export function readPackageJsonAtPath(
  repoPath: string,
  ref: string,
  filePath: string = "package.json"
): PackageJson | null {
  try {
    let raw: string;
    if (ref === "workspace") {
      raw = fs.readFileSync(`${repoPath}/${filePath}`, "utf-8");
    } else {
      raw = execSync(`git show ${ref}:${filePath}`, {
        cwd: repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
  }

/**
 * Diff two package.json objects and return changes
 */
export function diffPackages(
  before: PackageJson,
  after: PackageJson,
  fromRef: string,
  toRef: string
): DiffResult {
  const changes: DepChange[] = [];
  const groups = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ] as const;

  for (const group of groups) {
    const beforeDeps = before[group] ?? {};
    const afterDeps = after[group] ?? {};
    const allKeys = new Set([
      ...Object.keys(beforeDeps),
      ...Object.keys(afterDeps),
    ]);

    for (const name of allKeys) {
      const oldVer = beforeDeps[name];
      const newVer = afterDeps[name];

      if (!oldVer && newVer) {
        changes.push({ name, type: "added", group, newVersion: newVer });
      } else if (oldVer && !newVer) {
        changes.push({ name, type: "removed", group, oldVersion: oldVer });
      } else if (oldVer && newVer && oldVer !== newVer) {
        changes.push({
          name,
          type: "changed",
          group,
          oldVersion: oldVer,
          newVersion: newVer,
        });
      }
    }
  }

  const added = changes.filter((c) => c.type === "added").length;
  const removed = changes.filter((c) => c.type === "removed").length;
  const changed = changes.filter((c) => c.type === "changed").length;

  return {
    from: fromRef,
    to: toRef,
    changes,
    summary: { added, removed, changed, total: changes.length },
  };
}

/**
 * Format a DiffResult as a readable table
 */
export function formatDiff(result: DiffResult): string {
  const lines: string[] = [];
  const { from, to, changes, summary } = result;

  if (changes.length === 0) {
    return `No dependency changes between ${from} and ${to}`;
  }

  lines.push(`Dependency changes: ${from} → ${to}`);
  lines.push(
    `  ${summary.added} added, ${summary.removed} removed, ${summary.changed} changed (${summary.total} total)`
  );
  lines.push("");

  const grouped = new Map<string, DepChange[]>();
  for (const c of changes) {
    const list = grouped.get(c.group) ?? [];
    list.push(c);
    grouped.set(c.group, list);
  }

  for (const [group, deps] of grouped) {
    lines.push(`  ${group}:`);
    for (const dep of deps) {
      switch (dep.type) {
        case "added":
          lines.push(`    + ${dep.name} ${dep.newVersion}`);
          break;
        case "removed":
          lines.push(`    - ${dep.name} ${dep.oldVersion}`);
          break;
        case "changed":
          lines.push(
            `    ~ ${dep.name} ${dep.oldVersion} → ${dep.newVersion}`
          );
          break;
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

/**
 * Format as JSON
 */
export function formatJson(result: DiffResult): string {
  return JSON.stringify(result, null, 2);
}
