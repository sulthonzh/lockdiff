import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diffPackages, formatDiff, formatJson } from "./diff.js";
import type { PackageJson } from "./types.js";

describe("diffPackages", () => {
  it("detects added dependencies", () => {
    const before: PackageJson = {};
    const after: PackageJson = { dependencies: { express: "^4.18.0" } };
    const result = diffPackages(before, after, "main", "feature");
    assert.equal(result.summary.added, 1);
    assert.equal(result.changes[0].name, "express");
    assert.equal(result.changes[0].type, "added");
    assert.equal(result.changes[0].newVersion, "^4.18.0");
  });

  it("detects removed dependencies", () => {
    const before: PackageJson = { devDependencies: { jest: "^29.0.0" } };
    const after: PackageJson = {};
    const result = diffPackages(before, after, "main", "feature");
    assert.equal(result.summary.removed, 1);
    assert.equal(result.changes[0].type, "removed");
  });

  it("detects changed versions", () => {
    const before: PackageJson = { dependencies: { react: "^18.0.0" } };
    const after: PackageJson = { dependencies: { react: "^19.0.0" } };
    const result = diffPackages(before, after, "v1", "v2");
    assert.equal(result.summary.changed, 1);
    assert.equal(result.changes[0].oldVersion, "^18.0.0");
    assert.equal(result.changes[0].newVersion, "^19.0.0");
  });

  it("returns empty for identical packages", () => {
    const pkg: PackageJson = { dependencies: { lodash: "^4.17.0" } };
    const result = diffPackages(pkg, pkg, "a", "b");
    assert.equal(result.summary.total, 0);
  });

  it("handles multiple dep groups", () => {
    const before: PackageJson = {
      dependencies: { express: "^4.18.0" },
      devDependencies: { jest: "^29.0.0", typescript: "^5.3.0" },
    };
    const after: PackageJson = {
      dependencies: { express: "^4.19.0", cors: "^2.8.5" },
      devDependencies: { jest: "^29.0.0" },
    };
    const result = diffPackages(before, after, "main", "pr");
    assert.equal(result.summary.added, 1);
    assert.equal(result.summary.removed, 1);
    assert.equal(result.summary.changed, 1);
    assert.equal(result.summary.total, 3);
  });

  it("handles peerDependencies and optionalDependencies", () => {
    const before: PackageJson = {
      peerDependencies: { react: ">=18" },
    };
    const after: PackageJson = {
      peerDependencies: { react: ">=19" },
      optionalDependencies: { fsevents: "^2.3.0" },
    };
    const result = diffPackages(before, after, "a", "b");
    assert.equal(result.summary.changed, 1);
    assert.equal(result.summary.added, 1);
  });
});

describe("formatDiff", () => {
  it("shows no changes message for empty diff", () => {
    const result = diffPackages({}, {}, "main", "dev");
    const text = formatDiff(result);
    assert.ok(text.includes("No dependency changes"));
  });

  it("formats added deps with +", () => {
    const result = diffPackages(
      {},
      { dependencies: { express: "^4.18.0" } },
      "main",
      "dev"
    );
    const text = formatDiff(result);
    assert.ok(text.includes("+ express"));
    assert.ok(text.includes("^4.18.0"));
  });

  it("formats changed deps with ~", () => {
    const result = diffPackages(
      { dependencies: { react: "^18.0.0" } },
      { dependencies: { react: "^19.0.0" } },
      "a",
      "b"
    );
    const text = formatDiff(result);
    assert.ok(text.includes("~ react"));
    assert.ok(text.includes("→"));
  });
});

describe("formatJson", () => {
  it("produces valid JSON", () => {
    const result = diffPackages(
      { dependencies: { lodash: "^4.17.0" } },
      { dependencies: { lodash: "^4.18.0" } },
      "a",
      "b"
    );
    const json = formatJson(result);
    const parsed = JSON.parse(json);
    assert.equal(parsed.summary.changed, 1);
  });
});
