// Observation only: never turns a failed response into usable business values.
export function providerOutcome(result) {
 const code=String(result?.code??result?.error?.code??'').toLowerCase();
 if(['403','401','forbidden','unauthorized','permission-denied','no-permission'].includes(code))return 'no-permission';
 if(result?.outcome==='no-permission')return 'no-permission';
 if(result?.status==='not-required')return 'not-required';
 if(result?.status==='not-found')return 'zero-records';
 if(result?.status==='exact')return Object.keys(result.values||{}).length?'data':'zero-records';
 if(result?.status==='ambiguous')return 'review';
 if(result?.code==='qcc-response-invalid')return 'unknown';
 if(result?.isError||result?.status==='error'||result?.status==='cancelled')return 'failed';
 return 'unknown';
}
export const OUTCOME_LABELS=Object.freeze({data:'成功有数据','zero-records':'成功零记录','not-required':'无需执行','no-permission':'无权限',failed:'失败',unknown:'未知',review:'需核验'});
