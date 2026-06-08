const assert = require('assert');
const path = require('path');
const { execSync } = require('child_process');
const { extractDeps, diffDeps, isUpgrade, formatText, formatJSON, formatMarkdown } = require('../src/index');

console.log('Running lockdiff tests...\n');

// --- Unit tests ---

// extractDeps
const lockfile = {
  packages: {
    '': { name: 'test', version: '1.0.0' },
    'node_modules/lodash': { version: '4.17.21', resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz', integrity: 'sha512-abc' },
    'node_modules/@types/node': { version: '18.0.0', dev: true },
    'node_modules/express': { version: '4.18.2', optional: true },
  }
};
const deps = extractDeps(lockfile);
assert.strictEqual(Object.keys(deps).length, 3);
assert.strictEqual(deps.lodash.version, '4.17.21');
assert.strictEqual(deps['@types/node'].dev, true);
assert.strictEqual(deps.express.optional, true);
console.log('✓ extractDeps parses packages correctly');

assert.deepStrictEqual(extractDeps(null), {});
assert.deepStrictEqual(extractDeps({}), {});
assert.deepStrictEqual(extractDeps({ packages: {} }), {});
console.log('✓ extractDeps handles empty input');

// isUpgrade
assert.strictEqual(isUpgrade('1.0.0', '1.0.1'), true);
assert.strictEqual(isUpgrade('1.0.0', '2.0.0'), true);
assert.strictEqual(isUpgrade('2.0.0', '1.0.0'), false);
assert.strictEqual(isUpgrade('1.0.0', '1.0.0'), true); // same = not downgrade
console.log('✓ isUpgrade detects version direction');

// diffDeps
const depsA = { lodash: { version: '4.17.21', resolved: 'a', integrity: 'x' }, express: { version: '4.18.1', resolved: 'b', integrity: 'y' } };
const depsB = { lodash: { version: '4.17.21', resolved: 'a', integrity: 'x' }, express: { version: '4.18.2', resolved: 'b', integrity: 'y' }, zod: { version: '3.22.0', resolved: 'c', integrity: 'z' } };
const { added, removed, changed } = diffDeps(depsA, depsB);
assert.strictEqual(Object.keys(added).length, 1);
assert.strictEqual(Object.keys(changed).length, 1);
assert.strictEqual(added.zod.version, '3.22.0');
assert.strictEqual(changed.express.to.version, '4.18.2');
console.log('✓ diffDeps works correctly');

// diffDeps - integrity-only change
const depX = { foo: { version: '1.0.0', resolved: 'url', integrity: 'sha512-aaa' } };
const depY = { foo: { version: '1.0.0', resolved: 'url', integrity: 'sha512-bbb' } };
const integrityDiff = diffDeps(depX, depY);
assert.strictEqual(Object.keys(integrityDiff.changed).length, 1);
assert.strictEqual(Object.keys(integrityDiff.unchanged).length, 0);
console.log('✓ diffDeps detects integrity-only changes');

// diffDeps - removal
const { removed: rem, added: add } = diffDeps({ a: { version: '1.0.0' }, b: { version: '2.0.0' } }, { b: { version: '2.0.0' } });
assert.strictEqual(Object.keys(rem).length, 1);
assert.strictEqual(rem.a.version, '1.0.0');
assert.strictEqual(Object.keys(add).length, 0);
console.log('✓ diffDeps detects removals');

// formatText
const noChanges = { added: {}, removed: {}, changed: {}, summary: { added: 0, removed: 0, changed: 0, unchanged: 5 } };
assert.ok(formatText(noChanges).includes('No dependency changes'));
console.log('✓ formatText handles no changes');

const withChanges = {
  added: { zod: { version: '3.22.0', dev: true, optional: false } },
  removed: { old: { version: '0.1.0', dev: false, optional: false } },
  changed: { react: { from: { version: '18.0.0' }, to: { version: '19.0.0' } } },
  summary: { added: 1, removed: 1, changed: 1, unchanged: 10 }
};
const text = formatText(withChanges);
assert.ok(text.includes('+ zod@3.22.0 (dev)'));
assert.ok(text.includes('- old@0.1.0'));
assert.ok(text.includes('↑ react 18.0.0 → 19.0.0'));
console.log('✓ formatText formats correctly');

// formatJSON
const json = JSON.parse(formatJSON(withChanges));
assert.strictEqual(json.summary.added, 1);
assert.strictEqual(json.summary.changed, 1);
console.log('✓ formatJSON produces valid JSON');

// formatMarkdown
const md = formatMarkdown(withChanges);
assert.ok(md.includes('## Added'));
assert.ok(md.includes('## Changed'));
assert.ok(md.includes('zod@3.22.0'));
console.log('✓ formatMarkdown produces valid markdown');

// --- CLI integration test ---
const cli = path.resolve(__dirname, '../src/cli.js');
try {
  const help = execSync(`node ${cli} --help`, { encoding: 'utf8' });
  assert.ok(help.includes('lockdiff'));
  assert.ok(help.includes('--since'));
  assert.ok(help.includes('--json'));
  console.log('✓ CLI --help works and includes --since');
} catch (err) {
  console.error('✗ CLI --help failed:', err.message);
  process.exit(1);
}

console.log('\nAll tests passed ✓');
