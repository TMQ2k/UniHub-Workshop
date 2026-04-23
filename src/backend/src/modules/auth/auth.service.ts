import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from './entities/user.entity.js';
import { LoginDto, RefreshTokenDto } from './dto/index.js';

const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ──────────────────────────────────────────────────────────
  // Login
  // ──────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    // Find user by studentId — spec says login with studentId + password
    const user = await this.userRepo.findOne({
      where: { studentId: dto.studentId },
    });

    // Generic error message to prevent user enumeration
    if (!user) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Thông tin đăng nhập không đúng.',
        },
      });
    }

    if (user.isLocked) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Tài khoản đã bị khóa tạm thời.',
        },
      });
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Thông tin đăng nhập không đúng.',
        },
      });
    }

    const tokens = await this.generateTokens(user);

    // Persist hashed refresh token in DB
    await this.saveRefreshTokenHash(user.id, tokens.refreshToken);

    this.logger.log(`User ${user.studentId} logged in successfully`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        name: user.fullName,
        studentId: user.studentId,
        role: user.role,
      },
    };
  }

  // ──────────────────────────────────────────────────────────
  // Refresh
  // ──────────────────────────────────────────────────────────

  async refresh(dto: RefreshTokenDto) {
    let payload: { sub: string; role: string };

    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Refresh token không hợp lệ hoặc đã hết hạn.',
        },
      });
    }

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Refresh token không hợp lệ hoặc đã hết hạn.',
        },
      });
    }

    // Verify stored hash matches the presented refresh token
    const hash = this.hashToken(dto.refreshToken);
    if (hash !== user.refreshTokenHash) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Refresh token đã bị revoke.',
        },
      });
    }

    // Rotate tokens: new pair, revoke old
    const tokens = await this.generateTokens(user);
    await this.saveRefreshTokenHash(user.id, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // ──────────────────────────────────────────────────────────
  // Logout
  // ──────────────────────────────────────────────────────────

  async logout(userId: string): Promise<void> {
    await this.userRepo.update(userId, { refreshTokenHash: null });
    this.logger.log(`User ${userId} logged out`);
  }

  // ──────────────────────────────────────────────────────────
  // Get current user profile
  // ──────────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Người dùng không tồn tại.',
        },
      });
    }

    return {
      id: user.id,
      name: user.fullName,
      studentId: user.studentId,
      email: user.email,
      role: user.role,
    };
  }

  // ──────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────

  private async generateTokens(user: User) {
    const payload = { sub: user.id, role: user.role };

    const accessExpiresIn = this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiresIn as string | number,
      } as Parameters<JwtService['signAsync']>[1]),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpiresIn as string | number,
      } as Parameters<JwtService['signAsync']>[1]),
    ]);

    return { accessToken, refreshToken };
  }

  private async saveRefreshTokenHash(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const hash = this.hashToken(refreshToken);
    await this.userRepo.update(userId, { refreshTokenHash: hash });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Hash a plain-text password using bcrypt.
   * Used by CsvSync module when creating new student accounts.
   */
  static async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_SALT_ROUNDS);
  }
}
