import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createFormFillHandler } from 'dsh-form-fill-agent/http';
export function createDemoServer(options = {}) {
  let server;
  const service = createFormFillHandler({ ...options, getPort: () => server.address()?.port });
  server = createServer(service.handler);
  server.on('close', service.dispose);
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.FORM_FILL_PORT ?? 43260);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 43120) throw new Error('请选择隔离端口，禁止 43120');
  const server = createDemoServer({ taskDirectory: process.env.FORM_FILL_TASK_DIRECTORY });
  server.listen(port, '127.0.0.1', () => console.log('AI填表本地演示：http://127.0.0.1:' + port + ' · mock only'));
}
