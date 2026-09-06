import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, cp, readFile, lstat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const legacy = resolve(process.env.LEGACY_REPO ?? join(root, '../dsh-data-cleaning-agent-form-fill-compat'));
const sandbox = await mkdtemp(join(tmpdir(), 'form-fill-consumers-'));
const names = ['form-fill-core', 'qcc-form-fill-provider', 'dsh-form-fill-agent'];
execFileSync(process.execPath, [join(root, 'scripts/verify-pack.mjs')], { stdio: 'inherit' });
const packed = join(sandbox, 'dsh-form-fill-agent/artifacts');
await mkdir(packed, { recursive: true });
const tarballs = [];
for (const name of names) {
  const file = name + '-0.1.0-alpha.1.tgz';
  await cp(join(root, 'artifacts', file), join(packed, file));
  tarballs.push(join(packed, file));
}
const oldConsumer = join(sandbox, 'dsh-data-cleaning-agent');
// Stage current authorized source files, including new golden tests; no ignored
// profiles, credentials, node_modules, raw responses, or developer scratch trees.
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: legacy, encoding: 'utf8' }).trim().split('\n');
for (const file of files) {
  const target = join(oldConsumer, file);
  await mkdir(dirname(target), { recursive: true });
  await cp(join(legacy, file), target);
}
const npmArgs = ['install', '--offline', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', '--package-lock=false'];
execFileSync('npm', npmArgs, { cwd: oldConsumer, stdio: 'inherit' });
assert.equal((await lstat(join(oldConsumer, 'node_modules/form-fill-core'))).isSymbolicLink(), false);
const oldLog = execFileSync('npm', ['run', 'check'], { cwd: oldConsumer, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
console.log(oldLog);
const newConsumer = join(sandbox, 'standalone-form-fill');
await mkdir(newConsumer);
execFileSync('npm', [...npmArgs, ...tarballs], { cwd: newConsumer, stdio: 'inherit' });
for (const name of names) {
  assert.equal((await lstat(join(newConsumer, 'node_modules', name))).isSymbolicLink(), false);
  assert.equal(JSON.parse(await readFile(join(newConsumer, 'node_modules', name, 'package.json'))).version, '0.1.0-alpha.1');
}
const code = [
  'import {readFileSync} from "node:fs";',
  'import assert from "node:assert/strict";',
  'import {previewBytes} from "dsh-form-fill-agent";',
  'import {applyChangeSet,parseWorkbook} from "form-fill-core";',
  'for (const name of ["客户台账","供应商准入表","合同主体信息表"]) {',
  ' const bytes=readFileSync(process.env.FIXTURE_ROOT+"/"+name+".xlsx");',
  ' const p=await previewBytes(bytes); const expected=JSON.parse(readFileSync(process.env.EXPECTED_ROOT+"/"+name+".json")); assert.deepEqual(p,expected);',
  ' const out=applyChangeSet(bytes,p.plan,p.changeSet,{confirmChangeSetId:p.changeSet.changeSetId}); assert.ok(parseWorkbook(out.bytes).sheets.length);',
  ' assert.equal((await previewBytes(out.bytes)).changeSet.changes.length,0);',
  '} console.log("standalone tarball E2E: 3/3 PASS; no workspace symlinks");',
].join('\n');
execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: newConsumer, env: { ...process.env, FIXTURE_ROOT: join(root, 'fixtures/xlsx'), EXPECTED_ROOT: join(root, 'fixtures/expected') }, stdio: 'inherit' });
console.log(JSON.stringify({ kind: 'consumer-contract', legacy: 'full-check + 24 golden cases PASS', formFill: '3 fixture E2E PASS', workspaceLinks: false, published: false, sandbox }));
