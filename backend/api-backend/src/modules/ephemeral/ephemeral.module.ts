import { Global, Module } from '@nestjs/common';

import { WorkerClientModule } from '../worker-client/worker-client.module';

import { EphemeralArtifactDownloadService } from './ephemeral-artifact-download.service';
import { EphemeralJobStore } from './ephemeral-job.store';
import { EphemeralJobsService } from './ephemeral-jobs.service';
import { EphemeralStatementsService } from './ephemeral-statements.service';

/**
 * Implementaciones que no guardan nada fuera del proceso.
 *
 * Se registran siempre, pero solo se inyectan cuando `PERSISTENCE_MODE=memory`;
 * en modo base de datos quedan construidas y sin usar. Es global porque el
 * almacén tiene que ser el mismo objeto para quien escribe (statements) y para
 * quien lee (jobs y descargas), que viven en módulos distintos.
 */
@Global()
@Module({
  imports: [WorkerClientModule],
  providers: [
    EphemeralJobStore,
    EphemeralStatementsService,
    EphemeralJobsService,
    EphemeralArtifactDownloadService,
  ],
  exports: [
    EphemeralJobStore,
    EphemeralStatementsService,
    EphemeralJobsService,
    EphemeralArtifactDownloadService,
  ],
})
export class EphemeralModule {}
