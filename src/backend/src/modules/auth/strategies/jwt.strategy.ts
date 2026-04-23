import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  role: string;
}

/**
 * Passport strategy that validates JWT access tokens.
 * Extracts token from Authorization: Bearer header.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET', 'dev_access_secret'),
    });
  }

  /**
   * Called after JWT is verified. The returned object is attached to request.user.
   */
  validate(payload: JwtPayload): { userId: string; role: string } {
    return { userId: payload.sub, role: payload.role };
  }
}
