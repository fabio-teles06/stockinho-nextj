# Stockinho

Para publicar no Railway, siga DEPLOY_RAILWAY.md. O projeto inclui Dockerfile, configuração de healthcheck e scripts de build/start com Next.js convencional.

Sistema acadêmico de estoque para pequenos comércios. Frontend e API seguem o Next.js App Router, com React, TypeScript, Shadcn, Recharts e Supabase Auth/Postgres. A publicação em Sites utiliza Vinext, uma implementação compatível com a API do Next.js para Cloudflare Workers. O código também pode ser executado com o Next.js convencional, conforme abaixo.

## Estado desta entrega

A rota inicial apresenta o produto e direciona para cadastro ou login. O painel fica em /painel, exige uma sessão válida e usa exclusivamente os dados da empresa armazenados no Supabase. IA generativa depende da configuração opcional descrita abaixo.

## Configurar o Supabase

- Use um projeto Supabase dedicado. Execute database/schema.sql uma vez no SQL Editor.
- Copie .env.example para .env.local, preenchendo SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY. Não use service_role.
- Habilite autenticação por e-mail/senha. Configure Site URL e URLs de redirecionamento com o endereço da aplicação. Confirme seu e-mail e faça login em /login.
- Em Configurações, adicione a primeira empresa; em Lojas e depósitos, crie a primeira unidade. Crie categorias e produtos. Use uma entrada com motivo Ajuste inicial para informar o saldo.
- Para adicionar funcionários, eles devem ter conta confirmada. Em Configurações, adicione o e-mail com papel Operador ou Administrador.
- Para IA generativa, configure GEMINI_API_KEY e GEMINI_MODEL com um modelo disponível em sua conta. A chave fica apenas no servidor. Sem essas variáveis, o chat usa análises determinísticas e não finge chamar uma IA. Configure limites de consumo no provedor antes de disponibilizar amplamente.
- No Sites, configure as mesmas variáveis no ambiente do site; .env.local não é enviado. Nenhum projeto Supabase existente foi alterado nesta entrega.

## Execução

Passo a passo para quem nunca fez isso antes. Siga na ordem, sem pular etapas.

### 1. Abra o terminal

O terminal é o programa onde os comandos abaixo são digitados (não é o navegador).

- **Windows**: aperte a tecla Windows, digite `PowerShell` e abra o "Windows PowerShell".
- **Mac**: aperte `Cmd + Espaço`, digite `Terminal` e abra o aplicativo "Terminal".
- **Linux**: abra o aplicativo "Terminal" do sistema.

Todos os comandos deste guia são digitados (ou colados) nessa janela, um de cada vez, apertando Enter depois de cada um.

### 2. Instale os programas necessários

Só precisa fazer isso uma vez por computador.

- **Git**: baixe e instale em https://git-scm.com/downloads. É o programa que baixa o código do projeto.
- **Node.js** (versão 22.13 ou mais nova): baixe e instale em https://nodejs.org (escolha a versão "LTS"). Ele já inclui o `npm`, um dos gerenciadores de pacotes usados no passo 4.

Depois de instalar os dois, feche e abra o terminal de novo, e confira se está tudo certo digitando:

```bash
git --version
node --version
```

Se cada comando responder com um número de versão (e não um erro), pode seguir para o próximo passo.

### 3. Baixe o projeto (clonar o repositório)

No terminal, digite:

```bash
git clone https://github.com/fabio-teles06/stockinho-nextj.git
```

Isso cria, na pasta onde o terminal está, uma pasta nova chamada `stockinho-nextj` com todos os arquivos do projeto.

Agora entre nessa pasta:

```bash
cd stockinho-nextj
```

A partir daqui, todo comando deste guia deve ser digitado com o terminal dentro dessa pasta.

### 4. Instale as dependências do projeto

Dependências são pedaços de código prontos, de que o projeto precisa para funcionar. Existem dois programas capazes de instalá-las: `pnpm` (o que o projeto usa por padrão) ou `npm` (o que já vem com o Node.js, mais simples de garantir que vai funcionar).

**Opção recomendada, com npm** (não precisa instalar nada a mais, já que o Node.js instalou o npm no passo 2):

```bash
npm ci
```

**Opção alternativa, com pnpm** (o gerenciador declarado no projeto):

```bash
corepack enable
pnpm install --frozen-lockfile
```

Use só uma das duas opções. Se usar a opção com npm, troque `pnpm exec` por `npx` nos comandos do passo 6.

Esse passo pode demorar alguns minutos e vai imprimir bastante texto no terminal — é normal.

### 5. Configure o acesso ao banco de dados (Supabase)

Antes de rodar o projeto, é preciso ter um `.env.local` preenchido, seguindo a seção **Configurar o Supabase** acima. Sem isso, o site abre, mas login e os dados não funcionam.

Preste atenção especial na variável `APP_URL`: ela precisa ser exatamente igual ao endereço que você vai abrir no navegador no próximo passo (incluindo a porta). Se estiver diferente, a API recusa qualquer tentativa de login ou cadastro com a mensagem "Origem da requisição inválida.".

### 6. Rode o projeto

Com o `.env.local` configurado, digite:

```bash
pnpm exec next dev
```

(ou `npx next dev`, se no passo 4 você tiver usado `npm ci`)

Espere aparecer no terminal uma linha parecida com `- Local: http://localhost:3000`. Isso indica que o projeto está no ar. Abra o navegador e acesse:

```
http://localhost:3000
```

O terminal precisa continuar aberto enquanto o site estiver sendo usado. Para parar o projeto, clique no terminal e aperte `Ctrl + C`.

### 7. Se algo não funcionar

- Comando não reconhecido (`git`, `node`, `pnpm` ou `npm`): feche e abra o terminal de novo depois de instalar os programas do passo 2, ou reinicie o computador.
- Porta 3000 já em uso: pare o programa usando essa porta, ou rode `pnpm exec next dev -p 3001`, atualizando `APP_URL` para `http://localhost:3001` no `.env.local`.
- "Origem da requisição inválida." ao tentar entrar: o `APP_URL` do `.env.local` está diferente do endereço aberto no navegador.
- Página abre, mas nada de dados aparece: confira se o passo 5 (banco no Supabase) foi feito por completo.

### Outras formas de executar (avançado)

Estes comandos existem no projeto para outros cenários, além do desenvolvimento local do passo 6:

- `pnpm dev` e `pnpm build`: usados na publicação em Sites, com o runtime Vinext.
- `pnpm exec next build` seguido de `pnpm exec next start` (ou `pnpm run build:railway` / `pnpm run start:railway`): sobem um servidor de produção Next.js convencional, o mesmo usado na adaptação para Railway. Diferente do passo 6, esse servidor não lê o `.env.local`: é preciso exportar `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `APP_URL` no terminal antes de rodar o comando.

Esses comandos usam a dependência Next.js já declarada. A versão inicial validou Vinext/Sites. A adaptação para Railway também validou o build Next.js convencional e o servidor standalone.

## Estrutura

- app/: rotas Next.js, layout e API do próprio sistema.
- components/stock/: interface administrativa e fluxos de cadastro.
- modules/stock/model.ts: contratos de dados e regras analíticas compartilhadas.
- lib/stock/server.ts: sessões, cliente REST Supabase e consulta dos dados.
- database/schema.sql: tabelas, relacionamentos, índices, permissões e funções transacionais.
- tests/: verificações das regras relevantes.

## Regras de negócio

Uma empresa possui vários membros, categorias, produtos e unidades. O saldo pertence a produto + unidade + empresa. Chaves estrangeiras compostas impedem relações entre empresas. RLS valida a associação do usuário a cada empresa. Administradores cadastram produtos/categorias/unidades e adicionam membros; operadores consultam e registram movimentações. Papel não é obtido de metadados editáveis do usuário.

Movimentações são imutáveis. O banco bloqueia o produto e saldo durante a transação, valida o estoque, atualiza o saldo e registra a auditoria junto. Saídas não podem gerar saldo negativo. Um produto com saldo não pode ser arquivado; a categoria com produtos não pode ser excluída. Código de barras é único por empresa quando informado. O mínimo é definido por produto e aplicado igualmente em cada unidade.

O painel utiliza saldos atuais, preços de custo atuais e movimentações no período escolhido. Não é um módulo de faturamento. O ranking considera apenas saídas com motivo Venda no mês-calendário anterior; transferências e perdas não contam como vendas. Reposição sugere duas vezes o mínimo cadastrado, sem previsão estatística. Unidades de medidas diferentes são somadas apenas como um indicador de itens; não representam peso ou volume total.

## Autenticação e API

Sessões usam cookies HttpOnly, SameSite=Lax e Secure em produção. A API verifica o usuário no Supabase e renova a sessão com refresh token. Mutações validam Origin, entrada via Zod e permissões por empresa; as RLS continuam sendo aplicadas. Somente a chave publicável e token do usuário são usados nas requisições ao banco. Respostas autenticadas não são armazenadas em cache. Respostas 401 são JSON, sem redirecionamento da API.

- GET /api/stock: snapshot das empresas acessíveis.
- POST /api/stock: ações company, product, category, location, movement, delete e member.
- POST /api/auth: login/cadastro; DELETE /api/auth: logout.
- POST /api/chat: pergunta com tenant_id e location_id; os dados são limitados à empresa/unidade autorizada antes de enviar ao modelo.

## Limites

A consulta é paginada no servidor, mas carrega um snapshot completo no navegador, adequada ao escopo acadêmico/pequeno comércio. O histórico na interface mostra as 100 últimas movimentações; as análises usam todos os registros carregados. Cada tabela tem limite de 100 mil registros na consulta. Para escala maior, mover as agregações para SQL e paginar a interface. Não inclui PDV, emissão fiscal, transferências entre unidades, convites por e-mail ou recuperação de senha. As unidades têm CRUD de criação, leitura e edição; não são excluídas para preservar vínculos de histórico. O catálogo usa arquivamento em lugar de exclusão física.

## Verificações

Execute node --experimental-strip-types --test tests/domain.test.mjs para testar saldo da demonstração, reposição e ranking. Execute node tests/database.test.mjs para validar o esquema em um Postgres embarcado (PGlite, dependência de desenvolvimento). O teste cria apenas um banco efêmero local, simulando usuários Supabase e verificando RLS, privilégios, saldos, relacionamentos e histórico. Ele não substitui um teste de integração com o projeto Supabase configurado.

As verificações de domínio, SQL/RLS e TypeScript passaram. O build de publicação também foi validado. Login real, envio de e-mail e Gemini não foram testados por ausência da configuração externa. O WebMCP oferece uma consulta de estoque somente leitura em navegadores compatíveis; validação nesse contexto não estava disponível nesta sessão.
