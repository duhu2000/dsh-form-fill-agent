import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Compare payloads, not gzip/tar metadata produced by different platforms.
export async function verifyRegistryPackage(localFile, remote) {
  const url = new URL(remote.dist.tarball);
  assert.equal(url.origin, 'https://registry.npmjs.org');
  const response = await fetch(url);
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(remote.dist.integrity, 'sha512-' + createHash('sha512').update(bytes).digest('base64'), 'Registry download integrity');
  const dir = mkdtempSync(join(tmpdir(), 'form-fill-package-'));
  try {
    const file = join(dir, 'remote.tgz');
    writeFileSync(file, bytes);
    const entries = path => execFileSync('tar', ['-tzf', path], { encoding: 'utf8' }).trim().split('\n').filter(name => !name.endsWith('/')).sort();
    const local = entries(localFile), published = entries(file);
    assert.deepEqual(local, published, 'Published file list differs');
    assert.equal(new Set(local).size, local.length, 'Duplicate package paths');
    for (const name of local) {
      assert.ok(name.startsWith('package/') && !name.split('/').includes('..'), 'Unsafe package path');
      const a = execFileSync('tar', ['-xOzf', localFile, name]);
      const b = execFileSync('tar', ['-xOzf', file, name]);
      if (name === 'package/package.json') {
        const left = JSON.parse(a), right = JSON.parse(b);
        // npm may inject the packaging checkout SHA; all product metadata must match.
        delete left.gitHead;
        delete right.gitHead;
        assert.deepEqual(left, right, 'Published package metadata differs');
      } else assert.deepEqual(a, b, 'Published content differs: ' + name);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
