import { execFileSync } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = join(root, 'artifacts');
const npmCommand = process.env.npm_execpath ? process.execPath : 'npm';
const npmPrefix = process.env.npm_execpath ? [process.env.npm_execpath] : [];
await mkdir(destination, { recursive: true });
for (const name of ['form-fill-core', 'qcc-form-fill-provider', 'dsh-form-fill-agent']) {
  const cwd = join(root, 'packages', name);
  const pack = JSON.parse(execFileSync(npmCommand, [...npmPrefix, 'pack', '--ignore-scripts', '--json', '--pack-destination', destination], { cwd, encoding: 'utf8' }))[0];
  assert.ok(pack.files.length > 2);
  assert.ok(pack.unpackedSize < 200000);
  {
    assert.ok(pack.files.some(file => file.path === 'README.md'), 'Published package must include README.md');
    assert.ok((await readFile(join(cwd, 'README.md'), 'utf8')).includes('## 安装'), 'Published README must explain installation');
  }
  for (const file of pack.files) {
    assert.match(file.path, /^(?:lib\/[^.].*\.(?:js|html|css)|lib\/fixtures\/(?:客户台账|供应商准入表|合同主体信息表)\.xlsx|package\.json|README\.md|LICENSE|cordis\.patch\.yml)$/);
    if (file.path.endsWith('.xlsx')) {
      assert.equal(name, 'dsh-form-fill-agent');
      assert.deepEqual(await readFile(join(cwd, file.path)), await readFile(join(root, 'fixtures/xlsx', file.path.split('/').pop())));
      continue;
    }
    const content = await readFile(join(cwd, file.path), 'utf8');
    assert.doesNotMatch(content, /\/Users\/|Bearer\s+[A-Za-z0-9]|sk-[A-Za-z0-9]{20}/);
    if (name === 'form-fill-core') assert.doesNotMatch(content, /ctx\.|mcp__qcc|QCC_TOOL|OAuth|dsh-better-sidebar/);
  }
  const bytes = await readFile(join(destination, pack.filename));
  console.log(JSON.stringify({ name, version: pack.version, files: pack.files.length, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), result: 'PASS' }));
}
