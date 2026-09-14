# Stockinho

Para publicar no Railway, siga [DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md). O projeto inclui Dockerfile, configuração de healthcheck e scripts de build/start com Next.js convencional.

Sistema acadêmico de estoque para pequenos comércios. Frontend e API seguem o Next.js App Router, com React, TypeScript, Shadcn, Recharts e Supabase Auth/Postgres. A publicação em Sites utiliza Vinext, uma implementação compatível com a API do Next.js para Cloudflare Workers. O código também pode ser executado com o Next.js convencional, conforme abaixo.

## Estado desta entrega

A rota inicial apresenta o produto e direciona para cadastro ou login. O painel fica em `/painel`, exige uma sessão válida e usa exclusivamente os dados da empresa armazenados no Supabase. IA generativa depende da configuração opcional descrita abaixo.

## Configurar o Supabase

1. Use um projeto Supabase dedicado. Execute `database/schema.sql` uma vez no SQL Editor.
2. Copie `.env.example` para `.env.local`, preenchendo `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`. Não use service_role.
3. Habilite autenticação por e-mail/senha. Configure Site URL e URLs de redirecionamento com o endereço da aplicação. Confirme seu e-mail e faça login em `/login`.
4. Em Configurações, adicione a primeira empresa; em Lojas e depósitos, crie a primeira unidade. Crie categorias e produtos. Use uma entrada com motivo Ajuste inicial para informar o saldo.
5. Para adicionar funcionários, eles devem ter conta confirmada. Em Configurações, adicione o e-mail com papel Operador ou Administrador.
6. Para IA generativa, configure `GEMINI_API_KEY` e `GEMINI_MODEL` com um modelo disponível em sua conta. A chave fica apenas no servidor. Sem essas variáveis, o chat usa análises determinísticas e não finge chamar uma IA. Configure limites de consumo no provedor antes de disponibilizar amplamente.

No Sites, configure as mesmas variáveis no ambiente do site; `.env.local` não é enviado. Nenhum projeto Supabase existente foi alterado nesta entrega.

## Execução

Use Node 22.13 ou superior e o pnpm declarado em package.json. Instale com `pnpm install --frozen-lockfile`. Para o runtime de publicação: `pnpm dev` e `pnpm build`.

Para Next.js convencional em desenvolvimento, execute `pnpm exec next dev`. Para hospedar em um servidor Node, use `pnpm exec next build` seguido de `pnpm exec next start`. Esses comandos usam a dependência Next.js já declarada. A versão inicial validou Vinext/Sites. A adaptação para Railway também validou o build Next.js convencional e o servidor standalone.

## Estrutura

- `app/`: rotas Next.js, layout e API do próprio sistema.
- `components/stock/`: interface administrativa e fluxos de cadastro.
- `modules/stock/model.ts`: contratos de dados e regras analíticas compartilhadas.
- `lib/stock/server.ts`: sessões, cliente REST Supabase e consulta dos dados.
- `database/schema.sql`: tabelas, relacionamentos, índices, permissões e funções transacionais.
- `tests/`: verificações das regras relevantes.

## Regras de negócio

Uma empresa possui vários membros, categorias, produtos e unidades. O saldo pertence a produto + unidade + empresa. Chaves estrangeiras compostas impedem relações entre empresas. RLS valida a associação do usuário a cada empresa. Administradores cadastram produtos/categorias/unidades e adicionam membros; operadores consultam e registram movimentações. Papel não é obtido de metadados editáveis do usuário.

Movimentações são imutáveis. O banco bloqueia o produto e saldo durante a transação, valida o estoque, atualiza o saldo e registra a auditoria junto. Saídas não podem gerar saldo negativo. Um produto com saldo não pode ser arquivado; a categoria com produtos não pode ser excluída. Código de barras é único por empresa quando informado. O mínimo é definido por produto e aplicado igualmente em cada unidade.

O painel utiliza saldos atuais, preços de custo atuais e movimentações no período escolhido. Não é um módulo de faturamento. O ranking considera apenas saídas com motivo Venda no mês-calendário anterior; transferências e perdas não contam como vendas. Reposição sugere duas vezes o mínimo cadastrado, sem previsão estatística. Unidades de medidas diferentes são somadas apenas como um indicador de itens; não representam peso ou volume total.

## Autenticação e API

Sessões usam cookies HttpOnly, SameSite=Lax e Secure em produção. A API verifica o usuário no Supabase e renova a sessão com refresh token. Mutações validam Origin, entrada via Zod e permissões por empresa; as RLS continuam sendo aplicadas. Somente a chave publicável e token do usuário são usados nas requisições ao banco. Respostas autenticadas não são armazenadas em cache. Respostas 401 são JSON, sem redirecionamento da API.

- `GET /api/stock`: snapshot das empresas acessíveis.
- `POST /api/stock`: ações company, product, category, location, movement, delete e member.
- `POST /api/auth`: login/cadastro; `DELETE /api/auth`: logout.
- `POST /api/chat`: pergunta com tenant_id e location_id; os dados são limitados à empresa/unidade autorizada antes de enviar ao modelo.

## Limites

A consulta é paginada no servidor, mas carrega um snapshot completo no navegador, adequada ao escopo acadêmico/pequeno comércio. O histórico na interface mostra as 100 últimas movimentações; as análises usam todos os registros carregados. Cada tabela tem limite de 100 mil registros na consulta. Para escala maior, mover as agregações para SQL e paginar a interface. Não inclui PDV, emissão fiscal, transferências entre unidades, convites por e-mail ou recuperação de senha. As unidades têm CRUD de criação, leitura e edição; não são excluídas para preservar vínculos de histórico. O catálogo usa arquivamento em lugar de exclusão física.

## Verificações

Execute `node --experimental-strip-types --test tests/domain.test.mjs` para testar saldo da demonstração, reposição e ranking. Execute `node tests/database.test.mjs` para validar o esquema em um Postgres embarcado (PGlite, dependência de desenvolvimento). O teste cria apenas um banco efêmero local, simulando usuários Supabase e verificando RLS, privilégios, saldos, relacionamentos e histórico. Ele não substitui um teste de integração com o projeto Supabase configurado.

As verificações de domínio, SQL/RLS e TypeScript passaram. O build de publicação também foi validado. Login real, envio de e-mail e Gemini não foram testados por ausência da configuração externa. O WebMCP oferece uma consulta de estoque somente leitura em navegadores compatíveis; validação nesse contexto não estava disponível nesta sessão.
