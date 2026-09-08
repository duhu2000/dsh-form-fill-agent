import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { applyChangeSet, parseWorkbook } from 'form-fill-core';
import { FIELD_CATALOG, QCC_FIELD_CATALOG, ACTUAL_CONTROLLER_GROUP, isCompleteAnchor } from 'qcc-form-fill-provider';
import { previewBytes } from './workflow.js';
import { createTaskStore } from './task-store.js';
import { allCandidates, selectCandidates } from './task-model.js';
import { gridPage } from './grid.js';
import { diagnostics } from './diagnostics.js';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FIXTURES = ['客户台账', '供应商准入表', '合同主体信息表'];
export function createFormFillHandler({ basePath = '', getPort, now = Date.now, ttlMs = 15 * 60 * 1000, maxTasks = 10, taskDirectory, getQccStatus = () => false } = {}) {
  const tasks = createTaskStore({ directory: taskDirectory, maxTasks, now, ttlMs });
  let inFlight = 0, disposed = false;
  const running = new Set();
  const controllers=new Map();
  const validOwner = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const visible = (task, owner) => task && (!task.owner || task.owner === owner);
  const metadata = (id, task) => ({ id, filename: task.filename ?? '未命名表格.xlsx', revision: task.revision ?? 1, state: task.state ?? (task.result ? 'completed' : 'preview_ready'), created: task.created, updatedAt: task.updatedAt ?? task.created, expiresAt: task.created + ttlMs, sessionId: task.sessionId, confirmed: !!task.result });
  const settings = task => ({
    mappingProtocol: 2,
    diagnostics: diagnostics(task.preview),
    configuration: task.configuration ?? {},
    selectedFields: task.selectedFields,
    progress: task.progress,
    candidates: allCandidates(task).changes,
    selectedIds: task.preview.changeSet.changes.map(c=>c.id),
    catalog: FIELD_CATALOG,
    catalogGroups: [...QCC_FIELD_CATALOG,ACTUAL_CONTROLLER_GROUP].map(g=>({id:g.id,label:g.label,fields:g.fields.flatMap(item=>FIELD_CATALOG.filter(f=>f.key===item.id||f.aliases?.includes(item.id)).map(f=>f.key))})),
    structure: parseWorkbook(task.bytes).sheets.filter(s => !s.hidden).map(s => ({
      name: s.name,
      rows: s.rows.filter(r => !r.hidden).slice(0,30).map(r => ({ number: r.number, cells: Object.values(s.cells).filter(c => c.row === r.number && !c.hidden && c.value.trim()).map(c => ({ column: c.column, label: c.value })) })),
    })),
  });
  const sweep = () => { for (const [id, task] of tasks) if (now() - task.created >= ttlMs) {controllers.get(id)?.abort();tasks.delete(id);} };
  const timer = setInterval(sweep, Math.min(ttlMs, 60000)); timer.unref();
  const handler = async (request, response) => {
    const send = (status, data, type = 'application/json') => {
      response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'" });
      response.end(type === 'application/json' ? JSON.stringify(data) : data);
    };
    if (disposed) return send(503, { message: '插件已卸载，请重新打开' });
    const host = request.headers.host, port = getPort?.();
    if (!Number.isInteger(port) || port === 43120 || !['127.0.0.1:' + port, 'localhost:' + port].includes(host)) return send(403, { message: '仅允许本机隔离端口访问' });
    const origin = 'http://' + host;
    const owner = request.headers['x-form-fill-owner'] ?? /(?:^|; )ff_owner=([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie ?? '')?.[1];
    if (request.headers['sec-fetch-site'] === 'cross-site' || (request.headers.origin && request.headers.origin !== origin)) return send(403, { message: '仅允许同源访问' });
    let reserved = false;
    try {
      sweep();
      const url = new URL(request.url, origin);
      if (url.pathname !== basePath && !url.pathname.startsWith(basePath + '/')) return send(404, { message: '路径不存在' });
      const path = url.pathname.slice(basePath.length) || '/';
      if (request.method === 'GET' && path === '/') return send(200, await readFile(new URL('./ui.html', import.meta.url)), 'text/html; charset=utf-8');
      if (request.method === 'GET' && path === '/brand.css') return send(200, await readFile(new URL('./brand.css', import.meta.url)), 'text/css; charset=utf-8');
      if (request.method === 'GET' && path === '/health') return send(200, { plugin: 'form-fill-agent', product: 'AI填表', version: '0.1.0-alpha.7', provider: 'mock-only', qccAvailable: !!getQccStatus(), companionRequired: false, taskStorage: taskDirectory ? 'disk' : 'memory' });
      if (request.method === 'GET' && path === '/tasks') {
        if (!validOwner(owner)) return send(403, { message: '需要本地任务访问凭据' });
        return send(200, [...tasks].filter(([, t]) => t.owner === owner).map(([id,t]) => metadata(id,t)).sort((a,b) => b.updatedAt-a.updatedAt));
      }
      if (request.method === 'GET' && path.startsWith('/task/')) {
        const id = path.slice(6), task = tasks.get(id);
        if (!visible(task, owner)) return send(404, { message: '任务不存在或已过期' });
        return send(200, { ...task.preview, ...metadata(id,task), ...settings(task) });
      }
      if(request.method==='GET'&&path.startsWith('/grid/')){
        const task=tasks.get(path.slice(6));if(!visible(task,owner))return send(404,{message:'任务不存在或已过期'});
        return send(200,gridPage(task,url.searchParams));
      }
      if (request.method === 'GET' && path.startsWith('/fixture/')) {
        const name = decodeURIComponent(path.slice(9));
        if (!FIXTURES.includes(name)) return send(404, { message: '模板不存在' });
        return send(200, await readFile(new URL('./fixtures/' + name + '.xlsx', import.meta.url)), XLSX_TYPE);
      }
      if (request.method === 'GET' && path.startsWith('/download/')) {
        const parts = path.split('/'), [, , id, kind] = parts, task = tasks.get(id);
        if (parts.length !== 4 || !visible(task, owner) || !task?.result) return send(404, { message: '请先确认写回，或预览已过期' });
        if (kind === 'xlsx') return send(200, task.result.bytes, XLSX_TYPE);
        if (kind === 'changes') return send(200, { kind: 'WritebackReport', changeSet: task.preview.changeSet, appliedChanges: task.result.changes, outputChecksum: task.result.checksum });
        if (kind === 'incomplete') return send(200, task.result.incomplete);
        return send(404, { message: '制品不存在' });
      }
      if (request.method !== 'POST' || !['/preview', '/confirm', '/discard', '/select', '/configure', '/resolve', '/scope', '/cancel'].includes(path)) return send(404, { message: '路径不存在' });
      if (request.headers.origin !== origin || request.headers['content-type'] !== 'application/json') return send(403, { message: '请求需来自本页' });
      if (path === '/preview') {
        if (tasks.size + inFlight >= maxTasks) return send(429, { message: '预览数量已达上限，请先释放旧预览' });
        inFlight++; reserved = true;
      }
      const chunks = []; let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > (['/preview','/select'].includes(path) ? 12 * 1024 * 1024 : path === '/configure' ? 1024 * 1024 : 4096)) return send(413, { message: '请求过大' });
        chunks.push(chunk);
      }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return send(400, { message: '请求格式无效' }); }
      if (!body || Array.isArray(body) || typeof body !== 'object') return send(400, { message: '请求格式无效' });
      if (path === '/preview') {
        if (typeof body.base64 !== 'string' || !body.base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64) || body.base64.length % 4) return send(400, { message: '文件编码无效' });
        const bytes = Buffer.from(body.base64, 'base64');
        if (bytes.toString('base64') !== body.base64) return send(400, { message: '文件编码无效' });
        const preview = await previewBytes(bytes, body.analyzeOnly ? { provider: { mode: 'mock', version: '0.1.0-alpha.5', capabilities: [], lookup: async () => ({ status: 'not-found' }) } } : {}), id = randomUUID();
        if (disposed) return send(503, { message: '插件已卸载' });
        const filename = typeof body.filename === 'string' ? body.filename.replace(/[\\/\x00-\x1f]/g,'').slice(0,180) : '未命名表格.xlsx';
        if (owner && !validOwner(owner)) return send(400, { message: '任务访问凭据无效' });
        const task = { bytes, preview, analyzeOnly: !!body.analyzeOnly, created: now(), updatedAt: now(), revision: 1, state: 'preview_ready', owner, filename, sessionId: typeof body.sessionId === 'string' ? body.sessionId.slice(0,160) : undefined };
        tasks.set(id, task);
        return send(200, { ...preview, ...metadata(id,task), ...settings(task) });
      }
      const task = tasks.get(body.id);
      if (!visible(task, owner)) return send(404, { message: '预览已过期，请重新上传' });
      if ((task.owner || body.expectedRevision !== undefined) && body.expectedRevision !== (task.revision ?? 1)) return send(409, { code: 'REVISION_CONFLICT', message: '任务已更新，请刷新后重试' });
      if(path==='/cancel'){
        const controller=controllers.get(body.id);if(!controller)return send(409,{message:'任务当前未运行'});
        controller.abort();return send(200,{cancelRequested:true});
      }
      if (running.has(body.id)) return send(409, { message: '任务正在查询，请稍后再操作' });
      if (path === '/discard') { tasks.delete(body.id); return send(200, { discarded: true }); }
      if (path === '/configure' || path === '/resolve' || path === '/scope') {
        if (task.result) return send(409, { message: '已确认任务不能修改，请新建任务' });
        let configuration,selectedFields=task.selectedFields;
        if (path === '/scope') { configuration=task.configuration;selectedFields=body.selectedFields;
          if(!Array.isArray(selectedFields)) return send(400,{message:'请选择填写字段'});
        } else if (path === '/configure') {
          if (!body.configuration || Object.keys(body.configuration).some(k => !['sheets','headers','mappings'].includes(k))) return send(400, { message: '字段设置无效' });
          configuration = body.configuration;selectedFields=undefined;
        } else {
          const item = task.preview.changeSet.incomplete.find(i => i.sheet === body.sheet && i.row === body.row && i.reason === 'candidate-review-required');
          if (!item) return send(400, { message: '当前记录不需要候选确认' });
          const candidate = item.candidates?.find(c => c.id === body.candidateId);
          const value = body.candidateId ? (isCompleteAnchor(candidate?.company_name)?candidate.company_name:candidate?.credit_no) : body.value;
          if (!isCompleteAnchor(value)) return send(400, { message: '请选择当前候选或输入完整登记名称/信用代码' });
          configuration = { ...task.configuration, anchors: [...(task.configuration?.anchors ?? []).filter(x => x.sheet !== body.sheet || x.row !== body.row), { sheet: body.sheet, row: body.row, value }] };
        }
        const preview = await previewBytes(task.bytes, { configuration, selectedFields, ...(task.analyzeOnly !== false ? { provider: { mode: 'mock', version: '0.1.0-alpha.5', capabilities: [], lookup: async () => ({ status: 'not-found' }) } } : {}) });
        if (disposed || tasks.get(body.id) !== task || running.has(body.id)) return send(409, { message: '任务已更新，请刷新后重试' });
        const updated = { ...task, configuration, selectedFields, preview, baseChangeSet:undefined, revision: (task.revision ?? 1)+1, updatedAt: now(), state: 'preview_ready' };
        tasks.set(body.id,updated);
        return send(200, { ...preview, ...metadata(body.id,updated), ...settings(updated) });
      }
      if (path === '/select') {
        if (task.result) return send(409, { message: '已确认任务不能修改' });
        const original = allCandidates(task), selected = body.selectedIds;
        if (!Array.isArray(selected) || selected.length !== new Set(selected).size || selected.some(id => !original.changes.some(c => c.id === id))) return send(400, { message: '单元格选择无效' });
        const changeSet = selectCandidates(original,selected);
        const updated = { ...task, baseChangeSet:original, preview: { ...task.preview, changeSet }, revision: (task.revision ?? 1) + 1, updatedAt: now() };
        tasks.set(body.id,updated);
        return send(200, { ...updated.preview, ...metadata(body.id,updated), ...settings(updated) });
      }
      if (body.confirmChangeSetId !== task.preview.changeSet.changeSetId) return send(409, { message: '请确认当前预览' });
      const result = task.result ?? applyChangeSet(task.bytes, task.preview.plan, task.preview.changeSet, { confirmChangeSetId: body.confirmChangeSetId });
      const updated = { ...task, result, state: 'completed', updatedAt: now(), revision: (task.revision ?? 1) + (task.result ? 0 : 1) };
      tasks.set(body.id, updated);
      return send(200, { filled: result.changes.length, incomplete: result.incomplete.length, checksum: result.checksum });
    } catch (error) { return send(400, { code: error.code ?? 'FORM_FILL_ERROR', message: error.code ? error.message : '处理失败，请检查输入文件' }); }
    finally { if (reserved) inFlight--; }
  };
  return {
    handler,
    async enrich(id, provider, expectedRevision, {retryOnly=false}={}) {
      sweep();
      const task = tasks.get(id);
      if (disposed || !task || task.result || running.has(id)) throw Error('任务不存在、已确认或正在执行');
      if ((task.owner || expectedRevision !== undefined) && expectedRevision !== (task.revision ?? 1)) throw Error('REVISION_CONFLICT：任务已更新');
      running.add(id);
      const controller=new AbortController();controllers.set(id,controller);
      let active = { ...task, state: 'enriching', progress:{completed:0,total:0}, updatedAt: now(), revision: (task.revision ?? 1) + 1 };
      const excluded=new Set(allCandidates(task).changes.filter(c=>!task.preview.changeSet.changes.some(s=>s.id===c.id)).map(c=>c.id));
      const update=(preview,state,progress)=>{
        if(disposed||tasks.get(id)!==active)throw Error('任务已过期或被替换');
        const baseChangeSet=preview.changeSet;
        const selected=selectCandidates(baseChangeSet,baseChangeSet.changes.filter(c=>!excluded.has(c.id)).map(c=>c.id));
        active={...active,baseChangeSet,preview:{...preview,changeSet:selected},state,progress,updatedAt:now(),revision:active.revision+1};tasks.set(id,active);
      };
      try {
        tasks.set(id, active);
        const preview = await previewBytes(task.bytes, { provider, confirmPaidCalls: true, configuration: task.configuration, selectedFields: task.selectedFields,signal:controller.signal,retryOnly,previousChangeSet:retryOnly?allCandidates(task):undefined,onProgress:async({analysis,plan,changeSet,completed,total})=>update({analysis,plan,changeSet},'enriching',{completed,total}) });
        if (disposed || tasks.get(id) !== active) throw Error('任务已过期或被替换');
        update(preview,controller.signal.aborted?'cancelled':preview.changeSet.incomplete.some(i => i.reason === 'provider-error') ? 'partial' : 'preview_ready',active.progress);
        return { taskId: id, filled: active.preview.changeSet.changes.length, incomplete: active.preview.changeSet.incomplete.length, diagnostics:diagnostics(active.preview), previewPath: basePath + '/#task=' + id };
      } catch (error) {
        if (!disposed && tasks.get(id) === active) tasks.set(id, { ...active, state: 'failed', updatedAt: now(), revision: active.revision + 1 });
        throw error;
      } finally { running.delete(id);controllers.delete(id); }
    },
    dispose() { if (disposed) return; disposed = true;for(const c of controllers.values())c.abort(); clearInterval(timer); tasks.close(); },
  };
}
