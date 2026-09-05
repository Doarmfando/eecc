import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';

import { isMemoryMode } from '../../common/persistence/persistence-mode';
import type { AppConfig } from '../../config/app-config';
import { EphemeralStatementsService } from '../ephemeral/ephemeral-statements.service';
import { StorageModule } from '../storage/storage.module';
import { WorkerClientModule } from '../worker-client/worker-client.module';
import { StatementsController } from './statements.controller';
import { StatementsService } from './statements.service';
import { STATEMENT_PROCESSOR, type StatementProcessor } from './statements.port';

@Module({
  imports: [
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
  providers: [
    StatementsService,
    {
      provide: STATEMENT_PROCESSOR,
      useFactory: (
        config: ConfigService<AppConfig, true>,
        database: StatementsService,
        memory: EphemeralStatementsService,
      ): StatementProcessor => (isMemoryMode(config) ? memory : database),
      inject: [ConfigService, StatementsService, EphemeralStatementsService],
    },
  ],
  exports: [StatementsService, STATEMENT_PROCESSOR],
})
export class StatementsModule {}
