import { Body, Controller, Get, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ArtifactsService } from './artifacts.service.js';
import { AuthService } from './auth.service.js';
import { OrgsService } from './orgs.service.js';

type Req = { headers: Record<string, any> };
const bool = (v?: string) => (v === 'true' || v === '1' ? true : undefined);

@Controller('v1')
export class AuthController {
  constructor(@Inject(AuthService) private auth: AuthService) {}
  @Get('health') health() { return { ok: true }; }
  @Post('auth/register') register(@Body() b: any) { return this.auth.register(b); }
  @Post('auth/login') login(@Body() b: any) { return this.auth.login(b); }
  @Get('auth/me') async me(@Req() r: Req) { return { user: await this.auth.user(r, true) }; }
  @Post('auth/logout') async logout(@Req() r: Req) { await this.auth.revoke(String(r.headers.authorization ?? '').slice(7)); return { ok: true }; }
  @Post('auth/tokens') async mint(@Req() r: Req, @Body() b: any) { const u = await this.auth.user(r, true); return { token: await this.auth.issue(u.id, b?.name || 'automation', 'pat') }; }
  @Get('auth/tokens') async tokens(@Req() r: Req) { const u = await this.auth.user(r, true); return { tokens: await this.auth.listTokens(u.id) }; }
}

@Controller('v1')
export class ArtifactsController {
  constructor(@Inject(ArtifactsService) private svc: ArtifactsService, @Inject(AuthService) private auth: AuthService) {}

  @Get('artifacts')
  async search(@Req() r: Req, @Query() q: Record<string, string>) {
    const u = await this.auth.user(r);
    return this.svc.search({
      q: q.q, type: q.type, provider: q.provider, language: q.language, framework: q.framework, owner: q.owner, org: q.org,
      verified: bool(q.verified), official: bool(q.official), sort: q.sort as any,
      limit: q.limit ? +q.limit : 20, offset: q.offset ? +q.offset : 0, viewerId: u?.id ?? null,
    });
  }
  @Post('artifacts/validate') validate(@Body() b: any) { return this.svc.validate(b?.files ?? []); }
  @Post('artifacts') async publish(@Req() r: Req, @Body() b: any) { return this.svc.publish(await this.auth.user(r, true), b); }

  // ref may be bare ("react-agent") or "owner/slug"; used by the CLI.
  @Get('lookup') async lookup(@Req() r: Req, @Query('ref') ref: string, @Query('version') v?: string) { return this.svc.detail(ref, await this.auth.user(r), v); }
  @Get('install') async install(@Req() r: Req, @Query('ref') ref: string, @Query('range') range?: string) { return this.svc.resolveInstall(ref, range, await this.auth.user(r)); }
  @Post('updates') async updates(@Req() r: Req, @Body() b: any) { return { updates: await this.svc.latest(b?.items ?? [], await this.auth.user(r)) }; }

  @Get('artifacts/:owner/:slug') async detail(@Req() r: Req, @Param('owner') o: string, @Param('slug') s: string, @Query('version') v?: string) { return this.svc.detail(`${o}/${s}`, await this.auth.user(r), v); }
  @Get('artifacts/:owner/:slug/versions/:version/files') async files(@Req() r: Req, @Param('owner') o: string, @Param('slug') s: string, @Param('version') v: string) { return this.svc.files(`${o}/${s}`, v, await this.auth.user(r)); }
  @Post('artifacts/:owner/:slug/star') async star(@Req() r: Req, @Param('owner') o: string, @Param('slug') s: string) { return this.svc.star(await this.auth.user(r, true), `${o}/${s}`); }
  @Post('artifacts/:owner/:slug/rate') async rate(@Req() r: Req, @Param('owner') o: string, @Param('slug') s: string, @Body() b: any) { return this.svc.rate(await this.auth.user(r, true), `${o}/${s}`, +b?.score); }
  @Post('artifacts/:owner/:slug/report') async report(@Req() r: Req, @Param('owner') o: string, @Param('slug') s: string, @Body() b: any) { return this.svc.report(await this.auth.user(r, true), `${o}/${s}`, b?.reason); }
  @Post('artifacts/:owner/:slug/fork') async fork(@Req() r: Req, @Param('owner') o: string, @Param('slug') s: string) { return this.svc.fork(await this.auth.user(r, true), `${o}/${s}`); }
  @Post('artifacts/:owner/:slug/installed') async installed(@Req() r: Req, @Param('owner') o: string, @Param('slug') s: string, @Body() b: any) {
    return this.svc.recordInstall(await this.auth.user(r), `${o}/${s}`, b?.version, b?.provider ?? 'unknown', b?.action ?? 'artifact_installed');
  }
  @Get('users/:handle') async profile(@Req() r: Req, @Param('handle') h: string) { return this.svc.userProfile(h, await this.auth.user(r)); }
}

@Controller('v1')
export class OrgsController {
  constructor(@Inject(OrgsService) private svc: OrgsService, @Inject(AuthService) private auth: AuthService) {}
  @Post('orgs') async create(@Req() r: Req, @Body() b: any) { return this.svc.create(await this.auth.user(r, true), b); }
  @Get('orgs') async mine(@Req() r: Req) { return { orgs: await this.svc.mine(await this.auth.user(r, true)) }; }
  @Get('orgs/:slug') async overview(@Req() r: Req, @Param('slug') s: string) { return this.svc.overview(await this.auth.user(r, true), s); }
  @Post('orgs/:slug/teams') async team(@Req() r: Req, @Param('slug') s: string, @Body() b: any) { return this.svc.createTeam(await this.auth.user(r, true), s, b); }
  @Post('orgs/:slug/members') async member(@Req() r: Req, @Param('slug') s: string, @Body() b: any) { return this.svc.addMember(await this.auth.user(r, true), s, b); }
  @Put('orgs/:slug/policies') async setPolicy(@Req() r: Req, @Param('slug') s: string, @Body() b: any) { return this.svc.setPolicy(await this.auth.user(r, true), s, b); }
  @Get('orgs/:slug/policies') async policies(@Req() r: Req, @Param('slug') s: string) { return { policies: await this.svc.policies(await this.auth.user(r, true), s) }; }
  @Get('orgs/:slug/analytics') async analytics(@Req() r: Req, @Param('slug') s: string, @Query('days') d?: string) { return this.svc.analytics(await this.auth.user(r, true), s, d ? +d : 30); }
  @Get('me/resources') async resources(@Req() r: Req) { return { resources: await this.svc.resources(await this.auth.user(r, true)) }; }
  @Post('events') async events(@Req() r: Req, @Body() b: any) { return this.svc.ingest(await this.auth.user(r, true), b); }
}
