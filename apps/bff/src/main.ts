import 'reflect-metadata';
import { createApp } from './create-app';

async function bootstrap(): Promise<void> {
  const { app, env } = await createApp();
  const server = await app.listen(env.PORT, '0.0.0.0');
  server.keepAliveTimeout = 65_000; // > typical LB idle timeout (60s) to avoid 502s on reused connections
  server.headersTimeout = 66_000;
  process.stdout.write(
    `${JSON.stringify({ time: new Date().toISOString(), severity: 'INFO', msg: 'bff listening', port: env.PORT, auth: env.AUTH_MODE, dataset: env.DATASET_SIZE })}\n`,
  );
}

bootstrap().catch((err: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ severity: 'CRITICAL', msg: 'startup failed', err: err instanceof Error ? err.message : String(err) })}\n`,
  );
  process.exit(1);
});
