import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RequestIdMiddleware } from './common/http/request-id.middleware';
import { PrismaModule } from './common/prisma/prisma.module';
import { ApiKeyGuard } from './common/security/api-key.guard';
import { validateConfig } from './config/app-config';
import { EphemeralModule } from './modules/ephemeral/ephemeral.module';
import { HealthModule } from './modules/health/health.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { StatementsModule } from './modules/statements/statements.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateConfig,
    }),
    PrismaModule,
    EphemeralModule,
    HealthModule,
    StatementsModule,
    JobsModule,
  ],
  providers: [ApiKeyGuard],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*path');
  }
}
