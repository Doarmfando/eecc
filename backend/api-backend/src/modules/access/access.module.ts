import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AccessController } from './access.controller';
import { AccessService } from './access.service';

/** Catálogo de roles y membresías, y el contacto de soporte (ADR-0016). */
@Module({
  imports: [AuthModule],
  controllers: [AccessController],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
