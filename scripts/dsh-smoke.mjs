import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
assert.ok(process.env.DSH_RC_BIN && process.env.DSH_ALPHA_BIN, 'Set DSH_RC_BIN and DSH_ALPHA_BIN to isolated SDK CLI entrypoints');
const binaries = [process.env.DSH_RC_BIN, process.env.DSH_ALPHA_BIN].map(bin => resolve(bin));
execFileSync(process.execPath, [join(root, 'scripts/verify-pack.mjs')], { stdio: 'inherit' });
const base = await mkdtemp(join(tmpdir(), 'form-fill-dsh-smoke-'));
const reports = [];
for (const [index, bin] of binaries.entries()) {
  const home = join(base, index ? 'alpha' : 'rc'), cwd = join(home, 'synthetic-workspace'), profile = join(home, 'profiles/web');
  await mkdir(profile, { recursive: true }); await mkdir(cwd);
  // Generated isolated installation metadata, never copied from a user profile.
  const dependencies = Object.fromEntries(['form-fill-core','qcc-form-fill-provider','dsh-form-fill-agent'].map(name => [name, 'file:' + join(root, 'artifacts', name + '-0.1.0-alpha.1.tgz')]));
  const manifest = { name: 'synthetic-dsh-smoke', version: '0.0.0', private: true, type: 'module', dependencies, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','dsh-form-fill-agent'] } } };
  await writeFile(join(profile, 'package.json'), JSON.stringify(manifest, null, 2));
  execFileSync('npm', ['install','--offline','--ignore-scripts','--legacy-peer-deps','--no-audit','--no-fund'], { cwd: profile, stdio: 'pipe' });
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: tmpdir(), DSH_HOME: home, NO_COLOR: '1' };
  const version = execFileSync(process.execPath, [bin, '--version'], { cwd, env, encoding: 'utf8' }).trim();
  assert.match(version, index ? /0\.1\.2-alpha\.2/ : /0\.1\.1-rc\.2/);
  const config = execFileSync(process.execPath, [bin,'--profile','web','--dump-config'], { cwd, env, encoding: 'utf8' });
  assert.ok(config.includes('dsh-form-fill-agent'));
  assert.ok(!config.includes('dsh-better-sidebar'));
  const reservation = createServer();
  await new Promise((ok, no) => { reservation.once('error', no); reservation.listen(0, '127.0.0.1', ok); });
  const port = reservation.address().port; await new Promise(ok => reservation.close(ok));
  assert.notEqual(port, 43120);
  let child = spawn(process.execPath, [bin,'--profile','web','--port',String(port),'--no-open'], { cwd, env, stdio: ['ignore','pipe','pipe'] });
  let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
  try {
    let health;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (child.exitCode !== null) break;
      try { const response = await fetch('http://127.0.0.1:' + port + '/form-fill/health'); if (response.ok) { health = await response.json(); break; } } catch {}
      await new Promise(ok => setTimeout(ok, 250));
    }
    if (!health) {
      // Restrict diagnostic text: startup can print ephemeral web auth URLs.
      const errors = output.split('\n').filter(l => /error|failed|cannot|MODULE_NOT_FOUND/i.test(l) && !/token|key|oauth|credential/i.test(l)).slice(-15).join('\n');
      throw new Error('Isolated Host did not become healthy: ' + errors);
    }
    assert.equal(health.companionRequired, false); assert.equal(health.provider, 'mock-only');
    const origin = 'http://127.0.0.1:' + port, endpoint = origin + '/form-fill';
    const post = (path, body) => fetch(endpoint + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const fixtures = []; let retainedTask;
    for (const [name, filled] of [['客户台账', 6], ['供应商准入表', 4], ['合同主体信息表', 6]]) {
      const input = await fetch(endpoint + '/fixture/' + encodeURIComponent(name));
      assert.equal(input.status, 200);
      const previewResponse = await post('/preview', { base64: Buffer.from(await input.arrayBuffer()).toString('base64') });
      assert.equal(previewResponse.status, 200);
      const preview = await previewResponse.json();
      assert.equal((await fetch(endpoint + '/download/' + preview.id + '/xlsx')).status, 404);
      const confirmed = await post('/confirm', { id: preview.id, confirmChangeSetId: preview.changeSet.changeSetId });
      assert.equal(confirmed.status, 200); assert.equal((await confirmed.json()).filled, filled);
      const output = await fetch(endpoint + '/download/' + preview.id + '/xlsx');
      assert.equal(output.status, 200);
      const second = await post('/preview', { base64: Buffer.from(await output.arrayBuffer()).toString('base64') });
      assert.equal(second.status, 200);
      const secondPreview = await second.json(); assert.equal(secondPreview.changeSet.changes.length, 0);
      if (!retainedTask) retainedTask = preview.id;
      else assert.equal((await post('/discard', { id: preview.id })).status, 200);
      assert.equal((await post('/discard', { id: secondPreview.id })).status, 200);
      fixtures.push({ name, filled, secondPassChanges: 0 });
    }
    if (process.env.PLAYWRIGHT_MODULE) execFileSync(process.execPath, [join(root, 'scripts/web-smoke.mjs')], {
      env: { ...process.env, FORM_FILL_URL: endpoint + '/' }, stdio: 'inherit', timeout: 90000,
    });
    child.kill('SIGTERM');
    await Promise.race([new Promise(ok => child.once('exit', ok)), new Promise(ok => setTimeout(ok, 3000))]);
    if (child.exitCode === null) { child.kill('SIGKILL'); await new Promise(ok => child.once('exit', ok)); }
    child = spawn(process.execPath, [bin,'--profile','web','--port',String(port),'--no-open'], { cwd, env, stdio: ['ignore','pipe','pipe'] });
    child.stdout.on('data', () => {}); child.stderr.on('data', () => {});
    let restored;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (child.exitCode !== null) break;
      try { const r = await fetch(endpoint + '/task/' + retainedTask); if (r.ok) { restored = await r.json(); break; } } catch {}
      await new Promise(ok => setTimeout(ok, 250));
    }
    assert.ok(restored?.confirmed, 'confirmed task must survive Host restart');
    assert.equal(restored.changeSet.changes.length, 6);
    assert.equal((await fetch(endpoint + '/download/' + retainedTask + '/xlsx')).status, 200);
    reports.push({ version, port, health, fixtures, browser: process.env.PLAYWRIGHT_MODULE ? 'PASS' : 'not-run', persistenceRestart: 'PASS', result: 'PASS' });
  } finally {
    if (child.exitCode === null) { child.kill('SIGTERM'); await Promise.race([new Promise(ok => child.once('exit', ok)), new Promise(ok => setTimeout(ok, 3000))]); if (child.exitCode === null) child.kill('SIGKILL'); }
  }
  // Local uninstall/rollback: remove only the generated bundle dependency and
  // assert composition is clean again. No production profile was opened.
  manifest.dsh.profile.bundles.pop(); delete manifest.dependencies['dsh-form-fill-agent'];
  await writeFile(join(profile, 'package.json'), JSON.stringify(manifest, null, 2));
  const clean = execFileSync(process.execPath, [bin,'--profile','web','--dump-config'], { cwd, env, encoding: 'utf8' });
  assert.ok(!clean.includes('name: dsh-form-fill-agent') && !clean.includes("name: 'dsh-form-fill-agent'"));
  reports.at(-1).uninstallComposition = 'PASS';
}
console.log(JSON.stringify({ kind: 'isolated-DSH-tarball-host', profiles: 'fresh', credentialEnvironment: false, realQccCalls: 0, reports, home: base }, null, 2));
