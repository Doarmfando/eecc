import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../password-hash';

export class LoginDto {
  @ApiProperty({ example: 'persona@empresa.pe' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  // No se exige longitud mínima al entrar: hacerlo delataría el formato aceptado y
  // convertiría un error de validación en información útil para quien lo intente.
  @ApiProperty()
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  currentPassword!: string;

  @ApiProperty({ minLength: MIN_PASSWORD_LENGTH })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  newPassword!: string;
}

export class SessionUserDto {
  @ApiProperty() userId!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() organizationName!: string;
  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] }) role!: string;

  /**
   * Documentos que conserva cada persona. Va aquí, y no en una ruta aparte, para
   * que la interfaz pueda advertirlo sin una petición más: si no lo supiera,
   * alguien perdería su documento más antiguo sin haber sido avisado.
   */
  @ApiProperty({
    description: 'Documentos que conserva cada persona antes de borrar el más antiguo',
  })
  retainedStatementsPerUser!: number;
}
