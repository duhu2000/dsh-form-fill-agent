import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { applyChangeSet } from 'form-fill-core';
import { previewBytes } from './workflow.js';
import { createTaskStore } from './task-store.js';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FIXTURES = ['客户台账', '供应商准入表', '合同主体信息表'];
export function createFormFillHandler({ basePath = '', getPort, now = Date.now, ttlMs = 15 * 60 * 1000, maxTasks = 10, taskDirectory } = {}) {
  const tasks = createTaskStore({ directory: taskDirectory, maxTasks, now, ttlMs });
  let inFlight = 0, disposed = false;
  const running = new Set();
  const sweep = () => { for (const [id, task] of tasks) if (now() - task.created >= ttlMs) tasks.delete(id); };
  const timer = setInterval(sweep, Math.min(ttlMs, 60000)); timer.unref();
  const handler = async (request, response) => {
    const send = (status, data, type = 'application/json') => {
      response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
      response.end(type === 'application/json' ? JSON.stringify(data) : data);
    };
    if (disposed) return send(503, { message: '插件已卸载，请重新打开' });
    const host = request.headers.host, port = getPort?.();
    if (!Number.isInteger(port) || port === 43120 || !['127.0.0.1:' + port, 'localhost:' + port].includes(host)) return send(403, { message: '仅允许本机隔离端口访问' });
    const origin = 'http://' + host;
    if (request.headers['sec-fetch-site'] === 'cross-site' || (request.headers.origin && request.headers.origin !== origin)) return send(403, { message: '仅允许同源访问' });
    let reserved = false;
    try {
      sweep();
      const url = new URL(request.url, origin);
      if (url.pathname !== basePath && !url.pathname.startsWith(basePath + '/')) return send(404, { message: '路径不存在' });
      const path = url.pathname.slice(basePath.length) || '/';
      if (request.method === 'GET' && path === '/') return send(200, await readFile(new URL('./ui.html', import.meta.url)), 'text/html; charset=utf-8');
      if (request.method === 'GET' && path === '/health') return send(200, { plugin: 'form-fill-agent', product: 'AI填表', version: '0.1.0-alpha.1', provider: 'mock-only', companionRequired: false, taskStorage: taskDirectory ? 'disk' : 'memory', tasks: tasks.size });
      if (request.method === 'GET' && path.startsWith('/task/')) {
        const id = path.slice(6), task = tasks.get(id);
        if (!task) return send(404, { message: '任务不存在或已过期' });
        return send(200, { id, ...task.preview, confirmed: !!task.result });
      }
      if (request.method === 'GET' && path.startsWith('/fixture/')) {
        const name = decodeURIComponent(path.slice(9));
        if (!FIXTURES.includes(name)) return send(404, { message: '模板不存在' });
        return send(200, await readFile(new URL('./fixtures/' + name + '.xlsx', import.meta.url)), XLSX_TYPE);
      }
      if (request.method === 'GET' && path.startsWith('/download/')) {
        const parts = path.split('/'), [, , id, kind] = parts, task = tasks.get(id);
        if (parts.length !== 4 || !task?.result) return send(404, { message: '请先确认写回，或预览已过期' });
        if (kind === 'xlsx') return send(200, task.result.bytes, XLSX_TYPE);
        if (kind === 'changes') return send(200, { kind: 'WritebackReport', changeSet: task.preview.changeSet, appliedChanges: task.result.changes, outputChecksum: task.result.checksum });
        if (kind === 'incomplete') return send(200, task.result.incomplete);
        return send(404, { message: '制品不存在' });
      }
      if (request.method !== 'POST' || !['/preview', '/confirm', '/discard'].includes(path)) return send(404, { message: '路径不存在' });
      if (request.headers.origin !== origin || request.headers['content-type'] !== 'application/json') return send(403, { message: '请求需来自本页' });
      if (path === '/preview') {
        if (tasks.size + inFlight >= maxTasks) return send(429, { message: '预览数量已达上限，请先释放旧预览' });
        inFlight++; reserved = true;
      }
      const chunks = []; let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > (path === '/preview' ? 12 * 1024 * 1024 : 4096)) return send(413, { message: '请求过大' });
        chunks.push(chunk);
      }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return send(400, { message: '请求格式无效' }); }
      if (!body || Array.isArray(body) || typeof body !== 'object') return send(400, { message: '请求格式无效' });
      if (path === '/preview') {
        if (typeof body.base64 !== 'string' || !body.base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64) || body.base64.length % 4) return send(400, { message: '文件编码无效' });
        const bytes = Buffer.from(body.base64, 'base64');
        if (bytes.toString('base64') !== body.base64) return send(400, { message: '文件编码无效' });
        const preview = await previewBytes(bytes), id = randomUUID();
        if (disposed) return send(503, { message: '插件已卸载' });
        tasks.set(id, { bytes, preview, created: now() });
        return send(200, { id, ...preview });
      }
      const task = tasks.get(body.id);
      if (!task) return send(404, { message: '预览已过期，请重新上传' });
      if (running.has(body.id)) return send(409, { message: '任务正在查询，请稍后再操作' });
      if (path === '/discard') { tasks.delete(body.id); return send(200, { discarded: true }); }
      if (body.confirmChangeSetId !== task.preview.changeSet.changeSetId) return send(409, { message: '请确认当前预览' });
      const result = task.result ?? applyChangeSet(task.bytes, task.preview.plan, task.preview.changeSet, { confirmChangeSetId: body.confirmChangeSetId });
      tasks.set(body.id, { ...task, result });
      return send(200, { filled: result.changes.length, incomplete: result.incomplete.length, checksum: result.checksum });
    } catch (error) { return send(400, { code: error.code ?? 'FORM_FILL_ERROR', message: error.code ? error.message : '处理失败，请检查输入文件' }); }
    finally { if (reserved) inFlight--; }
  };
  return {
    handler,
    async enrich(id, provider) {
      sweep();
      const task = tasks.get(id);
      if (disposed || !task || task.result || running.has(id)) throw Error('任务不存在、已确认或正在执行');
      running.add(id);
      try {
        const preview = await previewBytes(task.bytes, { provider, confirmPaidCalls: true });
        if (disposed || tasks.get(id) !== task) throw Error('任务已过期或被替换');
        tasks.set(id, { ...task, preview, revision: (task.revision ?? 1) + 1 });
        return { taskId: id, filled: preview.changeSet.changes.length, incomplete: preview.changeSet.incomplete.length, previewPath: basePath + '/#task=' + id };
      } finally { running.delete(id); }
    },
    dispose() { if (disposed) return; disposed = true; clearInterval(timer); tasks.close(); },
  };
}
