import type { FastifyInstance } from 'fastify';
import type { AdminAuth } from '../../security/admin-auth.js';
import { adminLoginPage } from '../admin-login-page.js';
import { previewPage } from '../preview-page.js';
import { listTemplatePreviews } from '../../templates/template-preview-data.js';

export interface UiRouteDependencies {
  adminAuth: AdminAuth;
}

export function registerUiRoutes(app: FastifyInstance, { adminAuth }: UiRouteDependencies): void {
  app.get('/preview', async (request, reply) => {
    if (!adminAuth.isAuthenticated(request.headers.cookie)) {
      return reply.code(200).header('Cache-Control', 'no-store').type('text/html; charset=utf-8').send(adminLoginPage());
    }
    return reply.code(200).header('Cache-Control', 'no-store').type('text/html; charset=utf-8').send(previewPage(listTemplatePreviews()));
  });
}
