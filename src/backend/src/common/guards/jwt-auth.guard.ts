import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that requires a valid JWT access token.
 * Attach to any endpoint that requires authentication.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
