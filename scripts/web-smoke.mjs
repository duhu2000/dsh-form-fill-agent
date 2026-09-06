import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { parseWorkbook } from 'form-fill-core';
const base = (process.env.FORM_FILL_URL ?? 'http://127.0.0.1:43260').replace(/\/$/, '');
const url = new URL(base);
assert.equal(url.hostname, '127.0.0.1'); assert.notEqual(url.port, '43120');
assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE to a local installed playwright entrypoint');
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(join(root, 'artifacts/screenshots'), { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme: 'light' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  for (const [name, count] of [['客户台账',6],['供应商准入表',4],['合同主体信息表',6]]) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByText('预览已准备好，请检查后确认。', { exact: true }).waitFor();
    assert.equal(await page.locator('#changes tr').count(), count);
    assert.match(await page.locator('#summary').innerText(), /费用 0/);
    await page.getByRole('button', { name: '确认这些填写，生成新副本' }).click();
    await page.getByRole('link', { name: '下载已填副本' }).waitFor();
    const href = await page.getByRole('link', { name: '下载已填副本' }).getAttribute('href');
    const response = await fetch(new URL(href, base));
    assert.equal(response.status, 200);
    assert.ok(parseWorkbook(Buffer.from(await response.arrayBuffer())).sheets.length);
    if (name === '客户台账') {
      await page.screenshot({ path: join(root,'artifacts/screenshots/customer-light.png'), fullPage: true });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.screenshot({ path: join(root,'artifacts/screenshots/customer-dark.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: join(root,'artifacts/screenshots/customer-narrow.png'), fullPage: true });
      await page.setViewportSize({ width:1280,height:1000 }); await page.emulateMedia({colorScheme:'light'});
    }
  }
  // Real file upload path, including the input element.
  await page.locator('#file').setInputFiles(join(root,'fixtures/xlsx/客户台账.xlsx'));
  await page.getByRole('button',{name:'分析表格',exact:true}).click();
  await page.getByText('预览已准备好，请检查后确认。',{exact:true}).waitFor();
  assert.equal(await page.locator('#changes tr').count(),6);
  assert.deepEqual(errors, []);
  assert.equal((await fetch(base + '/preview', { method:'POST', headers:{Origin:'https://example.invalid','Content-Type':'application/json'},body:'{}' })).status,403);
  assert.equal((await fetch(base + '/confirm', { method:'POST', headers:{Origin:url.origin,'Content-Type':'application/json'},body:JSON.stringify({id:'nonexistent',confirmChangeSetId:'x'}) })).status,404);
  assert.equal((await fetch(base + '/download/nonexistent/xlsx')).status,404);
  console.log('Browser E2E 3/3 + actual upload + light/dark/390px + origin/download guards PASS; page errors 0');
} finally { await browser.close(); }
