import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { SanitizedExceptionFilter } from './common/http/sanitized-exception.filter';
import { parseCorsOrigins, type AppConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService<AppConfig, true>);

  const corsOrigins = parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true }));
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      methods: ['GET', 'POST'],
      allowedHeaders: ['content-type', 'x-api-key', 'idempotency-key', 'x-request-id'],
      exposedHeaders: ['x-request-id'],
      credentials: false,
      maxAge: 600,
    });
  }

  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new SanitizedExceptionFilter());

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('EECC API')
      .setDescription('Conversor de estados de cuenta bancarios')
      .setVersion('0.1.0')
      .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'apiKey')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  new Logger('bootstrap').log(`API escuchando en el puerto ${String(port)}`);
}

void bootstrap();
