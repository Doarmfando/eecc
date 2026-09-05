import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { isMemoryMode } from '../../common/persistence/persistence-mode';
import type { AppConfig } from '../../config/app-config';
import { EphemeralArtifactDownloadService } from '../ephemeral/ephemeral-artifact-download.service';
import { EphemeralJobsService } from '../ephemeral/ephemeral-jobs.service';
import { ArtifactDownloadService } from '../statements/artifact-download.service';
import {
  ARTIFACT_DOWNLOADER,
  JOB_READER,
  type ArtifactDownloader,
  type JobReader,
} from '../statements/statements.port';
import { StorageModule } from '../storage/storage.module';
import { WorkerClientModule } from '../worker-client/worker-client.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [StorageModule, WorkerClientModule],
  controllers: [JobsController],
  providers: [
    JobsService,
    ArtifactDownloadService,
    {
      provide: JOB_READER,
      useFactory: (
        config: ConfigService<AppConfig, true>,
        database: JobsService,
        memory: EphemeralJobsService,
      ): JobReader => (isMemoryMode(config) ? memory : database),
      inject: [ConfigService, JobsService, EphemeralJobsService],
    },
    {
      provide: ARTIFACT_DOWNLOADER,
      useFactory: (
        config: ConfigService<AppConfig, true>,
        database: ArtifactDownloadService,
        memory: EphemeralArtifactDownloadService,
      ): ArtifactDownloader => (isMemoryMode(config) ? memory : database),
      inject: [ConfigService, ArtifactDownloadService, EphemeralArtifactDownloadService],
    },
  ],
})
export class JobsModule {}
