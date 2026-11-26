import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';

export enum PageHistoryKind {
  PURCHASES = 'purchases',
  CONSUMPTION = 'consumption',
}

class PageHistoryItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() pages!: number;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
}

export class PagePurchaseHistoryItemDto extends PageHistoryItemDto {
  @ApiProperty({ enum: ['purchase'] }) kind!: 'purchase';
  @ApiProperty() productName!: string;
  @ApiProperty({ type: Number, nullable: true }) priceCents!: number | null;
  @ApiProperty({ type: String, nullable: true }) currency!: string | null;
  @ApiProperty({ type: String, format: 'date', nullable: true }) expiresOn!: string | null;
}

export class PageConsumptionHistoryItemDto extends PageHistoryItemDto {
  @ApiProperty({ enum: ['consumption'] }) kind!: 'consumption';
}

@ApiExtraModels(PagePurchaseHistoryItemDto, PageConsumptionHistoryItemDto)
export class PageHistoryDto {
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(PagePurchaseHistoryItemDto) },
        { $ref: getSchemaPath(PageConsumptionHistoryItemDto) },
      ],
      discriminator: { propertyName: 'kind' },
    },
  })
  items!: (PagePurchaseHistoryItemDto | PageConsumptionHistoryItemDto)[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true }) nextCursor!: string | null;
}
