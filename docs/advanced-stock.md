# Estoque avançado — auditoria, implementação e operação

## Auditoria e plano executado

O repositório usa Next.js App Router 16, React 19 e TypeScript. Railway usa Next.js standalone; Sites/Cloudflare usa Vinext. A interface existente usa Tailwind, Shadcn, Lucide e Recharts. As APIs usam Zod e o REST do Supabase; o banco operacional é PostgreSQL, não o esqueleto Drizzle/D1 ainda vazio. Supabase Auth fornece os usuários e cookies HttpOnly mantêm as sessões. Empresas usam `sk_companies` e `sk_memberships`, com papéis `admin` e `operator`.

Antes da alteração, já existiam produtos, categorias, locais, saldos por produto/local, movimentações imutáveis, caixa, imagens, exportação CSV, dashboard, análise determinística, Gemini opcional e cobrança Asaas. A função privada `move` já centralizava quantidades, bloqueava o produto e impedia saldo negativo. Os novos módulos ampliam essa estrutura: nenhum saldo global precisou ser convertido ou consolidado.

As lacunas encontradas foram inventários, importação, compras/fornecedores, transferências, lotes e etiquetas. Os limites precisavam de serialização, fallback Free e três locais no Pro. A cota da IA precisava devolver reservas após falha. O lint inicial apresentava 24 erros; os testes existentes e TypeScript passavam.

A sequência foi: (1) entitlements e núcleo transacional; (2) inventários/importação/leitura; (3) fornecedores/compras/recebimentos; (4) lotes/transferências/etiquetas; (5) avaliação financeira e assistente; (6) testes locais, builds e documentação. Os principais riscos considerados foram repetição de requisições, concorrência, referências entre empresas, inventário sobrescrevendo movimentações e downgrade destruindo ou consolidando saldos.

## O que está implementado

| Recurso | Comportamento disponível |
| --- | --- |
| Leitor | Câmera via ZXing, leitor como teclado, digitação, busca por código/SKU/identificação interna, associação administrativa, saldo e movimentação real. A câmera apenas consulta; o movimento exige confirmação. |
| Inventários | Snapshot, seleção por categoria, contagens por produto e por lote, revisão, aprovação administrativa, cancelamento, divergências, histórico e CSV. Pro inclui localização por câmera. |
| Importação | CSV UTF-8, mapeamento, prévia, erros por linha, tratamento de conflitos, proteção dos limites, transação integral e resultado de criados/atualizados/ignorados. |
| Fornecedores | Cadastro, edição, arquivo, pesquisa, CPF/CNPJ com dígitos verificadores, associação de vários fornecedores por produto e consulta das compras/últimos custos. |
| Compras | Rascunho editável com vários itens, fornecedor, destino, frete, desconto, previsão; confirmação, recebimento parcial/completo, observações de divergência e cancelamento antes de receber. Recebimento registra data, custo, fornecedor, movimento e lote quando necessário. |
| Etiquetas | PDF com prévia/download, Code 128 ou QR, preço opcional, lote/validade, 21 etiquetas A4 ou uma etiqueta de 60 × 40 mm por página. Free permite uma etiqueta simples. |
| Locais | Aproveita saldos separados existentes, arquivo de local sem saldo, escolha do padrão e transferências atômicas com histórico e lotes. Free usa o padrão; demais locais ficam para leitura. |
| Assistente | Somente leitura, dados reais e filtrados, resumos/custos/reposição/validade/fornecedores/divergências/inatividade. Gemini apenas reformula a análise autorizada. Reserva de cota, devolução em falha e recuperação de reservas abandonadas. |
| Lotes | Código, fabricação/validade, origem de compra, saldo por local, entrada/saída/descarte/transferência, sugestão FEFO confirmada pelo usuário, exportação e preferência de alerta da empresa em 7/15/30 dias. |
| Financeiro | Valor atual a custo, unidades por medida, mínimo/inatividade, custo zero identificado; Pro inclui categorias, locais, maiores valores, evolução diária, entradas/saídas a custo e divergências. |

Não há dados de demonstração nos novos fluxos de produção. O arquivo de modelo CSV contém uma linha de exemplo para preenchimento, sem cadastrar nada automaticamente.

## Arquivos e endpoints

- [Migration operacional](../database/migrations/20261031_stock_operations.sql): estruturas, entitlements, limites, serviço de estoque e operações.
- [Migration de relatórios](../database/migrations/20261031_stock_reports.sql): avaliação histórica, auditoria e agregações.
- [Migration de uso de IA](../database/migrations/20261031_stock_usage.sql): reservas de cota e contexto autorizado.
- [Contratos e validação](../modules/stock/operations.ts), [CSV](../modules/stock/spreadsheets.ts), [códigos](../modules/stock/barcodes.ts) e [análise do assistente](../modules/stock/assistant.ts).
- [Interface operacional](../components/stock/operations-panel.tsx), integrada ao [painel existente](../components/stock/stock-app.tsx).
- [Geração de PDF](../lib/stock/labels.ts).
- `GET /api/stock/operations?tenant_id=UUID`: leitura dos módulos e permissões. `usage=1` retorna somente uso/permissões.
- `POST /api/stock/operations`: `{ tenant_id, key: UUID, action, data }`. A mesma chave e dados retornam o mesmo resultado; reutilizar a chave com outros dados é recusado.
- `GET /api/stock/finance?tenant_id=UUID&location_id=UUID&from=AAAA-MM-DD&to=AAAA-MM-DD`.
- `POST /api/stock/labels`: empresa, produtos, cópias, modelo e papel; retorna PDF.
- [API de chat](../app/api/chat/route.ts), [uso de planos](../app/api/billing/route.ts) e [movimentação legada](../app/api/stock/route.ts) foram integrados às regras novas.

## Erro de função ausente no financeiro

Se a API retornar `PGRST202` para `public.stockinho_finance(p_from, p_location, p_tenant, p_to)`, confira a instalação do banco no projeto Supabase usado pela aplicação. A ordem dos parâmetros na mensagem é alfabética; a API envia os parâmetros por nome.

No SQL Editor desse projeto, execute o conteúdo completo da [migration de relatórios](../database/migrations/20261031_stock_reports.sql), após a [migration operacional](../database/migrations/20261031_stock_operations.sql). A migration de relatórios cria a função, tabelas, permissões e notifica o PostgREST. Caso o assistente também apresente função ausente, execute depois a [migration de cota/contexto](../database/migrations/20261031_stock_usage.sql).

Confira a instalação com:

```sql
select to_regprocedure('public.stockinho_finance(uuid,uuid,date,date)');
select to_regclass('public.sk_valuations'), to_regclass('public.sk_audit_events');
```

Se a função existir e a API continuar sem encontrá-la, execute `notify pgrst, 'reload schema';` e tente novamente após a atualização do cache. Recarregar o cache não cria uma função ausente. Não reaplique o schema inicial em um banco já instalado.

## Dados e consistência

O banco continua sendo a autoridade das quantidades. `stockinho_private.move_core` valida empresa, usuário, produto ativo, local, quantidade com duas casas, saldo, lote e plano. O saldo do produto/local, o saldo do lote e a movimentação são gravados na mesma transação. Operações usam um advisory lock transacional por empresa. As funções antigas de movimento continuam disponíveis e delegam ao núcleo; produtos controlados por lote exigem o fluxo que informa o lote.

`sk_operations` guarda chave, ator, ação, hash SHA-256 da requisição e resultado. Não duplica documentos e contatos de fornecedores no registro de idempotência. `sk_audit_events` guarda alterações com ator e valores anteriores/novos, omitindo documentos, contatos, endereços e observações. Esse diário é de leitura administrativa. Movimentações mantêm produto, local, lote, origem, usuário, quantidade, custo e saldo resultante.

Novas tabelas: `sk_operations`, `sk_suppliers`, `sk_supplier_products`, `sk_purchase_orders`, `sk_purchase_items`, `sk_batches`, `sk_inventories`, `sk_inventory_items`, `sk_valuations`, `sk_audit_events` e `sk_ai_requests`. Produtos receberam SKU e controle de lotes; locais receberam ativo/padrão; empresas receberam preferência de validade. Movimentações receberam lote, documento, tipo lógico, custo e avaliação. Foram mantidos os IDs e relacionamentos anteriores.

As tabelas usam RLS, chaves compostas por empresa e índices por tenant/data/produto/local. SKU e código de barras não vazios são únicos por empresa. A identificação interna de etiquetas usa `STK:UUID`, não um GTIN inventado. Uma consulta ambígua entre SKU/código/ID não seleciona um produto automaticamente.

Inventários usam concorrência otimista conservadora: qualquer movimentação de um produto contado no mesmo local depois da abertura impede a confirmação. Não é feito um ajuste presumindo quando ocorreu a contagem física. Cancele e reinicie após organizar as movimentações. Inventários concluídos são imutáveis; correções exigem novo inventário. Lotes vencidos devem ser descartados por saída com motivo Perda, em vez de ajustados para disponibilização.

O custo médio é móvel e global por produto. A precisão de custo foi ampliada de duas para seis casas por migration compatível, sem reduzir a parte inteira ou descartar valores existentes. Quantidades e valores documentais continuam com duas casas. Compras distribuem frete/desconto proporcionalmente ao valor dos itens; pedidos de valor zero usam quantidade para o frete. Custos por unidade mantêm seis casas; totais financeiros são arredondados para centavos. Transferências conservam quantidades e não recalculam custo. Lotes compartilham o custo médio do produto. É possível atualizar administrativamente o custo cadastrado, com auditoria. A migration de ampliação pode adquirir lock de tabela: aplique-a em janela adequada depois de testar em staging.

Avaliações por local começam na implantação da migration de relatórios e são registradas em movimentos e mudanças de custo. Não existe reconstrução fictícia de custos anteriores. Datas dos registros e agrupamentos diários usam UTC; datas são exibidas em português e moeda em BRL. Os filtros de data se aplicam à evolução/movimentações/inventários; os cards são a posição atual. Produtos com custo zero são sinalizados. O módulo não calcula lucro contábil, impostos ou margem realizada.

## Planos, segurança e Asaas

Free: 50 produtos ativos, 1 membro, 1 local padrão, movimentos ilimitados, leitor, inventário manual e uma importação inicial de até 50 linhas. Pro e Pro Fundador: 2.000 produtos, 3 membros, 3 locais e módulos avançados. Ambos usam a mesma verificação funcional. A mudança atualiza capacidade/recursos dos planos; não altera preço, assinatura, cobrança, oferta Fundador ou webhooks.

Limites são verificados no banco sob o lock da empresa, inclusive criação direta via PostgREST. As APIs usam a sessão e o token do usuário, e os RPCs verificam associação/papel. Chaves de serviço ficam apenas no backend de cobrança/cota. Não é possível escrever nas novas tabelas diretamente com o token público/autenticado. Contagens, aprovação, importação, transferências e compras exigem administrador. Operadores mantêm movimentos manuais, sem ajustes administrativos/custo.

Após downgrade, nada é apagado ou consolidado. Fornecedores, pedidos, lotes, inventários e transferências continuam consultáveis/exportáveis. Locais além do padrão ficam em leitura; as operações de lote exigem Pro. A criação de novos produtos/membros/locais obedece aos limites Free. Membros existentes preservam leitura, mas somente o administrador principal mantém operações Free. A migration escolhe um administrador existente por UUID quando o principal ainda não existe; novas empresas usam o primeiro administrador. Em Transferências, um administrador autorizado pode escolher o principal, inclusive para preparar o downgrade. Remover esse membro pelo fluxo autorizado escolhe outro administrador remanescente.

O assistente usa uma reserva atômica de até 50 consultas por mês-calendário UTC. Análises locais bem-sucedidas também consomem uma consulta. Falha do Gemini devolve a reserva e apresenta a análise local sem custo de cota. Reservas abandonadas há cinco minutos são devolvidas na próxima reserva. Somente o servidor pode concluir/devolver. O provedor recebe a análise autorizada e a pergunta, sem SQL, contatos/documentos ou ferramentas de escrita. Listas são limitadas e identificam essa limitação.

## Instalação e implantação

Não foi alterado nenhum banco remoto. As migrations **precisam ser aplicadas no Supabase** antes da publicação desta versão.

1. Faça backup do banco e valide primeiro em um projeto Supabase de teste.
2. Mantenha todas as migrations anteriores aplicadas. Em instalação nova, comece pelo [schema inicial](../database/schema.sql) e depois execute as migrations em ordem por nome.
3. Execute, nesta ordem: [operações](../database/migrations/20261031_stock_operations.sql), [relatórios](../database/migrations/20261031_stock_reports.sql), [cota/contexto](../database/migrations/20261031_stock_usage.sql). Cada arquivo é transacional e pode ser reaplicado. Não reaplique o schema inicial em um banco já instalado.
4. Confira o local padrão escolhido para cada empresa; o backfill usa o menor UUID existente e não move saldo algum. No Pro, ajuste o padrão em Transferências antes de um downgrade.
5. Publique a aplicação e execute os roteiros abaixo. As migrations notificam o PostgREST para atualizar as funções disponíveis.
6. Em falha, prefira correção incremental. O esquema é aditivo e permite preservar os dados ao recuar a versão da aplicação. Depois de utilizar lotes, uma aplicação antiga não terá interface para movimentá-los: mantenha esses dados em leitura até restabelecer a versão compatível. Não apague tabelas/colunas para fazer rollback. Restaurar um backup só deve ocorrer com plano explícito para preservar movimentações posteriores.

Nenhuma variável nova é obrigatória. Continuam necessárias `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `APP_URL`. Cobrança/cota usa `SUPABASE_SERVICE_ROLE_KEY`; Gemini opcional usa `GEMINI_API_KEY` e `GEMINI_MODEL`. `STOCK_IMPORT_MAX_BYTES` e `STOCK_IMPORT_MAX_ROWS` podem reduzir os limites de importação, até os máximos de 2 MB e 2.000 linhas. As chaves Asaas e Resend permanecem como já configuradas. Os novos módulos não requerem armazenamento de uploads: CSV é analisado no navegador e enviado como dados validados; o servidor também limita os bytes durante a leitura do corpo. PDFs são gerados por requisição. Fotos continuam no armazenamento já existente.

Dependências adicionadas: `@zxing/browser`, `papaparse`, `bwip-js`, `qrcode` e `jspdf`, mais tipos de Papa Parse/QR. Ambos os lockfiles foram atualizados.

## Como validar os fluxos

- **Leitor:** cadastre um produto com código, abra Escanear código, busque e registre entrada/saída. Teste permissão de câmera recusada e leitor como teclado. Um código desconhecido pode ser associado por administrador. Imprima uma etiqueta interna de produto sem código e confira a leitura.
- **Inventário:** registre um saldo; inicie inventário no local; conte, salve, revise e confirme. Repita a confirmação: não deve duplicar ajuste. Em outra contagem, movimente um produto antes de confirmar: a confirmação deve ser recusada. No Pro, confira um produto por lote separadamente.
- **Importação:** baixe o modelo, preencha e mapeie campos; selecione a categoria padrão ou mapeie a categoria por linha. Categoria/local/fornecedor podem ser identificados pelo nome ou UUID já cadastrado. SKU/código duplicado, números inválidos e limites devem impedir a importação integral. Atualização Pro não pode redefinir saldo inicial. O resultado informa criados/atualizados/ignorados.
- **Compras:** cadastre fornecedor, associe produtos e prepare um pedido, usando a reposição por mínimo se útil. Salvar/confirmar não altera saldo. Receba parte, confira o movimento/custo; receba o restante. Para produto por lote, informe código e validade no recebimento.
- **Locais/lotes:** use dois locais Pro, transfira quantidade e confira soma de saldos antes/depois. Repita a chave da operação e confira que o saldo não muda novamente. Lote vencido não deve entrar nem sair para venda. Ajuste a preferência de alerta em Lotes e validades.
- **Etiquetas:** selecione produtos, gere PDF, confira prévia e imprima em escala 100%. No térmico, configure o driver para 60 × 40 mm. Não há impressão térmica direta universal.
- **Financeiro:** compare quantidade × custo no banco com o card. Receba compra com custo diferente e confira a média e a evolução. Compare categorias/locais e a exportação. Os valores históricos anteriores à migration não existem.
- **IA:** pergunte sobre reposição, custos, validade, fornecedores e inventários. Teste Free, cota esgotada e provedor indisponível; nomes de produtos não devem conceder permissões ou permitir escrita.
- **Downgrade/isolamento:** em ambiente de teste, mantenha dois locais com saldos separados e dados premium; remova a vigência paga e confira leitura/exportação preservadas. Outra empresa não pode consultar os registros nem referenciá-los em operações. Não manipule assinaturas reais para esse teste.

## Verificação automatizada e limitações conhecidas

Resultados desta execução:

| Verificação | Resultado |
| --- | --- |
| `npm test` | 23 testes aprovados, incluindo scripts SQL/RLS e PDFs em memória. |
| `npm run test:http` | Aprovado com a aplicação compilada e PostgreSQL efêmero, incluindo recebimento completo e avaliação sem perda de frações de centavo. |
| `node tests/standalone-smoke.mjs` | Aprovado; páginas/assets, sessão ausente e origem indevida, incluindo endpoints novos. |
| `npm run build:railway` | Aprovado, com standalone preparado. |
| `npm run build` | Aprovado no Vinext; há aviso de chunks acima de 500 kB. As ferramentas avançadas são carregadas sob demanda para preservar o carregamento inicial. |
| `npx next typegen` e `npm run typecheck` | Aprovados após ambos os builds. |
| ESLint dos arquivos novos e dos módulos de billing/chat revisados | Aprovado. |
| Lint global | 20 erros preexistentes de `no-explicit-any`, nos módulos antigos de autenticação, estoque, painel e servidor. Eram 24 na auditoria inicial. |
| Supabase remoto, Asaas/Gemini reais, câmera e impressora físicas | Não executados. |

Os builds também avisam sobre a convenção de middleware antiga; isso não foi migrado para evitar refatoração fora do escopo. As migrations foram aplicadas e reaplicadas em banco temporário; nenhuma migration de dados foi executada no ambiente remoto.

Comandos: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build:railway`, `npm run build`, `npm run test:http` e `node tests/standalone-smoke.mjs`. Os dois últimos exigem o build standalone. Os testes SQL usam PostgreSQL embarcado PGlite com usuários/roles de teste; nenhum banco remoto é necessário. Os testes de ferramentas geram PDFs reais em memória. Next e Vinext compartilham arquivos gerados de tipos; execute os builds sequencialmente. Se Vinext tiver sido o último, execute `npx next typegen` antes do typecheck isolado.

Os testes SQL verificam transações, idempotência, saldos, lotes, recebimentos, custos com frações de centavo, RLS, papéis, limites e cota. PGlite serializa as conexões: isso não substitui testes de concorrência com múltiplas sessões num PostgreSQL/Supabase real. O teste standalone verifica servidor, assets e barreiras HTTP sem credenciais externas. [O teste HTTP autenticado](../tests/operations-http.mjs) sobe a aplicação compilada e um adaptador local da fronteira Supabase/Auth; as operações realmente executam as migrations e funções no PostgreSQL efêmero. Verifica SSR, movimentação, inventário, compra, PDF, financeiro, isolamento, chat local e cota. Nenhum adaptador ou dado de teste é instalado na aplicação de produção.

Pendências/escopo parcial:

- XLSX não foi implementado; CSV atende o formato obrigatório. Não há fila assíncrona: até 2 MB/2.000 linhas por operação, com status de processamento na tela, sem percentual de progresso no banco.
- A importação resolve categorias/fornecedores/locais existentes; não cria esses cadastros automaticamente nem importa lotes. O ajuste em lote atualiza nome/SKU/código/categoria/unidade/preço/mínimo; custos e saldos existentes exigem operações auditadas próprias.
- A preferência de alerta é persistida e a tela sinaliza vencimentos; não há envio agendado de alertas por e-mail/push. A interface fornece modelos de etiquetas fixos, sem editor livre de layout.
- O caixa legado não seleciona lote; produtos com esse controle devem usar a movimentação com lote. A operação é bloqueada se o caixa tentar omitir o lote.
- A interface principal ainda carrega snapshots; bases grandes precisam de paginação/agregações adicionais. Os relatórios novos usam agregações SQL, mas a evolução pode incluir todos os dias se nenhum filtro for definido.
- Não foram validados dispositivos físicos, impressão real, acessibilidade completa, concorrência com várias conexões, Gemini/Asaas reais ou a aplicação das migrations no projeto Supabase de produção. Houve verificação manual no navegador com a aplicação compilada, inclusive recebimento completo em viewport de 390 × 844, mas não há suíte browser E2E de todos os módulos.

Essas limitações impedem tratar todos os critérios do pedido original como integralmente concluídos, embora os fluxos implementados façam operações reais e tenham verificações locais.
