import app from './app';
import { config } from './config/env';
import { logger } from './utils/logger';
import { seedIfEmpty } from './database/store';

async function bootstrap() {
  await seedIfEmpty();

  const server = app.listen(config.PORT, () => {
    logger.info(`🚀 ${config.APP_NAME} v${config.APP_VERSION} running`, {
      port: config.PORT,
      env: config.NODE_ENV,
      cors: config.CORS_ORIGIN,
      persistence: 'data/*.json (atomic file-based)',
    });
    if (config.NODE_ENV === 'development') {
      logger.info('Dev credentials', {
        admin:    'roberto.silva@pixcompliance.com / Admin@2024!Secure / MFA: 000000',
        analista: 'ana.rodriguez@pixcompliance.com / Analista@2024!Secure / MFA: 000000',
        diretor:  'carlos.santos@pixcompliance.com / Diretor@2024!Secure / MFA: 000000',
        auditor:  'marcia.lima@pixcompliance.com / Auditor@2024!Secure / MFA: 000000',
      });
    }
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received — graceful shutdown`);
    server.close(() => { logger.info('HTTP server closed'); process.exit(0); });
    setTimeout(() => { logger.error('Forced shutdown after 10s'); process.exit(1); }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('unhandledRejection', (r) => logger.error('Unhandled rejection', { reason: r }));
  process.on('uncaughtException',  (e) => { logger.error('Uncaught exception', { message: e.message }); process.exit(1); });
}

bootstrap();
