// Display recommendations only: adopting a candidate remains an explicit UI action.
// Cleaning-side keys are adapted to the form-fill catalog, not its output schema.
const aliases = {
 company_name:['name','company','公司名称','单位名称','企业全称','公司全称','主体标识','原文件导入名称','单位','名称'],
 credit_no:['CreditCode','unified_credit_code','unifiedSocialCreditCode','信用代码','社会信用代码','统一信用代码','USCC'],
 reg_no:['registration_no','工商注册号'],
 legal_person:['法定代表','法人代表','legalRepresentative','legal_rep'],
 reg_capital:['注册资金'],established_date:['成立时间','企业成立日期','establishmentDate','establish_date'],
 business_status:['工商登记状态','企业状态','reg_status'],
 registered_address:['企业注册地址','公司注册地址'],
 contact_preferred_phone:['mobile','tel','telephone','电话','手机号码','手机号','phone'],
 contact_official_website:['官网','企业官网','官方网站地址','网址','website'],
 contact_preferred_email:['首选电子邮箱','邮箱','email'],
 actual_controller_name:['实控人','实际控制人','企业实控人名称','企业实际控制人','企业实控人名称（自然人请填写姓名）'],
 actual_controller_direct_ratio:['实际控制人直接持股比例'],
 actual_controller_total_ratio:['实际控制人总持股比例'],
 actual_controller_voting_ratio:['实际控制人表决权比例'],
};
const ambiguous = {
 地址:['registered_address','mailing_address','invoice_address'],
 address:['registered_address','mailing_address'],企业地址:['registered_address','mailing_address'],公司地址:['registered_address','mailing_address'],
 开业时间:['established_date'],开业日期:['established_date'],
 所属行业:['industry_category','qcc_industry'],行业:['industry_category','qcc_industry'],法人:['legal_person'],
};
const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[\s_\-·]/g,'');
export function mappingRecommendations(header,catalog){
 const label=normalize(String(header??'').normalize('NFKC').replace(/\s*\(?\s*YYYY[-/]MM[-/]DD\s*\)?\s*$/i,''));
 if(!label)return [];
 const available=new Set(catalog.map(f=>f.key));
 const hinted=Object.entries(ambiguous).find(([name])=>normalize(name)===label)?.[1];
 if(hinted)return hinted.filter(key=>available.has(key));
 const exact=catalog.filter(f=>[f.key,f.label,...(f.aliases||[]),...(aliases[f.key]||[])].some(name=>normalize(name)===label));
 if(exact.length)return exact.map(f=>f.key);
 // Conservative partial recommendations only. Do not discard units or semantic
 // qualifiers (industry definitions, staff populations, financial periods).
 return catalog.filter(f=>[f.key,f.label,...(f.aliases||[])].some(name=>label.length>=2&&normalize(name).includes(label))).slice(0,4).map(f=>f.key);
}
