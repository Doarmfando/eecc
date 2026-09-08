import { Module } from '@nestjs/common';

import { ArtifactDownloadService } from '../statements/artifact-download.service';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { WorkerClientModule } from '../worker-client/worker-client.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [AuthModule, StorageModule, WorkerClientModule],
  controllers: [JobsController],
  providers: [JobsService, ArtifactDownloadService],
})
export class JobsModule {}
