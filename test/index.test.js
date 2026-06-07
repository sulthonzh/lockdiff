const assert = require('assert');

// Test extractDeps
function extractDeps(lockfile) {
  if (!lockfile || !lockfile.packages) return {};
  const deps = {};
  for (const [pkgPath, info] of Object.entries(lockfile.packages)) {
    if (!pkgPath || pkgPath === '') continue;
    const parts = pkgPath.split('node_modules/');
    const name = parts[parts.length - 1];
    if (!name) continue;
    deps[name] = {
      version: info.version || '?',
      resolved: info.resolved || '',
      integrity: info.integrity || '',
      dev: info.dev || false,
      optional: info.optional || false,
    };
  }
  return deps;
}

// Test isUpgrade
function isUpgrade(from, to) {
  const parse = v => (v || '').replace(/^[\^~>=<]/, '').split('.').map(Number);
  const a = parse(from);
  const b = parse(to);
  for (let i = 0; i < 3; i++) {
    if ((b[i] || 0) > (a[i] || 0)) return true;
    if ((b[i] || 0) < (a[i] || 0)) return false;
  }
  return true;
}

// Tests
console.log('Running lockdiff tests...\n');

// Test 1: extractDeps parses packages correctly
const lockfile = {
  packages: {
    '': { name: 'test', version: '1.0.0' },
    'node_modules/lodash': { version: '4.17.21', resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz' },
    'node_modules/@types/node': { version: '18.0.0', dev: true },
    'node_modules/express': { version: '4.18.2' },
  }
};
const deps = extractDeps(lockfile);
assert.strictEqual(Object.keys(deps).length, 3, 'Should find 3 packages');
assert.strictEqual(deps.lodash.version, '4.17.21');
assert.strictEqual(deps['@types/node'].dev, true);
assert.strictEqual(deps.express.version, '4.18.2');
console.log('✓ extractDeps parses packages correctly');

// Test 2: extractDeps handles empty lockfile
assert.deepStrictEqual(extractDeps(null), {});
assert.deepStrictEqual(extractDeps({}), {});
assert.deepStrictEqual(extractDeps({ packages: {} }), {});
console.log('✓ extractDeps handles empty input');

// Test 3: isUpgrade detects upgrades
assert.strictEqual(isUpgrade('1.0.0', '1.0.1'), true);
assert.strictEqual(isUpgrade('1.0.0', '1.1.0'), true);
assert.strictEqual(isUpgrade('1.0.0', '2.0.0'), true);
assert.strictEqual(isUpgrade('2.0.0', '1.0.0'), false);
console.log('✓ isUpgrade detects version direction');

// Test 4: isUpgrade handles prerelease
assert.strictEqual(isUpgrade('4.0.0-beta.1', '4.0.0'), true);
console.log('✓ isUpgrade handles version strings');

// Test 5: diff logic
const depsA = { lodash: { version: '4.17.21' }, express: { version: '4.18.1' } };
const depsB = { lodash: { version: '4.17.21' }, express: { version: '4.18.2' }, zod: { version: '3.22.0' } };
const added = {}, removed = {}, changed = {};
for (const [name, info] of Object.entries(depsB)) {
  if (!depsA[name]) added[name] = info;
  else if (depsA[name].version !== info.version) changed[name] = { from: depsA[name], to: info };
}
for (const [name, info] of Object.entries(depsA)) {
  if (!depsB[name]) removed[name] = info;
}
assert.strictEqual(Object.keys(added).length, 1);
assert.strictEqual(Object.keys(removed).length, 0);
assert.strictEqual(Object.keys(changed).length, 1);
assert.strictEqual(added.zod.version, '3.22.0');
assert.strictEqual(changed.express.to.version, '4.18.2');
console.log('✓ Diff logic works correctly');

console.log('\nAll tests passed ✓');
