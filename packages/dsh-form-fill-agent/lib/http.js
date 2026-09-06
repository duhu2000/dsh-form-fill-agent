import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { applyChangeSet } from 'form-fill-core';
import { previewBytes } from './workflow.js';
import { createTaskStore } from './task-store.js';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FIXTURES = ['客户台账', '供应商准入表', '合同主体信息表'];
export function createFormFillHandler({ basePath = '', getPort, now = Date.now, ttlMs = 15 * 60 * 1000, maxTasks = 10, taskDirectory, getQccStatus = () => false } = {}) {
  const tasks = createTaskStore({ directory: taskDirectory, maxTasks, now, ttlMs });
  let inFlight = 0, disposed = false;
  const running = new Set();
  const validOwner = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const visible = (task, owner) => task && (!task.owner || task.owner === owner);
  const metadata = (id, task) => ({ id, filename: task.filename ?? '未命名表格.xlsx', revision: task.revision ?? 1, state: task.state ?? (task.result ? 'completed' : 'preview_ready'), created: task.created, updatedAt: task.updatedAt ?? task.created, expiresAt: task.created + ttlMs, sessionId: task.sessionId, confirmed: !!task.result });
  const sweep = () => { for (const [id, task] of tasks) if (now() - task.created >= ttlMs) tasks.delete(id); };
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
      if (request.method === 'GET' && path === '/health') return send(200, { plugin: 'form-fill-agent', product: 'AI填表', version: '0.1.0-alpha.2', provider: 'mock-only', qccAvailable: !!getQccStatus(), companionRequired: false, taskStorage: taskDirectory ? 'disk' : 'memory' });
      if (request.method === 'GET' && path === '/tasks') {
        if (!validOwner(owner)) return send(403, { message: '需要本地任务访问凭据' });
        return send(200, [...tasks].filter(([, t]) => t.owner === owner).map(([id,t]) => metadata(id,t)).sort((a,b) => b.updatedAt-a.updatedAt));
      }
      if (request.method === 'GET' && path.startsWith('/task/')) {
        const id = path.slice(6), task = tasks.get(id);
        if (!visible(task, owner)) return send(404, { message: '任务不存在或已过期' });
        return send(200, { ...task.preview, ...metadata(id,task) });
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
      if (request.method !== 'POST' || !['/preview', '/confirm', '/discard', '/select'].includes(path)) return send(404, { message: '路径不存在' });
      if (request.headers.origin !== origin || request.headers['content-type'] !== 'application/json') return send(403, { message: '请求需来自本页' });
      if (path === '/preview') {
        if (tasks.size + inFlight >= maxTasks) return send(429, { message: '预览数量已达上限，请先释放旧预览' });
        inFlight++; reserved = true;
      }
      const chunks = []; let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > (['/preview','/select'].includes(path) ? 12 * 1024 * 1024 : 4096)) return send(413, { message: '请求过大' });
        chunks.push(chunk);
      }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return send(400, { message: '请求格式无效' }); }
      if (!body || Array.isArray(body) || typeof body !== 'object') return send(400, { message: '请求格式无效' });
      if (path === '/preview') {
        if (typeof body.base64 !== 'string' || !body.base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64) || body.base64.length % 4) return send(400, { message: '文件编码无效' });
        const bytes = Buffer.from(body.base64, 'base64');
        if (bytes.toString('base64') !== body.base64) return send(400, { message: '文件编码无效' });
        const preview = await previewBytes(bytes, body.analyzeOnly ? { provider: { mode: 'mock', version: '0.1.0-alpha.1', capabilities: [], lookup: async () => ({ status: 'not-found' }) } } : {}), id = randomUUID();
        if (disposed) return send(503, { message: '插件已卸载' });
        const filename = typeof body.filename === 'string' ? body.filename.replace(/[\\/\x00-\x1f]/g,'').slice(0,180) : '未命名表格.xlsx';
        if (owner && !validOwner(owner)) return send(400, { message: '任务访问凭据无效' });
        const task = { bytes, preview, created: now(), updatedAt: now(), revision: 1, state: 'preview_ready', owner, filename, sessionId: typeof body.sessionId === 'string' ? body.sessionId.slice(0,160) : undefined };
        tasks.set(id, task);
        return send(200, { ...preview, ...metadata(id,task) });
      }
      const task = tasks.get(body.id);
      if (!visible(task, owner)) return send(404, { message: '预览已过期，请重新上传' });
      if ((task.owner || body.expectedRevision !== undefined) && body.expectedRevision !== (task.revision ?? 1)) return send(409, { code: 'REVISION_CONFLICT', message: '任务已更新，请刷新后重试' });
      if (running.has(body.id)) return send(409, { message: '任务正在查询，请稍后再操作' });
      if (path === '/discard') { tasks.delete(body.id); return send(200, { discarded: true }); }
      if (path === '/select') {
        if (task.result) return send(409, { message: '已确认任务不能修改' });
        const original = task.preview.changeSet, selected = body.selectedIds;
        if (!Array.isArray(selected) || selected.length !== new Set(selected).size || selected.some(id => !original.changes.some(c => c.id === id))) return send(400, { message: '单元格选择无效' });
        const { changeSetId, ...body_ } = original;
        body_.changes = original.changes.filter(c => selected.includes(c.id));
        body_.incomplete = [...original.incomplete, ...original.changes.filter(c => !selected.includes(c.id)).map(c => ({ ...c, reason: 'user-excluded' }))];
        const changeSet = { ...body_, changeSetId: createHash('sha256').update(JSON.stringify(body_)).digest('hex') };
        const updated = { ...task, preview: { ...task.preview, changeSet }, revision: (task.revision ?? 1) + 1, updatedAt: now() };
        tasks.set(body.id,updated);
        return send(200, { ...updated.preview, ...metadata(body.id,updated) });
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
    async enrich(id, provider, expectedRevision) {
      sweep();
      const task = tasks.get(id);
      if (disposed || !task || task.result || running.has(id)) throw Error('任务不存在、已确认或正在执行');
      if ((task.owner || expectedRevision !== undefined) && expectedRevision !== (task.revision ?? 1)) throw Error('REVISION_CONFLICT：任务已更新');
      running.add(id);
      const active = { ...task, state: 'enriching', updatedAt: now(), revision: (task.revision ?? 1) + 1 };
      try {
        tasks.set(id, active);
        const preview = await previewBytes(task.bytes, { provider, confirmPaidCalls: true });
        if (disposed || tasks.get(id) !== active) throw Error('任务已过期或被替换');
        tasks.set(id, { ...active, preview, state: preview.changeSet.incomplete.some(i => i.reason === 'provider-error') ? 'partial' : 'preview_ready', updatedAt: now(), revision: active.revision + 1 });
        return { taskId: id, filled: preview.changeSet.changes.length, incomplete: preview.changeSet.incomplete.length, previewPath: basePath + '/#task=' + id };
      } catch (error) {
        if (!disposed && tasks.get(id) === active) tasks.set(id, { ...active, state: 'failed', updatedAt: now(), revision: active.revision + 1 });
        throw error;
      } finally { running.delete(id); }
    },
    dispose() { if (disposed) return; disposed = true; clearInterval(timer); tasks.close(); },
  };
}
