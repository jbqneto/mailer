# Organização das rotas HTTP

A camada HTTP é dividida pelo formato de entrega:

- `src/http/routes/rest-routes.ts` contém endpoints JSON/API: `/health`, `/ready`, `/metrics`, `/admin/*` e `/v1/*`.
- `src/http/routes/ui-routes.ts` contém páginas HTML, atualmente `GET /preview`.

`src/http/build-app.ts` permanece como composition root do Fastify: cria os serviços compartilhados, instala hooks de observabilidade e registra os módulos de rota.
