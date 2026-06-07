#!/usr/bin/env node
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
    deps[name] = { version: info.version || '?', resolved: info.resolved || '', integrity: info.integrity || '', dev: info.dev || false, optional: info.optional || false };
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

function isUpgrade(from, to) {
  const parse = v => (v || '').replace(/^[\^~>=<]/, '').split('.').map(Number);
  const a = parse(from), b = parse(to);
  for (let i = 0; i < 3; i++) {
    if ((b[i]||0) > (a[i]||0)) return true;
    if ((b[i]||0) < (a[i]||0)) return false;
  }
  return true;
}

function formatDiff(added, removed, changed, summary, opts) {
  const lines = [];
  const total = summary.added + summary.removed + summary.changed;
  if (total === 0) return '✓ No dependency changes between the two refs.';
  lines.push(`Dependencies: +${summary.added} added, -${summary.removed} removed, ~${summary.changed} changed (${summary.unchanged} unchanged)\n`);
  if (Object.keys(added).length) {
    lines.push('Added:');
    for (const [n, i] of Object.entries(added).sort((a,b)=>a[0].localeCompare(b[0])))
      lines.push(`  + ${n}@${i.version}${i.dev?' (dev)':i.optional?' (optional)':''}`);
    lines.push('');
  }
  if (Object.keys(removed).length) {
    lines.push('Removed:');
    for (const [n, i] of Object.entries(removed).sort((a,b)=>a[0].localeCompare(b[0])))
      lines.push(`  - ${n}@${i.version}`);
    lines.push('');
  }
  if (Object.keys(changed).length) {
    lines.push('Changed:');
    for (const [n, i] of Object.entries(changed).sort((a,b)=>a[0].localeCompare(b[0]))) {
      const arrow = isUpgrade(i.from.version, i.to.version) ? '↑' : '↓';
      lines.push(`  ${arrow} ${n} ${i.from.version} → ${i.to.version}`);
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
    lines.push('## Added','');
    for (const [n, i] of Object.entries(added).sort((a,b)=>a[0].localeCompare(b[0])))
      lines.push(`- \`${n}@${i.version}\`${i.dev?' _(dev)_':''}`);
    lines.push('');
  }
  if (Object.keys(removed).length) {
    lines.push('## Removed','');
    for (const [n] of Object.entries(removed).sort((a,b)=>a[0].localeCompare(b[0])))
      lines.push(`- \`${n}\``);
    lines.push('');
  }
  if (Object.keys(changed).length) {
    lines.push('## Changed','', '| Package | From | To | |','|---------|------|----|-|');
    for (const [n, i] of Object.entries(changed).sort((a,b)=>a[0].localeCompare(b[0]))) {
      const arrow = isUpgrade(i.from.version, i.to.version) ? '⬆️' : '⬇️';
      lines.push(`| \`${n}\` | ${i.from.version} | ${i.to.version} | ${arrow} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const cwd = process.cwd();
  const opts = { json: false, markdown: false, verbose: false, lockfile: null };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') opts.json = true;
    else if (args[i] === '--markdown' || args[i] === '--md') opts.markdown = true;
    else if (args[i] === '--verbose' || args[i] === '-v') opts.verbose = true;
    else if (args[i] === '--lockfile' && args[i+1]) { opts.lockfile = args[++i]; }
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
lockdiff — compare package-lock.json between git refs

Use it in code reviews to see exactly what dependencies changed.

Usage:
  lockdiff                        Compare HEAD vs working tree
  lockdiff main                   Compare current branch vs main
  lockdiff main..feature          Compare main vs feature branch
  lockdiff abc123 def456          Compare two commits
  lockdiff HEAD~1                 Compare last commit vs previous

Options:
  --json          JSON output
  --markdown      Markdown output
  --lockfile <f>  Custom lockfile (default: auto-detect)
  --verbose       Show more detail
  -h, --help      Show help

Examples:
  lockdiff main                  What changed on this branch vs main
  lockdiff HEAD~1                What the last commit changed
  lockdiff v1.0.0..v2.0.0        Changes between two tags
  lockdiff main --json           Machine-readable for CI
`.trim());
      process.exit(0);
    } else if (!args[i].startsWith('-')) positional.push(args[i]);
  }

  const lockfile = opts.lockfile || detectLockfile(cwd);
  let refA, refB;
  if (positional.length === 0) { refA = 'HEAD'; refB = null; }
  else if (positional.length === 1 && positional[0].includes('..')) { const [a,b] = positional[0].split('..'); refA = a||'HEAD'; refB = b; }
  else if (positional.length === 1) { refA = positional[0]; refB = 'HEAD'; }
  else { refA = positional[0]; refB = positional[1]; }

  const lockA = getLockfileContent(refA, lockfile, cwd);
  let lockB;
  if (refB === null) {
    try { lockB = JSON.parse(fs.readFileSync(path.join(cwd, lockfile), 'utf8')); }
    catch { console.error(`Error: Cannot read ${lockfile} from disk.`); process.exit(1); }
  } else { lockB = getLockfileContent(refB, lockfile, cwd); }

  if (!lockA) { console.error(`Error: Cannot read ${lockfile} at ${refA}.`); process.exit(1); }
  if (!lockB) { console.error(`Error: Cannot read ${lockfile} at ${refB||'working tree'}.`); process.exit(1); }

  const depsA = extractDeps(lockA), depsB = extractDeps(lockB);
  const added = {}, removed = {}, changed = {}, unchanged = {};
  for (const [n, i] of Object.entries(depsB)) {
    if (!depsA[n]) added[n] = i;
    else if (depsA[n].version !== i.version || depsA[n].resolved !== i.resolved) changed[n] = { from: depsA[n], to: i };
    else unchanged[n] = i;
  }
  for (const [n, i] of Object.entries(depsA)) { if (!depsB[n]) removed[n] = i; }

  const summary = { added: Object.keys(added).length, removed: Object.keys(removed).length, changed: Object.keys(changed).length, unchanged: Object.keys(unchanged).length };
  const result = { from: refA, to: refB || 'working tree', lockfile, added, removed, changed, unchanged: opts.verbose ? unchanged : summary.unchanged, summary };

  if (opts.json) console.log(formatJSON(result));
  else if (opts.markdown) console.log(formatMarkdown(result));
  else console.log(formatDiff(added, removed, changed, summary, opts));

  process.exit(summary.added + summary.removed + summary.changed > 0 ? 1 : 0);
}

main();
