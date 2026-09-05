import { Module } from '@nestjs/common';

import { WorkerClientService } from './worker-client.service';

@Module({
  providers: [WorkerClientService],
  exports: [WorkerClientService],
})
export class WorkerClientModule {}
