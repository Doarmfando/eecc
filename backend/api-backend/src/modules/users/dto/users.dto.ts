import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const ROLES = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MEMBER,
  MembershipRole.VIEWER,
];

export class CreateMemberDto {
  @ApiProperty({ example: 'persona@empresa.pe' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: 'Nombre Apellido' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  displayName!: string;

  @ApiProperty({ enum: ROLES, default: MembershipRole.MEMBER })
  @IsEnum(MembershipRole)
  role: MembershipRole = MembershipRole.MEMBER;
}

export class UpdateMemberDto {
  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsEnum(MembershipRole)
  role?: MembershipRole;

  @ApiPropertyOptional({ enum: [MembershipStatus.ACTIVE, MembershipStatus.REVOKED] })
  @IsOptional()
  @IsEnum(MembershipStatus)
  membershipStatus?: MembershipStatus;
}

export class MemberDto {
  @ApiProperty() userId!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ROLES }) role!: string;
  @ApiProperty() status!: string;
  @ApiProperty() membershipStatus!: string;
  @ApiProperty({ nullable: true }) lastLoginAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class CreatedMemberDto {
  @ApiProperty({ type: MemberDto }) member!: MemberDto;

  @ApiProperty({
    description: 'Contraseña inicial, mostrada una sola vez. Vacía si la persona ya existía.',
  })
  temporaryPassword!: string;
}

export class TemporaryPasswordDto {
  @ApiProperty() temporaryPassword!: string;
}
