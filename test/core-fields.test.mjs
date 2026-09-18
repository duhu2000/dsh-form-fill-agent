import test from 'node:test';
import assert from 'node:assert/strict';
import {FIELD_CATALOG,createCatalogProvider,createQccProvider} from 'qcc-form-fill-provider';
import {CORE_FIELDS} from '../packages/qcc-form-fill-provider/lib/core-fields.js';
import {mapProfileFields} from '../packages/qcc-form-fill-provider/lib/projections.js';
import {mappingRecommendations} from '../packages/dsh-form-fill-agent/lib/mapping-recommendations.js';
import {previewBytes} from 'dsh-form-fill-agent';
import {fixtureBytes} from '../scripts/generate-fixtures.mjs';
const name='合成字段有限公司';
test('14 optional fields are searchable and mapped without merging scale or industry meanings',()=>{
 assert.equal(FIELD_CATALOG.length,151);assert.equal(new Set(FIELD_CATALOG.map(f=>f.key)).size,151);
 for(const f of CORE_FIELDS){assert.equal(f.defaultSelected,false);for(const label of [f.label,...f.aliases])assert.deepEqual(mappingRecommendations(label,FIELD_CATALOG),[f.key]);assert.ok(f.selectionNote);}
 assert.deepEqual(mappingRecommendations('企业规模',FIELD_CATALOG),['company_scale']);
 assert.deepEqual(mappingRecommendations('人员规模',FIELD_CATALOG),['company_size']);
});
test('industry objects have explicit levels; flat text and missing levels never infer children',()=>{
 const p=mapProfileFields({企查查行业:{一级:'制造业',三级:'设备'},企业规模:'中型',主营产品:['甲','','乙',{}]});
 assert.equal(p.qcc_industry,'一级：制造业；三级：设备');assert.equal(p.qcc_industry_level2,'');assert.equal(p.company_scale,'中型');assert.equal(p.main_products,'甲；乙');
 const legacy=mapProfileFields({企查查行业:'原始行业'});assert.equal(legacy.qcc_industry,'原始行业');assert.equal(legacy.qcc_industry_level1,'');
 assert.equal(mapProfileFields({企查查行业:{一级:{}},企业规模:{},主营产品:{}}).qcc_industry,'');
});
test('registration projects nested fields in one lookup with exact source and preserves missing levels',async()=>{
 let calls=0;const provider=createQccProvider({callTool:async()=>{calls++;return {企业名称:name,地区信息:{省份:'江苏',地区代码:'0012'},国标行业:{门类:'制造业',小类:'设备制造'},人员规模:'10-20人'}}});
 const result=await provider.lookup({capability:'qcc-registration',anchor:{company_name:name},fields:['province','area_code','industry_category','industry_section','industry_large','company_size']});
 assert.equal(calls,1);assert.equal(result.values.area_code.value,'0012');assert.equal(result.values.province.source,'qcc://get_company_registration_info/地区信息.省份');assert.equal(result.values.industry_category.value,'门类：制造业；小类：设备制造');assert.equal(result.values.industry_large,undefined);assert.equal(result.values.company_size.value,'10-20人');
});
test('XLSX duplicate new fields fill separately without adding columns or querying per position',async()=>{
 const calls=[];const provider=createCatalogProvider({availableTools:['get_company_profile'],callTool:async(tool,args)=>{calls.push(tool);return tool==='get_company_registration_info'?{企业名称:args.searchKey}:{企查查行业:{一级:'制造业'},企业规模:'小型',主营产品:['甲','乙']}}});
 const bytes=fixtureBytes('合成',['企业名称','企业规模','规模副本','主营产品'],[[name,'','','已有产品']],{title:false});
 const p=await previewBytes(bytes,{provider,confirmPaidCalls:true,configuration:{mappings:[{sheet:'合成',column:2,field:'company_scale'},{sheet:'合成',column:3,field:'company_scale'}]}});
 assert.deepEqual(p.changeSet.changes.map(c=>c.cell),['B2','C2']);assert.deepEqual(calls,['get_company_registration_info','get_company_profile']);
});
