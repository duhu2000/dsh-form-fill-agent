import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the installed profile manifest, never a home-wide shared task store.
// Linked development packages outside a profile use memory unless explicitly configured.
export function profileTaskDirectory(moduleUrl) {
  let directory = dirname(fileURLToPath(moduleUrl));
  while (true) {
    try {
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
      if (manifest.private === true && Array.isArray(manifest.dsh?.profile?.bundles)) {
        return join(directory, 'form-fill-tasks');
      }
    } catch { /* Not a profile manifest. */ }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}
