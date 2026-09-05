import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Comprobación de vida sin datos sensibles' })
  check(): { status: string } {
    return { status: 'ok' };
  }
}
