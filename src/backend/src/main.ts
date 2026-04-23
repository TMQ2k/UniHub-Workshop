import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Global validation pipe — fail fast on invalid input
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — allow web and mobile clients
  app.enableCors();

  // API prefix
  app.setGlobalPrefix('api');

  const port = config.get<number>('APP_PORT', 3000);
  await app.listen(port);
  logger.log(`🚀 UniHub Workshop API running on http://localhost:${port}/api`);
}
bootstrap();
