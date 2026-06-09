# Central Financeira Pessoal

Aplicativo local de controle financeiro pessoal focado na finalidade do dinheiro. A regra central do sistema e:

**saldo em conta nao e saldo livre para gastar.**

O banco pode mostrar um valor alto, mas parte dele pode estar reservada para cartao, compromissos futuros, investimentos ou metas. Esta V1 separa essas finalidades para mostrar quanto ainda pode ser gasto sem comprometer o planejamento.

## Stack

- Backend: Python, FastAPI, SQLModel, SQLite e Alembic.
- Frontend: React, TypeScript, Vite, Tailwind CSS, componentes locais no estilo shadcn/ui, lucide-react, Recharts, TanStack Query, React Hook Form e Zod.
- Testes: pytest no backend; Vitest e React Testing Library no frontend.

## Como rodar

### Desenvolvimento rapido

```powershell
npm run dev
```

Esse comando sobe o backend local em `127.0.0.1:17831` e o frontend em `http://127.0.0.1:5173`. Ao encerrar o Vite, o processo do backend iniciado pelo script tambem e encerrado.

Se precisar recriar o ambiente:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend\requirements.txt
```

### Backend manual

```powershell
cd backend
..\.venv\Scripts\python -m alembic upgrade head
..\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 17831
```

Nao use `--reload` no modo desktop. O endpoint de saude e `GET http://127.0.0.1:17831/health`.

### Desktop nativo instalado

O desktop instalado e gerado por um launcher PyInstaller que abre uma janela
nativa WebView2. Ele nao chama Edge/Chrome com `--app` e nao abre o sistema no
navegador. O pacote inclui o frontend (`frontend/dist`) e o backend local como
sidecar.

```powershell
# Reconstroi backend + frontend + app desktop em dist\Central Financeira\
powershell -ExecutionPolicy Bypass -File scripts\build-launcher.ps1
```

Saida: `dist\Central Financeira\Central Financeira.exe` (com `_internal\web` e
`_internal\backend\central-financeira-backend.exe`). Esse caminho e o que o
atalho do menu Iniciar/desktop deve usar para abrir o aplicativo.

O backend sidecar tambem e copiado para a estrutura Tauri em:

```text
backend/dist/central-financeira-backend.exe
frontend/src-tauri/binaries/central-financeira-backend-x86_64-pc-windows-msvc.exe
```

### Desktop com Tauri

A estrutura Tauri continua em `frontend/src-tauri`, mas e opcional. Esse build
exige Rust/Cargo e o linker MSVC (`link.exe`, Visual Studio Build Tools com
workload C++). Sem esse ambiente, use o desktop nativo instalado acima.

Depois que o Tauri build rodar com Rust instalado, o instalador fica em
`frontend/src-tauri/target/release/bundle/`.

## Testes

```powershell
cd backend
..\.venv\Scripts\python -m pytest
```

```powershell
cd frontend
npm test
npm run build
```

## Banco local

Em desenvolvimento manual, o SQLite fica em:

```text
backend/data/central_financeira.db
```

No modo desktop, o backend grava dados em:

```text
%APPDATA%/CentralFinanceira/central_financeira.db
%APPDATA%/CentralFinanceira/logs/backend.log
%APPDATA%/CentralFinanceira/backups/
```

O backend desktop cria as pastas necessarias, escolhe uma porta local segura a partir de `17831`, roda `alembic upgrade head` automaticamente e grava a porta em `%APPDATA%/CentralFinanceira/backend-port.json`.

Para resetar o banco desktop, feche o aplicativo e remova `%APPDATA%/CentralFinanceira/central_financeira.db`. Para preservar historico, copie antes a pasta `%APPDATA%/CentralFinanceira`.

## Regras financeiras implementadas

- Cartao de credito e metodo de pagamento, nao categoria.
- Em compra no cartao, apenas o valor separado agora reduz saldo livre e entra no orcamento do mes.
- O valor nao separado vira compromisso futuro do cartao.
- Separar parte de compromisso futuro cria gasto efetivo no mes da separacao.
- Pagamento de fatura reduz o reservado do cartao e nao duplica gasto no orcamento.
- Transferencia interna e neutra: nao entra como gasto, receita ou orcamento.
- Orcamento mensal e historico por categoria.
- Dividendos so podem ser registrados para ativos com quantidade atual maior que zero.
- Investimentos no exterior sao separados por tipo de ativo, sem tratar como BDR.
- Compra por ticker cria o ativo automaticamente quando ele ainda nao existe.
- Compra, venda e dividendo exterior em USD atualizam o extrato dolar e o saldo teorico.

## Refatoracao visual

O front-end usa um shell de software desktop com sidebar fixa/recolhivel, topbar compacta sem seletor global de mes, cards sobrios, tabelas densas e componentes reutilizaveis como `MoneyCard`, `SectionCard`, `DataTable`, `EmptyState`, `ConfirmDialog`, `MoneyInput`, `ComboboxCreate`, `AppButton` e `StatusBadge`.

Filtros de periodo agora ficam somente nas telas que precisam deles:

- Lancamentos: filtro local por periodo/categoria/metodo/tipo.
- Orcamento: seletor local de mes.
- Relatorios: filtros locais de periodo e agrupamento.
- Dividendos: filtro de periodo proprio quando aplicavel.
- Painel, Cartoes, Investimentos e Exterior/Dolar exibem dados continuos/atuais por padrao.

## Telas

- Painel.
- Lancamentos.
- Orcamento.
- Cartoes.
- Investimentos.
- Dividendos.
- Exterior/Dolar.
- Relatorios.
- Configuracoes.
- Integracoes.

## Rotas principais

- `GET /api/dashboard/resumo`
- `GET /api/dashboard/conciliacao`
- `POST /api/lancamentos`
- `GET /api/cartoes`
- `POST /api/compromissos-cartao/{id}/separar`
- `POST /api/cartoes/{id}/pagar-fatura`
- `GET /api/orcamentos`
- `POST /api/orcamentos/alterar`
- `GET /api/investimentos/posicoes`
- `GET /api/dividendos/ativos-disponiveis`
- `GET /api/exterior-dolar/resumo`
- `GET /api/exterior-dolar/extrato`
- `POST /api/exterior-dolar/movimentos`
- `POST /api/exterior-dolar/informar-saldo`
- `GET /api/configuracoes/diagnostico`
- `GET /health`

## Diagnostico

Em Configuracoes > Diagnostico, o app mostra status do backend, porta atual, caminho do banco e pastas de dados/logs. Tambem ha botoes para abrir a pasta de dados e a pasta de logs no Windows.

## Pendencias tecnicas

- O instalador Tauri nao foi gerado nesta maquina porque `cargo` nao esta instalado no PATH.
- Para gerar o instalador final, instale Rust/Cargo e execute `npm run package:windows`.
- A assinatura/codigo de publicacao do instalador ainda nao foi configurada.
