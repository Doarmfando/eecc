import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../../auth/password-hash';

const ROLES = [MembershipRole.ADMIN, MembershipRole.MEMBER];

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

  @ApiProperty({ enum: ROLES, default: MembershipRole.MEMBER })
  @IsEnum(MembershipRole)
  role: MembershipRole = MembershipRole.MEMBER;

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
    enum: ROLES,
    description: 'Un administrador no se puede degradar.',
  })
  @IsOptional()
  @IsEnum(MembershipRole)
  role?: MembershipRole;

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
  @ApiProperty({ enum: ROLES }) role!: string;
  @ApiProperty() status!: string;
  @ApiProperty() membershipStatus!: string;
  @ApiProperty({ description: 'Documentos que conserva en la organización' })
  documentCount!: number;
  @ApiProperty({ nullable: true }) lastLoginAt!: string | null;
  @ApiProperty() createdAt!: string;
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
