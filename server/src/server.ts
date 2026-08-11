import http from 'http';
import { createApp } from './app';
import { connectDB, disconnectDB } from './config/db';
import { env, isProduction } from './config/env';
import { createSocketServer } from './sockets';
import { flushAllDocs } from './sockets/docStore';

async function bootstrap() {
  await connectDB();

  const app = createApp();
  // Express and Socket.IO share one HTTP server, so one port and one origin.
  const httpServer = http.createServer(app);
  const io = createSocketServer(httpServer);

  httpServer.listen(env.PORT, () => {
    // In production the public URL belongs to the platform, so only the bound
    // port is logged; locally the clickable URL is genuinely useful.
    const where = isProduction ? `port ${env.PORT}` : `http://localhost:${env.PORT}`;
    console.log(`[server] listening on ${where} (${env.NODE_ENV})`);
    console.log(`[server] accepting client origin ${env.CLIENT_URL}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[server] ${signal} received, shutting down`);
    io.close();
    httpServer.close();
    await flushAllDocs();
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});
