import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Post,
  Req,
  Res,
  UnauthorizedException,
  Body,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SetMetadata } from '@nestjs/common';
import {
  createHmac,
  scryptSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { DataSource } from 'typeorm';
import { User } from '../db/entities.js';
import { validate } from '../core/validate.js';
import { z } from 'zod';
import type { Request, Response } from 'express';

export const Public = () => SetMetadata('public', true);
const SESSION_COOKIE = 'pace_session';
function secret() {
  const s = process.env.PACE_SESSION_SECRET;
  if (!s || s.length < 32)
    throw new Error(
      'PACE_SESSION_SECRET must be configured with >=32 characters',
    );
  return s;
}
export function passwordHash(
  password: string,
  salt = randomBytes(16).toString('hex'),
) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash || hash.length !== 128) return false;
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(hash, 'hex'),
  );
}
function sign(value: string) {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}
function cookieValue(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      exp: Math.floor(Date.now() / 1000) + 7 * 86400,
    }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function fromCookie(raw: string | undefined): string | undefined {
  if (!raw) return;
  const parts = raw.split('.');
  if (parts.length !== 2) return;
  const expected = Buffer.from(sign(parts[0]));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return;
  try {
    const obj = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (obj.exp > Date.now() / 1000 && typeof obj.sub === 'string')
      return obj.sub;
  } catch {}
}
export type AuthedRequest = Request & { authId: string };
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DataSource,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const req = context
      .switchToHttp()
      .getRequest<Request & { authId?: string }>();
    const userId = fromCookie(req.cookies?.[SESSION_COOKIE]);
    if (
      !userId ||
      !(await this.db.getRepository(User).findOneBy({ id: userId }))
    )
      throw new UnauthorizedException('Please sign in');
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      const origin = req.get('origin');
      const allowed = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000')
        .split(',')
        .map((s) => s.trim());
      if (origin && !allowed.includes(origin))
        throw new ForbiddenException('Invalid request origin');
    }
    req.authId = userId;
    return true;
  }
}
@Controller('auth')
export class AuthController {
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(private readonly db: DataSource) {}
  @Public()
  @Post('login')
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const origin = req.get('origin');
    const allowed = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000')
      .split(',')
      .map((x) => x.trim());
    if (origin && !allowed.includes(origin))
      throw new ForbiddenException('Invalid request origin');
    const key = req.ip || 'unknown';
    const now = Date.now();
    const prev = this.attempts.get(key);
    if (prev && prev.until > now && prev.count >= 10)
      throw new ForbiddenException('Too many login attempts. Try again later.');
    const input = validate(
      z.object({ email: z.string().email(), password: z.string().min(1) }),
      body,
    );
    const user = await this.db
      .getRepository(User)
      .findOneBy({ email: input.email.toLowerCase() });
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      const count = (prev && prev.until > now ? prev.count : 0) + 1;
      this.attempts.set(key, { count, until: now + 15 * 60 * 1000 });
      throw new UnauthorizedException('Incorrect email or password');
    }
    this.attempts.delete(key);
    res.cookie(SESSION_COOKIE, cookieValue(user.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 86400 * 1000,
    });
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      timezone: user.timezone,
    };
  }
  @Get('me') async me(@Req() req: AuthedRequest) {
    const user = await this.db
      .getRepository(User)
      .findOneBy({ id: req.authId });
    if (!user) throw new UnauthorizedException('Please sign in');
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      timezone: user.timezone,
    };
  }
  @Post('logout') logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return { ok: true };
  }
}
