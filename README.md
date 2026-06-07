# lockdiff

Compare `package-lock.json` between git refs — see exactly what dependencies changed.

Built for code reviews. You review the application code, lockdiff reviews the dependencies.

## Why

Ever merge a PR and wonder "wait, what dependencies changed?" Or review a PR with a 5000-line `package-lock.json` diff and have no idea what actually changed?

lockdiff parses both lockfiles and gives you a clean summary:

```
$ lockdiff main
Dependencies: +3 added, -1 removed, ~2 changed (247 unchanged)

Added:
  + esbuild@0.20.0
  + typescript@5.4.2 (dev)
  + zod@3.22.4

Removed:
  - ts-node@10.9.1

Changed:
  ↑ eslint 8.56.0 → 8.57.0
  ↓ react 18.3.0 → 18.2.0
```

## Install

```bash
npm install -g lockdiff
```

Or use without installing:

```bash
npx lockdiff main
```

## Usage

```bash
lockdiff                          # HEAD vs working tree
lockdiff main                     # current branch vs main
lockdiff main..feature            # main vs feature branch
lockdiff abc123 def456            # two specific commits
lockdiff HEAD~1                   # last commit vs previous
lockdiff v1.0.0..v2.0.0          # between two tags
```

## Output Formats

```bash
lockdiff main                     # human-readable (default)
lockdiff main --json              # JSON for scripts/CI
lockdiff main --markdown          # Markdown for PR comments
lockdiff main --verbose           # include unchanged count
```

## CI Integration

```yaml
# GitHub Actions example
- name: Check dependency changes
  run: npx lockdiff origin/main --json
  continue-on-error: true
```

Exit code is `1` if there are changes, `0` if clean. Perfect for CI pipelines.

## How It Works

1. Reads `package-lock.json` from two git refs using `git show`
2. Parses both lockfiles and extracts all packages
3. Compares versions, resolved URLs, and integrity hashes
4. Outputs a clean diff showing added, removed, and changed packages

## Options

| Flag | Description |
|------|-------------|
| `--json` | JSON output |
| `--markdown` | Markdown table output |
| `--lockfile <path>` | Custom lockfile path |
| `--verbose` | Show more details |
| `-h, --help` | Show help |

## License

MIT
