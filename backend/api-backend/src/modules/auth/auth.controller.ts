import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '../../common/http/request-context';
import type { RequestWithContext } from '../../common/http/request-context';
import { SessionGuard } from '../../common/security/session.guard';
import { NodeEnvironment, type AppConfig } from '../../config/app-config';
import { AuthService, type AuthenticatedUser } from './auth.service';
import { ChangePasswordDto, LoginDto, SessionUserDto } from './dto/auth.dto';
import { SESSION_COOKIE, buildSessionCookieOptions, readCookie } from './session-cookie';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inicia sesión y deja la cookie de sesión' })
  @ApiResponse({ status: HttpStatus.OK, type: SessionUserDto })
  async login(
    @Body() body: LoginDto,
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionUserDto> {
    const resultado = await this.auth.login(body.email, body.password, request.requestId);

    response.cookie(
      SESSION_COOKIE,
      resultado.token,
      buildSessionCookieOptions({
        secure: this.config.get('NODE_ENV', { infer: true }) === NodeEnvironment.Production,
        maxAgeMs: this.auth.sessionMaxAgeMs(),
      }),
    );

    return toSessionUser(resultado.user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cierra la sesión y borra la cookie' })
  async logout(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = readCookie(request.header('cookie'), SESSION_COOKIE);
    if (token) {
      await this.auth.logout(token);
    }
    // Se limpia la cookie aunque no hubiera sesión válida: salir siempre deja el
    // navegador en el mismo estado, sin depender de qué había antes.
    response.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'Datos de la sesión activa' })
  @ApiResponse({ status: HttpStatus.OK, type: SessionUserDto })
  me(@CurrentUser() user: AuthenticatedUser): SessionUserDto {
    return toSessionUser(user);
  }

  @Post('password')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cambia la contraseña propia y cierra las demás sesiones' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.changePassword(user.userId, body.currentPassword, body.newPassword);
    response.clearCookie(SESSION_COOKIE, { path: '/' });
  }
}

function toSessionUser(user: AuthenticatedUser): SessionUserDto {
  return {
    userId: user.userId,
    email: user.email,
    displayName: user.displayName,
    organizationId: user.organizationId,
    organizationName: user.organizationName,
    role: user.role,
  };
}
