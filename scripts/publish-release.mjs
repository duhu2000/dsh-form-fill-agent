import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { verifyRegistryPackage } from './registry-package.mjs';
import assert from 'node:assert/strict';

const names = ['form-fill-core', 'qcc-form-fill-provider', 'dsh-form-fill-agent'];
const packages = names.map(name => JSON.parse(readFileSync(`packages/${name}/package.json`)));
const version = packages.at(-1).version;
const publish = process.env.RELEASE_EVENT === 'push';
assert.match(version, /^\d+\.\d+\.\d+$/, 'Only stable versions target latest');
if (publish) {
  assert.equal(process.env.GITHUB_REF_TYPE, 'tag');
  assert.ok(['V' + version, 'v' + version].includes(process.env.GITHUB_REF_NAME), 'Tag/version mismatch');
  assert.equal(process.env.GITHUB_REPOSITORY, 'duhu2000/dsh-form-fill-agent');
  readFileSync(`docs/RELEASE-${version}.md`);
}
for (const pkg of packages) {
  for (const dependency of packages) {
    if (pkg.dependencies?.[dependency.name]) assert.equal(pkg.dependencies[dependency.name], dependency.version);
  }
}
// Preflight every package before the first irreversible publish.
const missing = [];
for (const pkg of packages) {
  const file = `./artifacts/${pkg.name}-${pkg.version}.tgz`;
  const response = await fetch(`https://registry.npmjs.org/${pkg.name}/${pkg.version}`);
  if (response.status === 404) {
    missing.push({ pkg, file });
    continue;
  }
  assert.equal(response.status, 200, 'Registry lookup failed; refusing to assume unpublished');
  const remote = await response.json();
  await verifyRegistryPackage(file, remote);
  console.log(`Verified existing ${pkg.name}@${pkg.version}`);
}
for (const { pkg, file } of missing) {
  if (!publish) {
    console.log(`Dry run: would publish ${pkg.name}@${pkg.version}`);
    continue;
  }
  execFileSync('npm', ['publish', file, '--access', 'public', '--tag', 'latest', '--provenance', '--ignore-scripts'], { stdio: 'inherit' });
}
