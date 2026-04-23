import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto, RefreshTokenDto } from './dto/index.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    const data = await this.authService.login(dto);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    const data = await this.authService.refresh(dto);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req: { user: { userId: string } }) {
    await this.authService.logout(req.user.userId);
    return {
      success: true,
      data: null,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req: { user: { userId: string } }) {
    const data = await this.authService.getProfile(req.user.userId);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
