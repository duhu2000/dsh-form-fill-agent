import { createFormFillHandler } from './http.js';
import { createQccProvider, REGISTRATION_TOOL } from 'qcc-form-fill-provider';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
export { previewBytes, previewFile, writeCopy } from './workflow.js';
export const name = 'form-fill-agent';
export const inject = [];
export function apply(ctx, config = {}) {
  ctx.inject(['webServer'], scope => {
    const taskDirectory = config.taskDirectory ?? (process.env.DSH_HOME ? join(process.env.DSH_HOME, 'form-fill-tasks') : undefined);
    const service = createFormFillHandler({ basePath: '/form-fill', getPort: () => scope.webServer.port, taskDirectory, ttlMs: 86400000 });
    scope.inject?.(['tools'], toolScope => {
      const tools = toolScope.tools;
      const disposeTool = tools.register({
        name: 'form_fill_enrich',
        description: 'Use QCC to fill an uploaded AI填表 task. Invoke only when the user requests QCC enrichment. Returns counts and a preview link; the user confirms cell changes in the workbench.',
        parameters: { type: 'object', additionalProperties: false, properties: { taskId: { type: 'string' } }, required: ['taskId'] },
        output: {
          schema: { type: 'object', properties: { taskId: { type: 'string' }, filled: { type: 'integer' }, incomplete: { type: 'integer' }, previewPath: { type: 'string' } }, required: ['taskId','filled','incomplete','previewPath'] },
          render: (_args, value) => [{ type: 'text', text: 'AI填表：可填写 ' + value.filled + ' 格，未完成 ' + value.incomplete + ' 项。预览：' + value.previewPath }],
        },
        async execute(args, execution) {
          if (!execution?.agent || !execution?.token) throw Error('需要 Agent-owned 工具执行上下文');
          const provider = createQccProvider({ callTool: async (name, arguments_, { signal }) => {
            if (name !== REGISTRATION_TOOL) throw Error('不支持的 QCC 工具');
            const names = ['mcp__qcc-company__', 'mcp__company__', 'mcp__qcc_company__'].map(prefix => prefix + name);
            const selected = names.find(candidate => tools.get(candidate));
            if (!selected) throw Error('请先连接企查查企业数据 MCP');
            const result = await tools.execute({ name: selected, arguments: arguments_, signal, callId: randomUUID(), rootCallId: execution.rootCallId, parent: execution.token, agent: execution.agent });
            return result?.isError ? { isError: true } : result?.value;
          } });
          return service.enrich(args.taskId, provider);
        },
      });
      toolScope.effect?.(() => () => disposeTool?.());
    });
    const disposeRoute = scope.webServer.register({ kind: 'prefix', path: '/form-fill', handler: service.handler });
    ctx.effect(() => () => { disposeRoute?.(); service.dispose(); });
  });
}
