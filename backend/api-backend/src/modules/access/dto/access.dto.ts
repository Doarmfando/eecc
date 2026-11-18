import { ApiProperty } from '@nestjs/swagger';

export class PlanDto {
  @ApiProperty({ example: 'ATLAS' }) code!: string;
  @ApiProperty({ example: 'Atlas' }) name!: string;
  @ApiProperty() description!: string;

  @ApiProperty({ description: 'Documentos que conserva cada persona antes de reemplazar uno' })
  maxRetainedStatements!: number;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Tope técnico de seguridad por PDF; nulo es sin tope',
  })
  maxPagesPerDocument!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Páginas acumuladas al mes que decide el cobro; nulo es sin tope fijo, se cotiza',
  })
  monthlyPageQuota!: number | null;

  @ApiProperty({ description: 'La prueba se consume una sola vez y no se renueva cada mes' })
  trialOneTime!: boolean;

  @ApiProperty({ type: [String], example: ['HISTORY', 'FINANCIAL_CENTER', 'FINANCIAL_CALENDAR'] })
  features!: string[];

  @ApiProperty({ description: 'Plan de las cuentas nuevas si no se indica otro' })
  isDefault!: boolean;
}

export class RoleDto {
  @ApiProperty({ example: 'MEMBER' }) code!: string;
  @ApiProperty({ example: 'Usuario' }) name!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ description: 'Jerarquía: solo se gestionan cuentas de rango inferior' })
  rank!: number;
  @ApiProperty({ nullable: true, type: String, description: 'Plan que se propone con este rol' })
  defaultPlanCode!: string | null;
  @ApiProperty({ description: 'Si su membresía lleva fecha de vencimiento' })
  planExpiryRequired!: boolean;
  @ApiProperty({ type: [String], example: ['STATEMENTS_CONVERT'] }) permissions!: string[];
}

export class SupportContactDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Teléfono de soporte; nulo si no está configurado',
  })
  phone!: string | null;
}
