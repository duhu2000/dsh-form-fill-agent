import { providerOutcome } from './provider-outcome.js';
import { createFormFillHandler } from './http.js';
import { createCatalogProvider, CATALOG_TOOL_DOMAINS, runtimeToolNames, REGISTRATION_TOOL, ENTITY_TOOL } from 'qcc-form-fill-provider';
import { randomUUID } from 'node:crypto';
import { profileTaskDirectory } from './profile-storage.js';
import { renderEnrichmentResult } from './diagnostics.js';
export { previewBytes, previewFile, writeCopy } from './workflow.js';
export const name = 'form-fill-agent';
export const inject = [];
export const INITIAL_GUIDANCE_POLICY = 'AI填表业务边界：仅支持上传的 Excel 模板，按用户明确的主体定位列补充已确认字段；只填空白，保留公式和格式，生成新文件。首页初始引导是示例，不是已上传文件、已识别列或查询授权。若用户直接发送引导、仍含未补全的【】占位符、未上传 Excel 或未说明主体定位列，请用中文先询问缺失信息，不创建任务，不调用 form_fill_enrich、Provider、MCP、OCR 或其他业务工具。已有真实任务与已保存定位映射时可沿用任务信息，不重复询问。不得宣传 Word、覆盖源模板或外部写回。';
export function initialGuidanceSection(context) {
  return context?.agent?.session?.id?.startsWith('session-dsh-form-fill-agent-') ? INITIAL_GUIDANCE_POLICY : '';
}
export function apply(ctx, config = {}) {
  ctx.inject(['systemPrompt'], scope => {
    if(typeof scope.systemPrompt?.section!=='function')return;
    const dispose = scope.systemPrompt.section({name:'dsh-form-fill-agent/initial-guidance',order:120,text:initialGuidanceSection});
    scope.effect?.(() => () => dispose?.());
  });
  ctx.inject(['webServer'], scope => {
    let toolService;
    const taskDirectory = config.taskDirectory ?? profileTaskDirectory(import.meta.url);
    const service = createFormFillHandler({ basePath: '/form-fill', getPort: () => scope.webServer.port, taskDirectory, ttlMs: 86400000, getQccStatus: () => ['mcp__qcc-company__','mcp__company__','mcp__qcc_company__'].some(p => toolService?.get?.(p + REGISTRATION_TOOL)) });
    scope.inject?.(['tools'], toolScope => {
      const tools = toolScope.tools;
      toolService = tools;
      const disposeTool = tools.register({
        name: 'form_fill_enrich',
        description: 'Use QCC to fill an uploaded AI填表 task. Invoke only for a real uploaded Excel task with a saved entity locating column and explicit user enrichment request. If these are missing or the message is an unfilled guidance/example, ask for the Excel template and locating column without calling tools. Returns counts and a preview link; the user confirms cell changes in the workbench.',
        parameters: { type: 'object', additionalProperties: false, properties: { taskId: { type: 'string' }, expectedRevision: { type: 'integer' }, mode:{type:'string',enum:['all','retry']} }, required: ['taskId'] },
        output: {
          schema: { type: 'object', properties: { taskId: { type: 'string' }, filled: { type: 'integer' }, incomplete: { type: 'integer' }, diagnostics:{type:'object'}, previewPath: { type: 'string' } }, required: ['taskId','filled','incomplete','previewPath'] },
          render: (_args, value) => [{ type: 'text', text: renderEnrichmentResult(value) }],
        },
        async execute(args, execution) {
          if (!execution?.agent || !execution?.token) throw Error('需要 Agent-owned 工具执行上下文');
          const runtimeSources=new Map();let transportOutcome;
          const provider = createCatalogProvider({ availableTools:Object.keys(CATALOG_TOOL_DOMAINS).filter(name=>runtimeToolNames(name).some(n=>tools.get(n))), enableEntitySearch: ['mcp__qcc-company__','mcp__company__','mcp__qcc_company__'].some(p=>tools.get(p+ENTITY_TOOL)), callTool: async (name, arguments_, { signal }) => {
            if (!Object.hasOwn(CATALOG_TOOL_DOMAINS,name)) throw Error('不支持的 QCC 工具');
            const names = runtimeToolNames(name);
            const selected = names.find(candidate => tools.get(candidate));
            if (!selected) throw Error('请先连接企查查企业数据 MCP');
            runtimeSources.set(name,selected);
            const result = await tools.execute({ name: selected, arguments: arguments_, signal, callId: randomUUID(), rootCallId: execution.rootCallId, parent: execution.token, agent: execution.agent });
            const raw=result?.value;const observed=providerOutcome(raw);if(observed==='no-permission')transportOutcome=observed;return result?.isError ? { isError: true } : raw;
          } });
          const lookup=provider.lookup.bind(provider);provider.lookup=async(...input)=>{transportOutcome=undefined;const result=await lookup(...input);if(transportOutcome)result.outcome=transportOutcome;for(const value of Object.values(result.values||{})){const match=/^qcc:\/\/([^/]+)\//.exec(value.source||'');if(match&&runtimeSources.has(match[1]))value.source=value.source.replace('qcc://'+match[1]+'/', 'qcc://'+runtimeSources.get(match[1])+'/')}return result};
          return service.enrich(args.taskId, provider, args.expectedRevision,{retryOnly:args.mode==='retry',sessionId:execution.agent.session?.id});
        },
      });
      toolScope.effect?.(() => () => disposeTool?.());
    });
    const disposeRoute = scope.webServer.register({ kind: 'prefix', path: '/form-fill', handler: service.handler });
    ctx.effect(() => () => { disposeRoute?.(); service.dispose(); });
  });
}
