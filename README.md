# lockdiff

**See dependency changes between git refs at a glance.** Perfect for code reviews — instantly know what changed in `package.json` when reviewing a PR.

## Why?

Every PR review involves checking what dependencies changed. But `git diff package.json` is noisy — you see the whole file. `lockdiff` gives you a clean summary: what was added, removed, or upgraded, grouped by dependency type.

## Install

```bash
npm install -g lockdiff
```

## Usage

```bash
# Compare current branch against main
lockdiff main HEAD

# Compare two branches
lockdiff main feature/new-ui

# Compare against working directory
lockdiff main workspace

# JSON output (for scripts/CI)
lockdiff main HEAD --json

# CI mode: exit 1 if any deps changed
lockdiff main HEAD --check

# Compare lockfiles instead
lockdiff main HEAD --lockfile

# Specific repo path
lockdiff main HEAD --path ~/projects/my-app
```

## Example Output

```
Dependency changes: main → feature/auth
  2 added, 1 removed, 1 changed (4 total)

  dependencies:
    + jsonwebtoken ^9.0.0
    + bcrypt ^5.1.0
    - axios ^1.6.0
    ~ express ^4.18.0 → ^4.19.0

  devDependencies:
    + @types/jsonwebtoken ^9.0.0
```

## Use Cases

- **PR Reviews**: Quickly see what deps a PR adds/changes/removes
- **CI Checks**: Fail builds if unexpected dependency changes are detected
- **Release Notes**: Generate dependency change logs between versions
- **Security Audits**: Spot new dependencies before they hit production

## API

```typescript
import { diffPackages, formatDiff } from "lockdiff";

const result = diffPackages(beforePkg, afterPkg, "v1.0.0", "v2.0.0");
console.log(formatDiff(result));
```

## License

MIT
