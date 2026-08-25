// .env FIRST — before any module that reads process.env at import time
// (JwtModule.register and the service constructors all do).
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { UPLOAD_DIR, UPLOAD_ROUTE } from './admin/uploads.service';

const DEV_SECRET = 'smartdriverai-dev-secret';

// Fail fast at boot on missing or dangerous config, rather than surfacing it
// as an opaque error on whichever request happens to need it first.
function assertRequiredConfig() {
  const db = process.env.DATABASE_URL;
  if (!db || !/^postgres(ql)?:\/\//.test(db)) {
    throw new Error('DATABASE_URL must be set to a postgresql:// connection string.');
  }

  const prod = process.env.NODE_ENV === 'production';
  if (prod) {
    const s = process.env.JWT_SECRET;
    if (!s || s === DEV_SECRET || s.length < 16) {
      throw new Error(
        'JWT_SECRET must be set to a strong value (>=16 chars, not the dev default) in production.',
      );
    }

    // In mock mode no SMS is sent and the code goes to the log — which in
    // production means nobody can sign in, and anyone with log access can sign
    // in as anyone. Refuse to start rather than ship a broken door.
    if (!process.env.ESKIZ_EMAIL || !process.env.ESKIZ_PASSWORD) {
      throw new Error(
        'Eskiz would run in MOCK mode in production: no SMS would be sent and OTP codes would be written to the log. Set ESKIZ_EMAIL and ESKIZ_PASSWORD.',
      );
    }
  }
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  assertRequiredConfig();

  // bodyParser:false because we register the parsers ourselves below. Nest
  // skips its own if it finds one already applied, so leaving it on and adding
  // a second parser silently disables parsing everywhere the added one does
  // not match.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
    bodyParser: false,
  });
  app.enableShutdownHooks();

  // Behind Traefik / EasyPanel — trust the proxy so the client IP used for
  // rate limiting is the learner's, not the proxy's (otherwise every learner
  // shares one bucket and the OTP limit locks everyone out at once).
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet());

  // Body parsing. A content import carries the whole question bank in one
  // request — the seed file alone is ~90kb and a real bank is several hundred
  // — so it needs far more than the 100kb default. Everything else keeps a
  // tight limit rather than opening that headroom app-wide.
  //
  // Order matters: the path-scoped parser runs first, and body-parser marks
  // the request as parsed, so the general parser below skips a body the first
  // one already read.
  app.use('/api/admin/import', json({ limit: '25mb' }));
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  // Uploaded question diagrams. Served from the API under the /api prefix so
  // the Vite dev proxy and the nginx /api rule already reach them, and images
  // stay same-origin with the app.
  //
  // Filenames are the sha256 of the contents, so a name never changes meaning
  // and the files can be cached indefinitely. The headers below are belt and
  // braces on top of the upload sniffer: even if something that is not an
  // image ever reached this directory, the browser is told not to sniff it and
  // not to render it inline.
  app.useStaticAssets(UPLOAD_DIR, {
    prefix: UPLOAD_ROUTE,
    immutable: true,
    maxAge: '365d',
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    },
  });

  app.setGlobalPrefix('api');

  const prod = process.env.NODE_ENV === 'production';
  let origins: string[];
  if (process.env.CORS_ORIGINS) {
    origins = process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  } else if (prod) {
    origins = [];
    logger.warn('CORS_ORIGINS not set in production — denying all cross-origin requests.');
  } else {
    origins = ['http://localhost:5175', 'http://localhost:4175', 'http://localhost:8082'];
  }
  app.enableCors({ origin: origins, credentials: true });

  const port = Number(process.env.PORT) || 3003;
  await app.listen(port);
  logger.log(`SmartDriverAI API → http://localhost:${port}/api`);
  if (!process.env.ESKIZ_EMAIL) {
    logger.warn('Eskiz in MOCK mode — OTP codes are printed to this log, no SMS is sent.');
    if (process.env.DEMO_SHOW_OTP !== 'false') {
      // Loud, because an OTP in an HTTP response is a real vulnerability
      // anywhere it is not deliberate. Production cannot reach this line —
      // assertRequiredConfig() refuses to boot in mock mode there.
      logger.warn(
        'DEMO MODE — OTP codes are ALSO returned in the /auth/otp/request response body and shown in the UI. Set DEMO_SHOW_OTP=false to disable.',
      );
    }
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    logger.warn('Anthropic in MOCK mode — explanations and tutor replies are canned.');
  }
}

bootstrap();
