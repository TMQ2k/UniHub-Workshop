import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { User, UserRole } from './entities/user.entity.js';

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: Record<string, jest.Mock>;
  let jwtService: { signAsync: jest.Mock; verify: jest.Mock };

  const mockUser: Partial<User> = {
    id: 'uuid-1',
    studentId: '21127001',
    fullName: 'Nguyễn Văn A',
    email: '21127001@student.hcmus.edu.vn',
    passwordHash: '', // will be set in beforeAll
    role: UserRole.STUDENT,
    isLocked: false,
    refreshTokenHash: null,
  };

  beforeAll(async () => {
    // Pre-hash password for test user
    mockUser.passwordHash = await bcrypt.hash('TestPass@123', 10);
  });

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal?: string) => {
              const map: Record<string, string> = {
                JWT_ACCESS_SECRET: 'test-access-secret',
                JWT_REFRESH_SECRET: 'test-refresh-secret',
                JWT_ACCESS_EXPIRES_IN: '15m',
                JWT_REFRESH_EXPIRES_IN: '7d',
              };
              return map[key] ?? defaultVal;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── Login ───────────────────────────────────────────────

  describe('login', () => {
    it('should return tokens and user on valid credentials', async () => {
      userRepo.findOne.mockResolvedValue({ ...mockUser });

      const result = await service.login({
        studentId: '21127001',
        password: 'TestPass@123',
      });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.studentId).toBe('21127001');
      expect(result.user.role).toBe(UserRole.STUDENT);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.login({ studentId: 'INVALID', password: 'any' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      userRepo.findOne.mockResolvedValue({ ...mockUser });

      await expect(
        service.login({ studentId: '21127001', password: 'WrongPass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException for locked account', async () => {
      userRepo.findOne.mockResolvedValue({ ...mockUser, isLocked: true });

      await expect(
        service.login({ studentId: '21127001', password: 'TestPass@123' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Refresh ─────────────────────────────────────────────

  describe('refresh', () => {
    it('should throw UnauthorizedException for invalid refresh token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      await expect(
        service.refresh({ refreshToken: 'bad-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── Logout ──────────────────────────────────────────────

  describe('logout', () => {
    it('should clear refreshTokenHash', async () => {
      await service.logout('uuid-1');

      expect(userRepo.update).toHaveBeenCalledWith('uuid-1', {
        refreshTokenHash: null,
      });
    });
  });

  // ── Profile ─────────────────────────────────────────────

  describe('getProfile', () => {
    it('should return user profile for valid userId', async () => {
      userRepo.findOne.mockResolvedValue({ ...mockUser });

      const profile = await service.getProfile('uuid-1');

      expect(profile.id).toBe('uuid-1');
      expect(profile.email).toBe('21127001@student.hcmus.edu.vn');
    });

    it('should throw for non-existent user', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.getProfile('non-existent')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── Static hashPassword ─────────────────────────────────

  describe('hashPassword', () => {
    it('should produce a valid bcrypt hash', async () => {
      const hash = await AuthService.hashPassword('SomePass');
      const valid = await bcrypt.compare('SomePass', hash);
      expect(valid).toBe(true);
    });
  });
});
