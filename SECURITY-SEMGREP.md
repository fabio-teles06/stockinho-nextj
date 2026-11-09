# Achados do Semgrep

## Resumo

| Achado | Arquivo | Resultado |
| --- | --- | --- |
| Vulnerable Node.js Version in Dockerfile | `Dockerfile:2,13` | Corrigido |
| `npm-missing-minimum-release-age` | `.npmrc:4` | Corrigido |
| Improper SameSite Cookie Attribute in Koa | `middleware.ts:23-24` | Falso positivo confirmado |

## Correções aplicadas

### Imagem Node.js vulnerável

O Dockerfile usava as tags flutuantes `node:22-bookworm-slim`. Além de não garantir uma versão reproduzível, essa linha podia resolver para uma versão afetada pelo CVE reportado pelo Semgrep.

As etapas de dependências e execução agora usam:

```dockerfile
FROM node:22.23.4-bookworm-slim
```

Essa versão atende ao limite mínimo indicado pelo achado. A imagem continua sendo a variante slim baseada em Debian Bookworm e as duas etapas usam a mesma versão.

### Idade mínima de publicação de pacotes

O `.npmrc` agora contém:

```ini
min-release-age=7
```

O gerenciador aguarda sete dias antes de considerar uma versão recém-publicada elegível para instalação. Isso reduz o risco de consumir imediatamente um pacote comprometido publicado recentemente. O lockfile continua sendo obrigatório no Dockerfile com `pnpm install --frozen-lockfile`.

## Achado SameSite

O Semgrep apontou:

```ts
request.cookies.set("sk_access", session.access_token);
request.cookies.set("sk_refresh", session.refresh_token);
```

Essas chamadas não criam nem enviam cookies ao navegador. Elas atualizam somente o jar de cookies da `NextRequest`, para que a renderização atual receba os tokens renovados.

Os cookies efetivamente enviados na resposta são configurados logo depois com:

```ts
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};
```

Portanto, o alerta nas linhas 23-24 é falso positivo para este uso da API do Next.js. Alterar ou remover essas chamadas quebraria a propagação dos tokens renovados para a requisição atual. O atributo `SameSite=Lax` da resposta permanece aplicado aos cookies persistidos no navegador.

## Validação

Após as alterações, validar com:

```bash
docker build --no-cache -t stockinho-security-check .
npm run lint
npm run typecheck
npm test
```

Também é recomendado executar novamente o Semgrep no commit e confirmar que os dois achados corrigidos desapareceram. O alerta de `middleware.ts` deve ser marcado como falso positivo na ferramenta, com a justificativa descrita acima.
