import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/app-config';
import { AuthModule } from '../auth/auth.module';
import { CommercialModule } from '../commercial/commercial.module';
import { StorageModule } from '../storage/storage.module';
import { WorkerClientModule } from '../worker-client/worker-client.module';
import { StatementRetentionService } from './statement-retention.service';
import { StatementUsageService } from './statement-usage.service';
import { StatementsController } from './statements.controller';
import { StatementsService } from './statements.service';

@Module({
  imports: [
    AuthModule,
    // Una compra registrada copia precio y vigencia del catálogo comercial (ADR-0019).
    CommercialModule,
    StorageModule,
    WorkerClientModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        limits: {
          fileSize: config.get('MAX_UPLOAD_BYTES', { infer: true }),
          files: 1,
        },
      }),
    }),
  ],
  controllers: [StatementsController],
  providers: [StatementsService, StatementRetentionService, StatementUsageService],
  exports: [StatementsService, StatementRetentionService, StatementUsageService],
})
export class StatementsModule {}
