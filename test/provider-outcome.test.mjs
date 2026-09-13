import test from 'node:test';import assert from 'node:assert/strict';
import {providerOutcome,OUTCOME_LABELS} from '../packages/dsh-form-fill-agent/lib/provider-outcome.js';
test('provider outcomes distinguish data, zero, unnecessary, permission, failure and unknown',()=>{
 for(const [input,outcome] of [[{status:'exact',values:{中文字段:{value:0}}},'data'],[{status:'exact',values:{}},'zero-records'],[{status:'not-found'},'zero-records'],[{status:'not-required'},'not-required'],[{code:403,isError:true},'no-permission'],[{status:'error'},'failed'],[{status:'error',code:'qcc-response-invalid'},'unknown'],[{},'unknown'],[{status:'ambiguous'},'review']]){assert.equal(providerOutcome(input),outcome);assert.ok(OUTCOME_LABELS[outcome])}
});
