import { createFormFillHandler } from './http.js';
import { createCatalogProvider, CATALOG_TOOL_DOMAINS, runtimeToolNames, REGISTRATION_TOOL, ENTITY_TOOL } from 'qcc-form-fill-provider';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { renderEnrichmentResult } from './diagnostics.js';
export { previewBytes, previewFile, writeCopy } from './workflow.js';
export const name = 'form-fill-agent';
export const inject = [];
export function apply(ctx, config = {}) {
  ctx.inject(['webServer'], scope => {
    let toolService;
    const taskDirectory = config.taskDirectory ?? (process.env.DSH_HOME ? join(process.env.DSH_HOME, 'form-fill-tasks') : undefined);
    const service = createFormFillHandler({ basePath: '/form-fill', getPort: () => scope.webServer.port, taskDirectory, ttlMs: 86400000, getQccStatus: () => ['mcp__qcc-company__','mcp__company__','mcp__qcc_company__'].some(p => toolService?.get?.(p + REGISTRATION_TOOL)) });
    scope.inject?.(['tools'], toolScope => {
      const tools = toolScope.tools;
      toolService = tools;
      const disposeTool = tools.register({
        name: 'form_fill_enrich',
        description: 'Use QCC to fill an uploaded AI填表 task. Invoke only when the user requests QCC enrichment. Returns counts and a preview link; the user confirms cell changes in the workbench.',
        parameters: { type: 'object', additionalProperties: false, properties: { taskId: { type: 'string' }, expectedRevision: { type: 'integer' }, mode:{type:'string',enum:['all','retry']} }, required: ['taskId'] },
        output: {
          schema: { type: 'object', properties: { taskId: { type: 'string' }, filled: { type: 'integer' }, incomplete: { type: 'integer' }, diagnostics:{type:'object'}, previewPath: { type: 'string' } }, required: ['taskId','filled','incomplete','previewPath'] },
          render: (_args, value) => [{ type: 'text', text: renderEnrichmentResult(value) }],
        },
        async execute(args, execution) {
          if (!execution?.agent || !execution?.token) throw Error('需要 Agent-owned 工具执行上下文');
          const provider = createCatalogProvider({ availableTools:Object.keys(CATALOG_TOOL_DOMAINS).filter(name=>runtimeToolNames(name).some(n=>tools.get(n))), enableEntitySearch: ['mcp__qcc-company__','mcp__company__','mcp__qcc_company__'].some(p=>tools.get(p+ENTITY_TOOL)), callTool: async (name, arguments_, { signal }) => {
            if (!Object.hasOwn(CATALOG_TOOL_DOMAINS,name)) throw Error('不支持的 QCC 工具');
            const names = runtimeToolNames(name);
            const selected = names.find(candidate => tools.get(candidate));
            if (!selected) throw Error('请先连接企查查企业数据 MCP');
            const result = await tools.execute({ name: selected, arguments: arguments_, signal, callId: randomUUID(), rootCallId: execution.rootCallId, parent: execution.token, agent: execution.agent });
            return result?.isError ? { isError: true } : result?.value;
          } });
          return service.enrich(args.taskId, provider, args.expectedRevision,{retryOnly:args.mode==='retry'});
        },
      });
      toolScope.effect?.(() => () => disposeTool?.());
    });
    const disposeRoute = scope.webServer.register({ kind: 'prefix', path: '/form-fill', handler: service.handler });
    ctx.effect(() => () => { disposeRoute?.(); service.dispose(); });
  });
}
