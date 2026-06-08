#!/usr/bin/env node
'use strict';
const { compare, findLastTag, formatText, formatJSON, formatMarkdown } = require('./index');

function main() {
  const args = process.argv.slice(2);
  const cwd = process.cwd();
  const opts = { json: false, markdown: false, verbose: false, lockfile: null, since: false };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') opts.json = true;
    else if (args[i] === '--markdown' || args[i] === '--md') opts.markdown = true;
    else if (args[i] === '--verbose' || args[i] === '-v') opts.verbose = true;
    else if (args[i] === '--lockfile' && args[i+1]) { opts.lockfile = args[++i]; }
    else if (args[i] === '--since') opts.since = true;
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
  lockdiff --since                Compare last git tag vs HEAD

Options:
  --json          JSON output
  --markdown      Markdown output
  --lockfile <f>  Custom lockfile (default: auto-detect)
  --since         Compare last git tag vs HEAD
  --verbose       Show more detail
  -h, --help      Show help

Examples:
  lockdiff main                  What changed on this branch vs main
  lockdiff HEAD~1                What the last commit changed
  lockdiff v1.0.0..v2.0.0        Changes between two tags
  lockdiff --since               Changes since last release tag
  lockdiff main --json           Machine-readable for CI
`.trim());
      process.exit(0);
    } else if (!args[i].startsWith('-')) positional.push(args[i]);
  }

  let refA, refB;
  if (opts.since) {
    const tag = findLastTag(cwd);
    if (!tag) { console.error('Error: No git tags found for --since.'); process.exit(1); }
    refA = tag;
    refB = 'HEAD';
  } else if (positional.length === 0) {
    refA = 'HEAD'; refB = null;
  } else if (positional.length === 1 && positional[0].includes('..')) {
    const [a, b] = positional[0].split('..'); refA = a || 'HEAD'; refB = b;
  } else if (positional.length === 1) {
    refA = positional[0]; refB = 'HEAD';
  } else {
    refA = positional[0]; refB = positional[1];
  }

  try {
    const result = compare({ refA, refB, lockfile: opts.lockfile, cwd, verbose: opts.verbose });
    if (opts.json) console.log(formatJSON(result));
    else if (opts.markdown) console.log(formatMarkdown(result));
    else console.log(formatText(result));
    process.exit(result.summary.added + result.summary.removed + result.summary.changed > 0 ? 1 : 0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
}

main();
