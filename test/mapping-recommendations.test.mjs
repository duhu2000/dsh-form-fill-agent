import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FIELD_CATALOG} from '../packages/qcc-form-fill-provider/lib/index.js';
import {mappingRecommendations as recommend} from '../packages/dsh-form-fill-agent/lib/mapping-recommendations.js';
test('every supported catalog label and key is available as a recommendation',()=>{
 for(const field of FIELD_CATALOG)for(const label of [field.label,field.key])assert.ok(recommend(label,FIELD_CATALOG).includes(field.key),label);
});
test('cleaning aliases adapt to form-fill keys and formatting',()=>{
 for(const [label,key] of Object.entries({CreditCode:'credit_no','Credit Code':'credit_no',USCC:'credit_no',企业状态:'business_status',legalRepresentative:'legal_person',registration_no:'reg_no',establishmentDate:'established_date',mobile:'contact_preferred_phone',email:'contact_preferred_email',企业官网:'contact_official_website',实际控制人总持股比例:'actual_controller_total_ratio','核准日期（YYYY/MM/DD）':'approval_date','核准日期 YYYY-MM-DD':'approval_date'}))assert.ok(recommend(label,FIELD_CATALOG).includes(key),label);
});
test('ambiguous definitions retain separate choices; unsupported semantics remain unmatched',()=>{
 assert.deepEqual(recommend('行业',FIELD_CATALOG),['industry_category','qcc_industry']);
 assert.deepEqual(recommend('企业地址',FIELD_CATALOG),['registered_address','mailing_address']);
 assert.deepEqual(recommend('地址',FIELD_CATALOG),['registered_address','mailing_address','invoice_address']);
 for(const label of ['从业人数','人员规模（仅正式员工）','主营业务收入','受益所有人','YYYY-MM-DD'])assert.deepEqual(recommend(label,FIELD_CATALOG),[],label);
 assert.deepEqual(recommend('address',[]),[]);
});
