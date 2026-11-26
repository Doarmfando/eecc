import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CommercialController } from './commercial.controller';
import { CommercialService } from './commercial.service';
import { PersonalController } from './personal.controller';
import { PersonalService } from './personal.service';
import { CommercialReportController } from './report.controller';
import { CommercialReportService } from './report.service';

/** Catálogo y cotización de los productos de saldo de ATLAS (ADR-0019). */
@Module({
  imports: [AuthModule],
  controllers: [CommercialController, PersonalController, CommercialReportController],
  providers: [CommercialService, PersonalService, CommercialReportService],
  exports: [CommercialService],
})
export class CommercialModule {}
