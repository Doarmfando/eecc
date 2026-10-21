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

/** La membresía de quien tiene la sesión: lo que la interfaz necesita para decidir. */
export class SessionPlanDto {
  @ApiProperty({ example: 'BASICA' }) code!: string;
  @ApiProperty({ example: 'Básica' }) name!: string;
  @ApiProperty() maxRetainedStatements!: number;
  @ApiProperty({ nullable: true, type: Number, description: 'Páginas por PDF; nulo es sin límite' })
  maxPagesPerDocument!: number | null;
  @ApiProperty({ type: [String], example: ['HISTORY'] }) features!: string[];

  @ApiProperty({
    nullable: true,
    type: String,
    example: '2026-11-20',
    description: 'Último día de vigencia en la zona del negocio; nulo si no vence',
  })
  expiresOn!: string | null;

  @ApiProperty({ description: 'Ya venció: no puede convertir hasta que la renueven' })
  expired!: boolean;
}

export class SessionUserDto {
  @ApiProperty() userId!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() organizationName!: string;
  @ApiProperty({ example: 'MEMBER', description: 'Código del rol en el catálogo' })
  role!: string;
  @ApiProperty({ example: 'Usuario' }) roleName!: string;
  @ApiProperty({ description: 'Rango del rol en la jerarquía' }) roleRank!: number;

  /** Lo que el rol permite administrar. La interfaz decide con esto, no con el rol. */
  @ApiProperty({ type: [String], example: ['STATEMENTS_CONVERT'] })
  permissions!: string[];

  /** Membresía: vistas habilitadas y límites de documentos y páginas. */
  @ApiProperty({ type: () => SessionPlanDto })
  plan!: SessionPlanDto;

  /**
   * Documentos que conserva esta persona: el cupo de su membresía. Va aquí, y no
   * en una ruta aparte, para que la interfaz pueda advertirlo sin una petición más:
   * si no lo supiera, alguien perdería un documento sin haber sido avisado.
   */
  @ApiProperty({
    description:
      'Documentos que conserva antes de reemplazar uno (igual a plan.maxRetainedStatements)',
  })
  retainedStatementsPerUser!: number;

  /**
   * Teléfono de soporte para los avisos de error. Va en la sesión para no pedirlo
   * aparte; sin sesión está en `GET /v1/support`.
   */
  @ApiProperty({ nullable: true, type: String }) supportPhone!: string | null;

  /** Dominios de correo admitidos en las altas. Vacío: cualquiera. */
  @ApiProperty({ type: [String], example: ['hotmail.com', 'empresa.pe', 'eecc.local'] })
  allowedEmailDomains!: string[];
}
