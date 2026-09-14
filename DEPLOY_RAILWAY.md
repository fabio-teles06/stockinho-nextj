# Publicar o Stockinho no Railway

O Railway executará frontend e API em um único serviço Next.js/Node. Supabase continuará responsável pelo banco e pelas contas; Gemini é opcional. O Dockerfile usa o modo standalone do Next.js e inclui os arquivos estáticos. O Railway detecta esse Dockerfile automaticamente.

## 1. Enviar o código

Extraia `Stockinho-Railway.zip` e publique o conteúdo da pasta em um repositório GitHub seu. Os arquivos `package.json`, `Dockerfile` e `railway.json` devem estar na raiz do repositório.

No Railway, selecione **New Project → Deploy from GitHub repo** e escolha esse repositório. Não configure comandos customizados de build/start: o Dockerfile já executa o build e inicia `server.js`. Se o projeto estiver em um monorepo, configure Root Directory para a pasta que contém o Dockerfile.

Alternativamente, com a CLI Railway autenticada, execute `railway init` e `railway up` na pasta do projeto.

## 2. Definir as variáveis

Na aba **Variables** do serviço, configure:

| Variável | Valor |
| --- | --- |
| `SUPABASE_URL` | URL do projeto Supabase escolhido |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publicável do mesmo projeto; nunca service_role |
| `APP_URL` | Endereço HTTPS final, por exemplo `https://stockinho-production.up.railway.app` |
| `GEMINI_API_KEY` | Opcional: chave do Gemini, mantida no servidor |
| `GEMINI_MODEL` | Opcional: nome de um modelo disponível na sua conta |

O processo usa `PORT` fornecida pelo Railway e escuta em `0.0.0.0`. O Dockerfile já define `NODE_ENV=production`. As credenciais são lidas em execução e não precisam entrar no build. Não envie `.env.local` ao GitHub.

Sem Supabase, a aplicação continua em demonstração local. Sem Gemini, o assistente responde com análises calculadas. A troca de endereço não transporta o armazenamento local da demonstração do site anterior.

## 3. Configurar o banco e as contas

Se este é um Supabase novo, execute `database/schema.sql` **uma única vez** no SQL Editor. Se esse esquema já foi aplicado, não o execute novamente. Ele cria as tabelas, políticas RLS e funções do Stockinho.

Habilite login por e-mail e senha. Em **Authentication → URL Configuration**, informe o endereço HTTPS da aplicação em **Site URL** e nas URLs de redirecionamento permitidas. Cadastre-se em `/login`, confirme o e-mail e entre. Crie sua empresa, unidades, categorias e produtos.

Não é necessário criar outro Postgres dentro do Railway.

## 4. Gerar o endereço público

Depois do deploy, abra **Settings → Networking → Generate Domain** no serviço. Atualize `APP_URL` com o domínio gerado e aplique as variáveis/reimplante. Se usar domínio próprio, atualize também `APP_URL` e as URLs do Supabase.

`APP_URL` permite validar a origem das requisições atrás do proxy do Railway. Um valor incorreto pode impedir login e outras alterações com erro 403.

## 5. Conferir

- `/api/health` deve responder HTTP 200 com `{"status":"ok"}`.
- `/` deve carregar o painel, CSS e ícones.
- `/login` deve permitir autenticação quando o Supabase estiver configurado.
- Registre uma entrada, depois uma saída e confira o saldo na unidade selecionada.

O healthcheck confirma que o processo está respondendo; não testa banco ou Gemini. O `railway.json` define esse endpoint e reinício em caso de falha.

## Execução local com o mesmo servidor

Com Node 22 e pnpm 11.25.0:

```bash
pnpm install --frozen-lockfile
pnpm run build:railway
pnpm run start:railway
```

Para testar o container, com Docker instalado:

```bash
docker build -t stockinho .
docker run --rm -p 3000:3000 --env-file .env.local stockinho
```

No teste local, use `APP_URL=http://localhost:3000`. Os scripts padrão anteriores foram preservados; o Dockerfile escolhe explicitamente `build:railway`.

## Referências

- [Guia oficial de Next.js no Railway](https://docs.railway.com/guides/nextjs)
- [Configuração como código do Railway](https://docs.railway.com/config-as-code/reference)
- [Saída standalone do Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)

## Validação desta adaptação

O build Next.js, TypeScript, os testes da origem e o servidor standalone passaram. Foram conferidos painel, login, CSS, favicon, healthcheck e respostas de erro da API. O teste reproduzível é `node tests/standalone-smoke.mjs`, após o build. A imagem Docker não foi construída neste ambiente, que não possui Docker. A implantação na conta Railway e as conexões reais com Supabase/Gemini ainda não foram executadas.
