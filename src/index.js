'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd, cwd) {
  try { return execSync(cmd, { encoding: 'utf8', cwd, stdio: ['pipe','pipe','pipe'] }).trim(); }
  catch { return null; }
}

function getLockfileContent(ref, lockfile, cwd) {
  const raw = run(`git show ${ref}:${lockfile}`, cwd);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

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

function detectLockfile(cwd) {
  for (const f of ['package-lock.json', 'npm-shrinkwrap.json']) {
    if (run(`git ls-files --error-unmatch ${f}`, cwd)) return f;
  }
  for (const f of ['package-lock.json', 'npm-shrinkwrap.json']) {
    if (fs.existsSync(path.join(cwd, f))) return f;
  }
  return 'package-lock.json';
}

function findLastTag(cwd) {
  const tag = run('git describe --tags --abbrev=0 HEAD~1 2>/dev/null || git describe --tags --abbrev=0 2>/dev/null', cwd);
  return tag || null;
}

function isUpgrade(from, to) {
  const parse = v => (v || '').replace(/^[\^~>=<]/, '').split('.').map(Number);
  const a = parse(from), b = parse(to);
  for (let i = 0; i < 3; i++) {
    if ((b[i] || 0) > (a[i] || 0)) return true;
    if ((b[i] || 0) < (a[i] || 0)) return false;
  }
  return true;
}

function diffDeps(depsA, depsB) {
  const added = {}, removed = {}, changed = {}, unchanged = {};
  for (const [n, i] of Object.entries(depsB)) {
    if (!depsA[n]) added[n] = i;
    else if (depsA[n].version !== i.version || depsA[n].resolved !== i.resolved || depsA[n].integrity !== i.integrity) changed[n] = { from: depsA[n], to: i };
    else unchanged[n] = i;
  }
  for (const [n, i] of Object.entries(depsA)) { if (!depsB[n]) removed[n] = i; }
  return { added, removed, changed, unchanged };
}

function compare({ refA, refB, lockfile, cwd, verbose }) {
  cwd = cwd || process.cwd();
  lockfile = lockfile || detectLockfile(cwd);

  const lockA = getLockfileContent(refA, lockfile, cwd);
  let lockB;
  if (refB === null) {
    try { lockB = JSON.parse(fs.readFileSync(path.join(cwd, lockfile), 'utf8')); }
    catch { throw new Error(`Cannot read ${lockfile} from disk.`); }
  } else { lockB = getLockfileContent(refB, lockfile, cwd); }

  if (!lockA) throw new Error(`Cannot read ${lockfile} at ${refA}.`);
  if (!lockB) throw new Error(`Cannot read ${lockfile} at ${refB || 'working tree'}.`);

  const depsA = extractDeps(lockA), depsB = extractDeps(lockB);
  const { added, removed, changed, unchanged } = diffDeps(depsA, depsB);

  const summary = {
    added: Object.keys(added).length,
    removed: Object.keys(removed).length,
    changed: Object.keys(changed).length,
    unchanged: Object.keys(unchanged).length,
  };

  return {
    from: refA, to: refB || 'working tree', lockfile,
    added, removed, changed,
    unchanged: verbose ? unchanged : summary.unchanged,
    summary,
  };
}

// Group deps by type: production, dev, optional
function groupDeps(deps) {
  const groups = { production: {}, dev: {}, optional: {} };
  for (const [name, info] of Object.entries(deps)) {
    if (info.optional) groups.optional[name] = info;
    else if (info.dev) groups.dev[name] = info;
    else groups.production[name] = info;
  }
  return groups;
}

// Format grouped result
function formatGrouped(result) {
  const { added, removed, changed, summary } = result;
  const total = summary.added + summary.removed + summary.changed;
  if (total === 0) return '✓ No dependency changes between the two refs.';

  const lines = [`Dependencies: +${summary.added} added, -${summary.removed} removed, ~${summary.changed} changed`];
  const types = [
    { label: 'Production', prefix: 'prod', color: '' },
    { label: 'Dev', prefix: 'dev', color: '' },
    { label: 'Optional', prefix: 'opt', color: '' },
  ];

  for (const { label } of types) {
    const sectionLines = [];
    const key = label.toLowerCase();

    // Added in this group
    const addedHere = Object.entries(added).filter(([, i]) =>
      key === 'optional' ? i.optional : key === 'dev' ? i.dev && !i.optional : !i.dev && !i.optional
    );
    const removedHere = Object.entries(removed).filter(([, i]) =>
      key === 'optional' ? i.optional : key === 'dev' ? i.dev && !i.optional : !i.dev && !i.optional
    );
    const changedHere = Object.entries(changed).filter(([, i]) =>
      key === 'optional' ? (i.to.optional || i.from.optional) : key === 'dev' ? (i.to.dev || i.from.dev) && !(i.to.optional || i.from.optional) : !(i.to.dev || i.from.dev) && !(i.to.optional || i.from.optional)
    );

    const count = addedHere.length + removedHere.length + changedHere.length;
    if (count === 0) continue;

    lines.push('');
    lines.push(`${label} (${count} change${count !== 1 ? 's' : ''}):`);

    for (const [n, i] of addedHere.sort((a, b) => a[0].localeCompare(b[0])))
      sectionLines.push(`  + ${n}@${i.version}`);
    for (const [n, i] of removedHere.sort((a, b) => a[0].localeCompare(b[0])))
      sectionLines.push(`  - ${n}@${i.version}`);
    for (const [n, i] of changedHere.sort((a, b) => a[0].localeCompare(b[0]))) {
      const arrow = isUpgrade(i.from.version, i.to.version) ? '↑' : '↓';
      const integrityTag = i.from.integrity !== i.to.integrity && i.from.version === i.to.version ? ' (integrity)' : '';
      sectionLines.push(`  ${arrow} ${n} ${i.from.version} → ${i.to.version}${integrityTag}`);
    }
    lines.push(...sectionLines);
  }

  return lines.join('\n');
}

// Compact format: one line per change
function formatCompact(result) {
  const { added, removed, changed, summary } = result;
  const total = summary.added + summary.removed + summary.changed;
  if (total === 0) return '✓ No changes.';

  const lines = [];
  for (const [n, i] of Object.entries(added).sort((a, b) => a[0].localeCompare(b[0])))
    lines.push(`+ ${n}@${i.version}`);
  for (const [n, i] of Object.entries(removed).sort((a, b) => a[0].localeCompare(b[0])))
    lines.push(`- ${n}@${i.version}`);
  for (const [n, i] of Object.entries(changed).sort((a, b) => a[0].localeCompare(b[0]))) {
    const arrow = isUpgrade(i.from.version, i.to.version) ? '↑' : '↓';
    lines.push(`${arrow} ${n} ${i.from.version} → ${i.to.version}`);
  }
  return lines.join('\n');
}

// Formatters
function formatText(result) {
  const { added, removed, changed, summary } = result;
  const total = summary.added + summary.removed + summary.changed;
  if (total === 0) return '✓ No dependency changes between the two refs.';
  const lines = [`Dependencies: +${summary.added} added, -${summary.removed} removed, ~${summary.changed} changed (${summary.unchanged} unchanged)\n`];
  if (Object.keys(added).length) {
    lines.push('Added:');
    for (const [n, i] of Object.entries(added).sort((a,b) => a[0].localeCompare(b[0])))
      lines.push(`  + ${n}@${i.version}${i.dev ? ' (dev)' : i.optional ? ' (optional)' : ''}`);
    lines.push('');
  }
  if (Object.keys(removed).length) {
    lines.push('Removed:');
    for (const [n, i] of Object.entries(removed).sort((a,b) => a[0].localeCompare(b[0])))
      lines.push(`  - ${n}@${i.version}`);
    lines.push('');
  }
  if (Object.keys(changed).length) {
    lines.push('Changed:');
    for (const [n, i] of Object.entries(changed).sort((a,b) => a[0].localeCompare(b[0]))) {
      const arrow = isUpgrade(i.from.version, i.to.version) ? '↑' : '↓';
      const integrityTag = i.from.integrity !== i.to.integrity && i.from.version === i.to.version ? ' (integrity)' : '';
      lines.push(`  ${arrow} ${n} ${i.from.version} → ${i.to.version}${integrityTag}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function formatJSON(result) { return JSON.stringify(result, null, 2); }

function formatMarkdown(result) {
  const { added, removed, changed, summary } = result;
  const lines = ['# lockdiff', '', `**+${summary.added} added** · **-${summary.removed} removed** · **~${summary.changed} changed** (${summary.unchanged} unchanged)`, ''];
  if (Object.keys(added).length) {
    lines.push('## Added', '');
    for (const [n, i] of Object.entries(added).sort((a,b) => a[0].localeCompare(b[0])))
      lines.push(`- \`${n}@${i.version}\`${i.dev ? ' _(dev)_' : ''}`);
    lines.push('');
  }
  if (Object.keys(removed).length) {
    lines.push('## Removed', '');
    for (const [n] of Object.entries(removed).sort((a,b) => a[0].localeCompare(b[0])))
      lines.push(`- \`${n}\``);
    lines.push('');
  }
  if (Object.keys(changed).length) {
    lines.push('## Changed', '', '| Package | From | To | |', '|---------|------|----|-|');
    for (const [n, i] of Object.entries(changed).sort((a,b) => a[0].localeCompare(b[0]))) {
      const arrow = isUpgrade(i.from.version, i.to.version) ? '⬆️' : '⬇️';
      lines.push(`| \`${n}\` | ${i.from.version} | ${i.to.version} | ${arrow} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

module.exports = { compare, extractDeps, diffDeps, isUpgrade, detectLockfile, findLastTag, formatText, formatJSON, formatMarkdown, formatGrouped, formatCompact, groupDeps };
