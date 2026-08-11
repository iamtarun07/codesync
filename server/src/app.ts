import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { dbName, dbStatus } from './config/db';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { apiLimiter } from './middleware/rateLimit.middleware';
import authRoutes from './routes/auth.routes';
import roomRoutes from './routes/room.routes';

export function createApp() {
  const app = express();

  // Behind a platform proxy (Render/Railway/Fly): needed for secure cookies and
  // for the rate limiter to see the real client IP.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  /**
   * This process serves a JSON API and a Socket.IO endpoint only — never HTML —
   * so a CSP here would protect nothing and risks breaking the Monaco/worker
   * setup on the frontend host, which is where a CSP belongs. The remaining
   * helmet headers (nosniff, frameguard, referrer policy, HSTS in production)
   * are all useful and safe for an API.
   */
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      // The API is called cross-origin by the frontend; COOP/CORP would block it.
      crossOriginResourcePolicy: false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // Exactly one origin, with credentials. Never '*' for cookie-authenticated APIs.
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());

  /**
   * Health probe for the deployment platform. Reports whether the database is
   * reachable, and never any connection detail beyond its name.
   */
  const health = (_req: express.Request, res: express.Response) => {
    const database = dbStatus();
    res.status(database === 'connected' ? 200 : 503).json({
      status: database === 'connected' ? 'ok' : 'degraded',
      database,
      db: dbName(),
      uptime: Math.round(process.uptime()),
    });
  };

  // `/health` is the conventional probe path; `/api/health` predates it and is
  // kept so nothing that already calls it breaks.
  app.get('/health', health);
  app.get('/api/health', health);

  // Coarse ceiling on the REST surface. Editor traffic runs over Socket.IO and
  // is limited separately, so this cannot throttle typing.
  app.use('/api', apiLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
