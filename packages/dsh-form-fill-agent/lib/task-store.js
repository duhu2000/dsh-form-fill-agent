import { mkdirSync, lstatSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, rmdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertPlan, assertChangeSet, parseWorkbook, applyChangeSet } from 'form-fill-core';
const idPattern = /^[0-9a-f-]{36}$/;
export function createTaskStore({ directory, maxTasks = 10, now = Date.now, ttlMs = 86400000 } = {}) {
  const tasks = new Map();
  let root, lock;
  if (directory) {
    root = resolve(directory);
    mkdirSync(root, { recursive: true, mode: 0o700 });
    if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink() || (process.platform !== 'win32' && (lstatSync(root).mode & 0o077))) throw Error('Task directory must be private (0700) and not a symlink');
    lock = join(root, '.lock');
    try { mkdirSync(lock, { mode: 0o700 }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(readFileSync(join(lock, 'pid'), 'utf8'));
      if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('Invalid task store lock');
      let alive = true;
      try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
      if (alive) throw Error('Task store already in use');
      unlinkSync(join(lock, 'pid')); rmdirSync(lock); mkdirSync(lock, { mode: 0o700 });
    }
    writeFileSync(join(lock, 'pid'), String(process.pid), { mode: 0o600, flag: 'wx' });
    try {
      for (const file of readdirSync(root)) {
        if (!file.endsWith('.json')) continue;
        const id = file.slice(0,-5), path = join(root,file);
        if (!idPattern.test(id) || lstatSync(path).isSymbolicLink() || lstatSync(path).size > 48 * 1024 * 1024) throw Error('Invalid persisted task');
        const saved = JSON.parse(readFileSync(path,'utf8'));
        if (![1,2,3,4,5].includes(saved.schema) || saved.id !== id || !Number.isFinite(saved.created)) throw Error('Invalid task schema');
        if (now() - saved.created >= ttlMs) { unlinkSync(path); continue; }
        if (tasks.size >= maxTasks) throw Error('Task capacity exceeded');
        const bytes = Buffer.from(saved.base64,'base64');
        const doc = parseWorkbook(bytes);
        if (saved.preview) {
          assertPlan(saved.preview.plan); assertChangeSet(saved.preview.changeSet);
          if(saved.baseChangeSet){assertChangeSet(saved.baseChangeSet);if(saved.baseChangeSet.planId!==saved.preview.plan.planId)throw Error('Candidate plan mismatch');}
          if (saved.preview.plan.documentHash !== doc.documentHash || saved.preview.changeSet.planId !== saved.preview.plan.planId) throw Error('Persisted document mismatch');
        }
        const task = { bytes, preview: saved.preview, baseChangeSet:saved.baseChangeSet, progress:saved.progress, configuration: saved.configuration, selectedFields:saved.selectedFields, analyzeOnly: saved.analyzeOnly, created: saved.created, revision: saved.revision ?? 1, owner: saved.owner, filename: saved.filename ?? '未命名表格.xlsx', updatedAt: saved.updatedAt ?? saved.created, state: saved.state === 'enriching' ? 'interrupted' : saved.state ?? (saved.confirmed ? 'completed' : 'preview_ready'), sessionId: saved.sessionId };
        if (saved.confirmed && task.preview) task.result = applyChangeSet(bytes,task.preview.plan,task.preview.changeSet,{confirmChangeSetId:task.preview.changeSet.changeSetId});
        tasks.set(id,task);
      }
    } catch (error) { unlinkSync(join(lock,'pid')); rmdirSync(lock); throw error; }
  }
  return {
    get size() { return tasks.size; },
    [Symbol.iterator]: () => tasks[Symbol.iterator](),
    get: id => tasks.get(id),
    set(id, task) {
      if (!idPattern.test(id)) throw Error('Invalid task ID');
      if (!tasks.has(id) && tasks.size >= maxTasks) throw Error('Task capacity exceeded');
      if (root) {
        const json = JSON.stringify({ schema:5,id,base64:task.bytes.toString('base64'),preview:task.preview,baseChangeSet:task.baseChangeSet,progress:task.progress,configuration:task.configuration,selectedFields:task.selectedFields,analyzeOnly:task.analyzeOnly,created:task.created,revision:task.revision ?? 1,confirmed:!!task.result,owner:task.owner,filename:task.filename,updatedAt:task.updatedAt,state:task.state,sessionId:task.sessionId });
        if (Buffer.byteLength(json) > 48*1024*1024) throw Error('Task too large');
        const temp = join(root,'.'+randomUUID()+'.tmp');
        try { writeFileSync(temp,json,{mode:0o600,flag:'wx'});renameSync(temp,join(root,id+'.json')); }
        finally { try { unlinkSync(temp); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
      }
      tasks.set(id,task);
    },
    delete(id) {
      if (!idPattern.test(id)) return false;
      if (root) { try { unlinkSync(join(root,id+'.json')); } catch (e) { if(e.code!=='ENOENT')throw e; } }
      return tasks.delete(id);
    },
    close() { tasks.clear(); if(lock) { unlinkSync(join(lock,'pid'));rmdirSync(lock);lock=null; } },
  };
}
