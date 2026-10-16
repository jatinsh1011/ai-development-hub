import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import type { Ctx } from './context.js';

export async function createApp(ctx: Ctx): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(ctx), { logger: process.env.AIDEV_QUIET ? false : ['error', 'warn'] });
  app.enableCors({ origin: true, credentials: true });
  app.useBodyParser('json', { limit: '5mb' });
  return app;
}
