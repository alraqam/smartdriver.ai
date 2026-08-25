import { Controller, Get, Header, Headers, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OfflineService } from './offline.service';

@Controller('offline')
export class OfflineController {
  constructor(private readonly offline: OfflineService) {}

  /// The downloadable question bank.
  ///
  /// Conditional: the client sends back the version it already holds and gets a
  /// 304 when nothing has moved. That is the common case — the app checks on
  /// every launch, and the bank changes when the content team imports, not
  /// hourly — so the check has to be cheap enough to make unconditionally.
  ///
  /// `private` because the payload is identical for everyone but the request
  /// carries a bearer token; a shared proxy has no business holding it.
  @Get('pack')
  @Header('Cache-Control', 'private, no-cache')
  async pack(@Headers('if-none-match') ifNoneMatch: string | undefined, @Res() res: Response) {
    const version = await this.offline.version();
    const etag = `"${version}"`;

    // Weak-comparison tolerant: nginx and friends will happily hand back
    // W/"abc" for an etag we issued as "abc".
    if (ifNoneMatch && ifNoneMatch.replace(/^W\//, '') === etag) {
      res.setHeader('ETag', etag);
      res.status(304).end();
      return;
    }

    const pack = await this.offline.pack();
    res.setHeader('ETag', `"${pack.version}"`);
    res.json(pack);
  }

  /// Just the version, for a client that wants to know whether its pack is
  /// stale without being handed a new one.
  @Get('version')
  @Header('Cache-Control', 'private, no-cache')
  async version() {
    return { version: await this.offline.version() };
  }
}
