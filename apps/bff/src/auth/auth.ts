import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DEMO_PERSONAS, ROLE_PERMISSIONS } from '@pnc/shared/domain';
import type { AuthUser, LoginResponse, Permission, Role } from '@pnc/shared/domain';
import type { Request } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { APP_ENV, type Env } from '../config/env';

export const IS_PUBLIC = 'isPublic';
export const PERMISSIONS_KEY = 'permissions';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const RequirePermissions = (...p: Permission[]) => SetMetadata(PERMISSIONS_KEY, p);
export type AuthedRequest = Request & { user?: AuthUser; correlationId?: string };

@Injectable()
export class AuthService {
  private readonly key: Uint8Array;
  constructor(@Inject(APP_ENV) private readonly env: Env) {
    this.key = new TextEncoder().encode(env.JWT_SECRET);
  }

  async demoLogin(sub: string): Promise<LoginResponse> {
    if (this.env.AUTH_MODE !== 'demo') throw new ForbiddenException('Demo login is disabled');
    const user = DEMO_PERSONAS.find((p) => p.sub === sub);
    if (!user) throw new UnauthorizedException('Unknown persona');
    const accessToken = await new SignJWT({ name: user.name, role: user.role })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.sub)
      .setIssuer(this.env.JWT_ISSUER)
      .setAudience(this.env.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.env.JWT_TTL_SEC}s`)
      .sign(this.key);
    return { accessToken, expiresIn: this.env.JWT_TTL_SEC, user };
  }

  /** Permissions are derived server-side from the role claim; token-supplied permission lists are never trusted. */
  async verify(token: string): Promise<AuthUser> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: this.env.JWT_ISSUER,
        audience: this.env.JWT_AUDIENCE,
        algorithms: ['HS256'],
      });
      const role = payload['role'] as Role;
      if (!(role in ROLE_PERMISSIONS) || !payload.sub) throw new Error('bad claims');
      return { sub: payload.sub, name: String(payload['name'] ?? payload.sub), role, permissions: [...ROLE_PERMISSIONS[role]] };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

/** Deny-by-default: every route requires a valid token unless explicitly marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Missing bearer token');
    req.user = await this.auth.verify(token);
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, targets) ?? [];
    const missing = required.filter((p) => !req.user!.permissions.includes(p));
    if (missing.length) throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
    return true;
  }
}
