# Templates de e-mail

A pasta `templates/` é a fonte de verdade dos e-mails. Os dados reais chegam no JSON da requisição e são validados pelo registry antes da renderização.

## Organização

- `templates/shared/base-email.tsx`: estrutura compartilhada existente.
- `templates/shared/components.tsx`: componentes visuais reutilizáveis incorporados da PR #4.
- `templates/shared/email-theme.ts`: contrato dos tokens visuais.
- `templates/themes/`: temas por projeto, como o tema do Bloom.
- `templates/<projeto>/*.tsx`: templates por produto.
- `src/templates/template-registry.ts`: schemas, componentes e subjects.
- `src/templates/template-preview-data.ts`: exemplos usados pelo preview local.

Para criar um novo template, use o script `email:new` quando disponível e depois registre componente, schema, subject, payload de exemplo e testes.

O payload do cliente continua simples:

```json
{
  "template": "welcome-user",
  "to": "recipient@example.com",
  "data": {
    "name": "Neto",
    "actionUrl": "https://example.com/activate"
  }
}
```
