import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnostics,renderEnrichmentResult } from '../packages/dsh-form-fill-agent/lib/diagnostics.js';
test('diagnostics separate missing-anchor rows from field exclusion and provider outcomes without values',()=>{
 const preview={analysis:{tables:[{sheet:'合成表',mappings:[{column:2,label:'电话',field:'phone'}]}]},plan:{calls:[{fields:['phone']}]},changeSet:{changes:[],incomplete:[{reason:'missing-anchor',row:2,sheet:'合成表'},{reason:'user-excluded',cell:'B3',sheet:'合成表'},{reason:'provider-error',cell:'B4',sheet:'合成表'},{reason:'no-data',cell:'B5',sheet:'合成表',anchor:{company_name:'不可外泄值'}}]}};
 const value=diagnostics(preview);
 assert.equal(value.reasons.find(x=>x.code==='missing-anchor').unit,'行');
 assert.equal(value.columns[0].incomplete,3);
 assert.equal(value.reasons.find(x=>x.code==='user-excluded').count,1);
 assert.ok(!JSON.stringify(value).includes('不可外泄值'));
 const rendered=renderEnrichmentResult({filled:0,incomplete:4,diagnostics:value,previewPath:'/preview'});
 assert.match(rendered,/调用失败/);assert.match(rendered,/未纳入/);assert.match(rendered,/尚未写入/);
 assert.match(rendered,/不能仅凭可填写为 0 推断授权异常/);
});
