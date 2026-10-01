import { Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { AuthService, Public, type AuthedRequest } from './auth';

const LoginBody = z.object({ persona: z.string().min(1).max(40) }).strict();

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Post('demo-login')
  @HttpCode(200)
  login(@Body() body: unknown) {
    return this.auth.demoLogin(LoginBody.parse(body).persona);
  }

  @Get('me')
  me(@Req() req: AuthedRequest) {
    return req.user;
  }
}
