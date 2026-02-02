import type { VercelRequest, VercelResponse } from '@vercel/node';
import express, { type Express } from 'express';
import { registerRoutes } from '../server/routes.ts';
import { createServer } from 'http';

const app = express();
const httpServer = createServer(app);

// Initialize app configuration
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Cache the routes registration to avoid re-registering on every request in serverless
let routesRegistered = false;

const setupApp = async () => {
  if (!routesRegistered) {
    await registerRoutes(httpServer, app);
    routesRegistered = true;
  }
  return app;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const handlerApp = await setupApp();
  // @ts-ignore - express types compatibility
  handlerApp(req, res);
}
