import test from 'node:test';
import assert from 'node:assert/strict';
import { readZip, writeZip } from '../packages/form-fill-core/lib/zip.js';
import { previewBytes } from 'dsh-form-fill-agent';
import { applyChangeSet } from 'form-fill-core';
import { fixtureBytes } from '../scripts/generate-fixtures.mjs';

test('explicit ZIP directories and custom document properties allow preview and preserve metadata in a new copy', async () => {
  const entries = new Map([['_rels/', Buffer.alloc(0)], ['docProps/', Buffer.alloc(0)], ['xl/', Buffer.alloc(0)], ['xl/worksheets/', Buffer.alloc(0)]]);
  for (const [name, bytes] of readZip(fixtureBytes('合成模板', ['企业名称', '法定代表人'], [['合成客户甲有限公司', '']], { title: false }))) entries.set(name, bytes);
  const custom = Buffer.from('<?xml version="1.0"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="Synthetic"><vt:lpwstr>fixture-only</vt:lpwstr></property></Properties>');
  entries.set('docProps/custom.xml', custom);
  entries.set('[Content_Types].xml', Buffer.from(entries.get('[Content_Types].xml').toString().replace('</Types>', '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>')));
  entries.set('_rels/.rels', Buffer.from(entries.get('_rels/.rels').toString().replace('</Relationships>', '<Relationship Id="customProps" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>')));
  const calcMetadata = '<extLst><ext uri="{B58B0392-4F1F-4190-BB64-5DF3571DCE5F}" xmlns:xcalcf="http://schemas.microsoft.com/office/spreadsheetml/2018/calcfeatures"><xcalcf:calcFeatures><xcalcf:feature name="microsoft.com:RD"/><xcalcf:feature name="microsoft.com:LAMBDA_WF"/></xcalcf:calcFeatures></ext></extLst>';
  entries.set('xl/workbook.xml', Buffer.from(entries.get('xl/workbook.xml').toString().replace('</workbook>', calcMetadata + '</workbook>')));
  const bytes = writeZip(entries), snapshot = Buffer.from(bytes), preview = await previewBytes(bytes);
  assert.equal(preview.changeSet.changes.length, 1);
  const out = applyChangeSet(bytes, preview.plan, preview.changeSet, { confirmChangeSetId: preview.changeSet.changeSetId });
  assert.deepEqual(readZip(out.bytes).get('docProps/custom.xml'), custom);
  assert.deepEqual(readZip(out.bytes).get('xl/workbook.xml'), entries.get('xl/workbook.xml'));
  assert.deepEqual(bytes, snapshot);
  assert.equal((await previewBytes(out.bytes)).changeSet.changes.length, 0);
  for (const bad of [calcMetadata.replace('2018/calcfeatures', '2018/unknown'), calcMetadata.replace('xcalcf:feature name=', 'xcalcf:unknown name='), calcMetadata.replace('B58B0392', 'A58B0392')]) {
    const mutated = new Map(entries);
    mutated.set('xl/workbook.xml', Buffer.from(entries.get('xl/workbook.xml').toString().replace(calcMetadata, bad)));
    await assert.rejects(previewBytes(writeZip(mutated)), { code: 'UNSUPPORTED_STRUCTURE' });
  }
  entries.set('docProps/custom.xml', Buffer.from('<!DOCTYPE Properties [<!ENTITY x SYSTEM "file:///synthetic">]><Properties>&x;</Properties>'));
  await assert.rejects(previewBytes(writeZip(entries)), { code: 'UNSAFE_XML' });
});

test('directory records still reject traversal, empty segments, duplicates and file-directory collisions', () => {
  for (const name of ['../', '/xl/', 'xl//', 'xl/./', 'xl/../', '/', 'xl\\worksheets/']) {
    assert.throws(() => readZip(writeZip(new Map([[name, Buffer.alloc(0)]]))), { code: 'ZIP_PATH' });
  }
  for (const names of [['xl', 'xl/'], ['xl/', 'xl'], ['xl', 'xl/sheet.xml'], ['xl/sheet.xml', 'xl']]) {
    assert.throws(() => readZip(writeZip(new Map(names.map(n => [n, Buffer.alloc(0)])))), { code: 'ZIP_PATH' });
  }
  const duplicateEntries = { size: 2, *[Symbol.iterator]() { yield ['xl/', Buffer.alloc(0)]; yield ['xl/', Buffer.alloc(0)]; } };
  assert.throws(() => readZip(writeZip(duplicateEntries)), { code: 'ZIP_PATH' });
  assert.throws(() => readZip(writeZip(new Map([['xl/', Buffer.from('unexpected')]]))), { code: 'BAD_ZIP' });
});
