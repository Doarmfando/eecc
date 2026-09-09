import { Module } from '@nestjs/common';

import { ApiKeyGuard } from '../../common/security/api-key.guard';
import { AuthGuard } from '../../common/security/auth.guard';
import { RolesGuard } from '../../common/security/roles.guard';
import { SessionGuard } from '../../common/security/session.guard';
import { AuthController } from './auth.controller';
import { BootstrapService } from './bootstrap.service';
import { AuthService } from './auth.service';

/**
 * Exporta también los guards: los módulos que protegen rutas los referencian por
 * clase y necesitan poder resolverlos desde su propio inyector.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, BootstrapService, ApiKeyGuard, AuthGuard, SessionGuard, RolesGuard],
  exports: [AuthService, ApiKeyGuard, AuthGuard, SessionGuard, RolesGuard],
})
export class AuthModule {}
