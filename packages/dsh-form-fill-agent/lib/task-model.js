import { createHash } from 'node:crypto';
export const sealChangeSet = ({changeSetId,...body}) => ({...body,changeSetId:createHash('sha256').update(JSON.stringify(body)).digest('hex')});
// Older selections moved excluded candidates into incomplete. Recover only actual facts.
export function allCandidates(task){
 if(task.baseChangeSet)return task.baseChangeSet;
 const current=task.preview.changeSet,recovered=current.incomplete.filter(c=>c.reason==='user-excluded'&&c.changeType==='fill-blank'&&typeof c.newValue==='string');
 return sealChangeSet({...current,changes:[...current.changes,...recovered.map(({reason,...c})=>c)],incomplete:current.incomplete.filter(c=>!recovered.includes(c))});
}
export function selectCandidates(base,ids){
 if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!base.changes.some(c=>c.id===id)))throw Error('单元格选择无效');
 const selected=new Set(ids);
 return sealChangeSet({...base,changes:base.changes.filter(c=>selected.has(c.id)),incomplete:[...base.incomplete,...base.changes.filter(c=>!selected.has(c.id)).map(c=>({...c,reason:'user-excluded'}))]});
}
