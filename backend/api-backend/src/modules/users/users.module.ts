import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { StatementsModule } from '../statements/statements.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // `StatementsModule` aporta el borrado de documentos: eliminar una cuenta borra
  // también los suyos, con la misma rutina que aplica el cupo.
  imports: [AuthModule, StatementsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
