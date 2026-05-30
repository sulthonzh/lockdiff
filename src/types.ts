export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface DepChange {
  name: string;
  type: "added" | "removed" | "changed";
  group: string; // dependencies, devDependencies, etc.
  oldVersion?: string;
  newVersion?: string;
}

export interface DiffResult {
  from: string;
  to: string;
  changes: DepChange[];
  summary: { added: number; removed: number; changed: number; total: number };
}
