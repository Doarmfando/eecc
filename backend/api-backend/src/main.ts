import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { AppModule } from './app.module';
import { SanitizedExceptionFilter } from './common/http/sanitized-exception.filter';
import { crearFallbackDeAplicacion } from './common/http/spa-fallback';
import { parseCorsOrigins, type AppConfig } from './config/app-config';

/** Escuchar en todas las interfaces: en un contenedor, `localhost` no llega desde fuera. */
const INTERFAZ = '0.0.0.0';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService<AppConfig, true>);
  const logger = new Logger('bootstrap');

  // Detrás de un proxy (Railway, Nginx) la IP y el protocolo reales llegan en
  // cabeceras. Sin esto, todo parece venir del propio proxy por HTTP.
  app.set('trust proxy', 1);

  const corsOrigins = parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true }));
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      methods: ['GET', 'POST'],
      allowedHeaders: ['content-type', 'x-api-key', 'idempotency-key', 'x-request-id'],
      exposedHeaders: ['x-request-id'],
      // La sesión viaja en cookie: sin esto el navegador no la enviaría entre orígenes.
      credentials: true,
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

  // El frontend se registra antes que el enrutador de Nest. No puede ir después:
  // Nest atiende él mismo las rutas que no reconoce y devuelve un 404, así que un
  // middleware posterior nunca llegaría a ejecutarse.
  //
  // El orden dentro de esta función importa: primero los archivos reales, luego el
  // respaldo que entrega la página. Y ese respaldo ya descarta `/v1`, `/health`,
  // `/docs` y cualquier ruta con extensión, que son las que sí debe ver Nest.
  registrarFrontend(app, config.get('STATIC_ROOT', { infer: true }), logger);

  const port = config.get('PORT', { infer: true });
  await app.listen(port, INTERFAZ);
  logger.log(`API escuchando en ${INTERFAZ}:${String(port)}`);
}

/** Sirve el frontend compilado, si `STATIC_ROOT` apunta a uno. */
function registrarFrontend(
  app: NestExpressApplication,
  raizConfigurada: string,
  logger: Logger,
): void {
  if (!raizConfigurada) {
    return;
  }

  const raiz = resolve(raizConfigurada);
  const index = join(raiz, 'index.html');
  if (!existsSync(index)) {
    // Se avisa y se sigue: la API sin frontend es útil, y un despliegue a medias
    // debe notarse en el registro y no en una página en blanco.
    logger.warn(`STATIC_ROOT apunta a ${raiz}, pero no hay index.html; no se sirve el frontend`);
    return;
  }

  // `index: false` porque de la raíz se encarga el respaldo, que además cubre
  // `/personas` y las demás rutas que solo existen en el navegador.
  app.useStaticAssets(raiz, { index: false });
  app.use(crearFallbackDeAplicacion(index));
  logger.log(`Frontend servido desde ${raiz}`);
}

void bootstrap();
