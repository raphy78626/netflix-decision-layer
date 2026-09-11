import { startStaticServer } from './server';

export default async function globalSetup(): Promise<void> {
  const server = await startStaticServer(0);
  process.env.NDL_E2E_PORT = String(server.port);
  // Persist for workers via a file-scope variable; close on exit.
  (globalThis as unknown as { __ndlServer?: { close: () => Promise<void> } }).__ndlServer = server;
  process.on('exit', () => {
    void server.close();
  });
}
