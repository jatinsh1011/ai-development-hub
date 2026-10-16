import { Module, type DynamicModule } from '@nestjs/common';
import { ArtifactsService } from './artifacts.service.js';
import { AuthService, CTX } from './auth.service.js';
import { ArtifactsController, AuthController, OrgsController } from './controllers.js';
import type { Ctx } from './context.js';
import { OrgsService } from './orgs.service.js';

@Module({})
export class AppModule {
  static forRoot(ctx: Ctx): DynamicModule {
    return {
      module: AppModule,
      controllers: [AuthController, ArtifactsController, OrgsController],
      providers: [{ provide: CTX, useValue: ctx }, AuthService, ArtifactsService, OrgsService],
    };
  }
}
