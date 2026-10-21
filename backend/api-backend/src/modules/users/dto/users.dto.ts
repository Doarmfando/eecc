import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MembershipStatus } from '@prisma/client';
import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  PLAN,
  PLAN_CODE_PATTERN,
  ROLE_CODE_PATTERN,
  SYSTEM_ROLE,
} from '../../access/access-catalog';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../../auth/password-hash';
import { MEMBER_ACTIONS, type MemberAction } from '../member-rules';

// Ejemplos para la documentación. Los valores válidos son los del catálogo de la
// base (`GET /v1/roles` y `GET /v1/plans`): aquí solo se valida el formato.
const ROLES = [SYSTEM_ROLE.ADMIN, SYSTEM_ROLE.MEMBER];
const PLANES = [PLAN.BASICA, PLAN.ATLAS];

/** Recorta antes de validar: un nombre de solo espacios no debe pasar por válido. */
function recortar({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateMemberDto {
  @ApiProperty({ example: 'persona@empresa.pe' })
  @Transform(recortar)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: 'Nombre Apellido' })
  @Transform(recortar)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  displayName!: string;

  @ApiProperty({
    example: SYSTEM_ROLE.MEMBER,
    description: `Código de rol, p. ej. ${ROLES.join(', ')}`,
  })
  @IsString()
  @Matches(ROLE_CODE_PATTERN)
  role: string = SYSTEM_ROLE.MEMBER;

  @ApiPropertyOptional({
    example: PLAN.BASICA,
    description: `Membresía, p. ej. ${PLANES.join(', ')}. Sin indicarla, la predeterminada.`,
  })
  @IsOptional()
  @IsString()
  @Matches(PLAN_CODE_PATTERN)
  planCode?: string;

  @ApiPropertyOptional({
    minLength: MIN_PASSWORD_LENGTH,
    description: 'Si se omite, se genera una contraseña temporal y se devuelve una sola vez.',
  })
  @IsOptional()
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password?: string;
}

export class UpdateMemberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(recortar)
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({
    example: SYSTEM_ROLE.ADMIN,
    description: 'Código de rol. Un administrador no se puede degradar.',
  })
  @IsOptional()
  @IsString()
  @Matches(ROLE_CODE_PATTERN)
  role?: string;

  @ApiPropertyOptional({
    example: PLAN.ATLAS,
    description: 'Membresía. También se puede cambiar la propia.',
  })
  @IsOptional()
  @IsString()
  @Matches(PLAN_CODE_PATTERN)
  planCode?: string;

  @ApiPropertyOptional({ enum: [MembershipStatus.ACTIVE, MembershipStatus.REVOKED] })
  @IsOptional()
  @IsEnum(MembershipStatus)
  membershipStatus?: MembershipStatus;
}

export class SetPasswordDto {
  @ApiPropertyOptional({
    minLength: MIN_PASSWORD_LENGTH,
    description: 'Si se omite, se genera una contraseña temporal y se devuelve una sola vez.',
  })
  @IsOptional()
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password?: string;
}

export class MemberDto {
  @ApiProperty() userId!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ example: SYSTEM_ROLE.MEMBER }) role!: string;
  @ApiProperty({ example: 'Usuario' }) roleName!: string;
  @ApiProperty({ description: 'Rango del rol en la jerarquía' }) roleRank!: number;
  @ApiProperty({ example: PLAN.BASICA }) planCode!: string;
  @ApiProperty({ example: 'Básica' }) planName!: string;
  @ApiProperty({ description: 'Documentos que conserva según su membresía' })
  maxRetainedStatements!: number;
  @ApiProperty({ nullable: true, type: Number, description: 'Páginas por PDF; nulo es sin límite' })
  maxPagesPerDocument!: number | null;
  @ApiProperty({ description: 'Desde cuándo tiene la membresía actual' })
  planChangedAt!: string;
  @ApiProperty() status!: string;
  @ApiProperty() membershipStatus!: string;
  @ApiProperty({ description: 'Documentos que conserva en la organización' })
  documentCount!: number;
  @ApiProperty({ nullable: true }) lastLoginAt!: string | null;
  @ApiProperty() createdAt!: string;

  @ApiProperty({
    type: [String],
    enum: MEMBER_ACTIONS,
    description: 'Lo que quien consulta puede hacer con esta cuenta según los rangos',
  })
  actions!: MemberAction[];
}

export class CreatedMemberDto {
  @ApiProperty({ type: MemberDto }) member!: MemberDto;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Contraseña generada, mostrada una sola vez. Nula si se indicó una o si la persona ya existía.',
  })
  temporaryPassword!: string | null;
}

export class TemporaryPasswordDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Contraseña generada, mostrada una sola vez. Nula si se indicó una.',
  })
  temporaryPassword!: string | null;
}
