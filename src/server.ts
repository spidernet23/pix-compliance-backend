import app from './app';
import { config } from './config/env';
import { logger } from './utils/logger';
import { db } from './database/store';

async function bootstrap() {
  // Seed database
  await db.seed();
  logger.info('Database seeded with demo users');

  const server = app.listen(config.PORT, () => {
    logger.info(`🚀 ${config.APP_NAME} v${config.APP_VERSION} running`, {
      port: config.PORT,
      env: config.NODE_ENV,
      cors: config.CORS_ORIGIN,
    });
    logger.info('Demo credentials (dev only):', {
      admin: 'roberto.silva@pixcompliance.com / Admin@2024!Secure / MFA: 000000',
      analista: 'ana.rodriguez@pixcompliance.com / Analista@2024!Secure / MFA: 000000',
      diretor: 'carlos.santos@pixcompliance.com / Diretor@2024!Secure / MFA: 000000',
      auditor: 'marcia.lima@pixcompliance.com / Auditor@2024!Secure / MFA: 000000',
    });
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { message: err.message, stack: err.stack });
    process.exit(1);
  });
}

bootstrap();
