import path from "node:path";

/**
 * Resolve `userPath` relative to `vaultRoot` and assert the result stays
 * inside the vault. Throws if the path escapes via `..` traversal or an
 * absolute path injection.
 */
export function sanitizeVaultPath(vaultRoot: string, userPath: string): string {
  const resolved = path.resolve(vaultRoot, userPath);
  const relative = path.relative(vaultRoot, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `Access denied: '${userPath}' resolves outside the vault. ` +
        "Only paths within the vault directory are allowed.",
    );
  }

  return resolved;
}
