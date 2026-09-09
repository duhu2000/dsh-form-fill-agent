import test from 'node:test';
import assert from 'node:assert/strict';
import { taskPresentation, isResultExplanation } from '../packages/dsh-form-fill-agent/lib/task-presentation.js';
import { previewBytes } from 'dsh-form-fill-agent';
import { fixtureBytes } from '../scripts/generate-fixtures.mjs';

test('task title is stable and completion does not hide review, no-data or failure', async()=>{
 const bytes=fixtureBytes('合成',['企业名称','法定代表人'],[['合成甲有限公司',''],['合成乙有限公司','']],{title:false});
 const preview=await previewBytes(bytes);
 const task={bytes,preview,filename:'合成台账.xlsx',created:Date.UTC(2026,8,9,5,31),state:'enriching',progress:{completed:1,total:2}};
 let p=taskPresentation(task);assert.equal(p.title,'合成台账｜2 家企业｜09-09 13:31');assert.equal(p.percent,50);assert.equal(p.status,'处理中');
 task.state='preview_ready';task.progress.completed=2;preview.changeSet.incomplete=[{reason:'no-data'}];
 p=taskPresentation(task);assert.equal(p.status,'已完成（部分字段无数据）');assert.equal(p.review,0);assert.equal(p.percent,100);
 preview.changeSet.incomplete.push({reason:'candidate-review-required'},{reason:'provider-error'});
 p=taskPresentation(task);assert.equal(p.status,'处理结束（需核验）');assert.equal(p.review,1);assert.equal(p.failures,1);assert.equal(p.percent,100);
 task.state='failed';assert.equal(taskPresentation(task).status,'执行失败');
 task.state='cancelled';task.progress.completed=1;assert.equal(taskPresentation(task).percent,50);
 task.progress=undefined;task.state='preview_ready';assert.equal(taskPresentation(task).status,'待确认字段');
 assert.equal(isResultExplanation({reason:'no-data'}),true);assert.equal(isResultExplanation({reason:'provider-error'}),false);
});
