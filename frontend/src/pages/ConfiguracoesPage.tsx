import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, DatabaseBackup, Plus, Trash2 } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";

import { EmptyState } from "../components/finance/EmptyState";
import { MoneyInput } from "../components/finance/MoneyInput";
import { SectionCard } from "../components/finance/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Td, Th, Table } from "../components/ui/table";
import { api } from "../lib/api";
import { formatMoney } from "../lib/formatters";
import type { Categoria, MetodoPagamento, NaturezaCategoria, Subcategoria, TipoMetodo } from "../lib/types";
import { cn } from "../lib/utils";

type TabKey = "categorias" | "subcategorias" | "metodos" | "contas" | "cartoes" | "aparencia" | "backup" | "diagnostico";
type CategoriaSort = { campo: "nome" | "natureza"; direcao: "asc" | "desc" };

export function ConfiguracoesPage() {
  const queryClient = useQueryClient();
  const categorias = useQuery({ queryKey: ["categorias", "ativas"], queryFn: () => api.categorias() });
  const subcategorias = useQuery({ queryKey: ["subcategorias", "ativas"], queryFn: () => api.subcategorias() });
  const metodos = useQuery({ queryKey: ["metodos"], queryFn: api.metodos });
  const contas = useQuery({ queryKey: ["contas"], queryFn: () => api.contas() });
  const cartoes = useQuery({ queryKey: ["cartoes"], queryFn: api.cartoes });
  const diagnostico = useQuery({ queryKey: ["diagnostico"], queryFn: api.diagnostico });
  const invalidate = () => queryClient.invalidateQueries();
  const mutations = {
    categoria: useMutation({ mutationFn: api.criarCategoria, onSuccess: invalidate }),
    subcategoria: useMutation({ mutationFn: api.criarSubcategoria, onSuccess: invalidate }),
    metodo: useMutation({ mutationFn: api.criarMetodo, onSuccess: invalidate }),
    conta: useMutation({ mutationFn: api.criarConta, onSuccess: invalidate }),
    cartao: useMutation({ mutationFn: api.criarCartao, onSuccess: invalidate }),
    inativarCategoria: useMutation({ mutationFn: api.inativarCategoria, onSuccess: invalidate }),
    inativarSubcategoria: useMutation({ mutationFn: api.inativarSubcategoria, onSuccess: invalidate }),
    inativarMetodo: useMutation({ mutationFn: api.inativarMetodo, onSuccess: invalidate }),
    inativarConta: useMutation({ mutationFn: api.inativarConta, onSuccess: invalidate }),
    inativarCartao: useMutation({ mutationFn: api.inativarCartao, onSuccess: invalidate }),
    exportar: useMutation({ mutationFn: api.exportarBackup }),
  };
  const [modal, setModal] = useState<TabKey | null>(null);
  const [backup, setBackup] = useState("");
  const [categoriaPadraoSubcategoria, setCategoriaPadraoSubcategoria] = useState<string | undefined>();
  const [ordenacaoCategorias, setOrdenacaoCategorias] = useState<CategoriaSort>({ campo: "nome", direcao: "asc" });

  const categoriasVisiveis = useMemo(
    () => (categorias.data ?? []).filter((item) => item.ativa),
    [categorias.data],
  );
  const subcategoriasVisiveis = useMemo(
    () => (subcategorias.data ?? []).filter((item) => item.ativa),
    [subcategorias.data],
  );
  const categoriasOrdenadas = useMemo(() => {
    const naturezaPeso: Record<NaturezaCategoria, number> = { GASTO: 1, RECEITA: 2, INVESTIMENTO: 3 };
    const direcao = ordenacaoCategorias.direcao === "asc" ? 1 : -1;

    return [...categoriasVisiveis].sort((a, b) => {
      if (ordenacaoCategorias.campo === "natureza") {
        const naturezaA = a.natureza ?? "GASTO";
        const naturezaB = b.natureza ?? "GASTO";
        const comparacaoNatureza = (naturezaPeso[naturezaA] - naturezaPeso[naturezaB]) * direcao;
        if (comparacaoNatureza !== 0) return comparacaoNatureza;
      }

      return a.nome.localeCompare(b.nome, "pt-BR") * direcao;
    });
  }, [categoriasVisiveis, ordenacaoCategorias]);
  const subcategoriasPorCategoria = useMemo(() => {
    const grupos = subcategoriasVisiveis.reduce<Record<string, Subcategoria[]>>((acc, item) => {
      if (!acc[item.categoria_id]) acc[item.categoria_id] = [];
      acc[item.categoria_id].push(item);
      return acc;
    }, {});

    Object.values(grupos).forEach((items) => items.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    return grupos;
  }, [subcategoriasVisiveis]);
  const metodosPagamento = useMemo(
    () => (metodos.data ?? []).filter((item) => item.ativo && item.tipo_metodo !== "CARTAO_CREDITO"),
    [metodos.data],
  );

  function alterarOrdenacaoCategorias(campo: CategoriaSort["campo"]) {
    setOrdenacaoCategorias((atual) =>
      atual.campo === campo ? { campo, direcao: atual.direcao === "asc" ? "desc" : "asc" } : { campo, direcao: "asc" },
    );
  }

  function abrirSubcategoria(categoriaId?: string) {
    setCategoriaPadraoSubcategoria(categoriaId);
    setModal("subcategorias");
  }

  function fecharModal() {
    setModal(null);
    setCategoriaPadraoSubcategoria(undefined);
  }

  return (
    <div className="space-y-2">
      <PageHeader title="Configuracoes" description="Cadastros locais, status e backup." />
      <Tabs defaultValue="categorias">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
          <TabsTrigger value="metodos">Metodos</TabsTrigger>
          <TabsTrigger value="contas">Contas</TabsTrigger>
          <TabsTrigger value="cartoes">Cartoes</TabsTrigger>
          <TabsTrigger value="aparencia">Aparencia</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="diagnostico">Diagnostico</TabsTrigger>
        </TabsList>

        <TabsContent value="categorias">
          <CategoriasSubcategoriasTable
            categorias={categoriasOrdenadas}
            subcategoriasPorCategoria={subcategoriasPorCategoria}
            ordenacao={ordenacaoCategorias}
            onSort={alterarOrdenacaoCategorias}
            onAddCategoria={() => setModal("categorias")}
            onAddSubcategoria={abrirSubcategoria}
            onDeleteCategoria={(id) => mutations.inativarCategoria.mutate(id)}
            onDeleteSubcategoria={(id) => mutations.inativarSubcategoria.mutate(id)}
          />
        </TabsContent>
        <TabsContent value="metodos">
          <MetodosPagamentoSettings
            metodos={metodosPagamento}
            onCreate={(nome) => mutations.metodo.mutateAsync({ nome })}
            onDelete={(id) => mutations.inativarMetodo.mutate(id)}
          />
        </TabsContent>
        <TabsContent value="contas">
          <ConfigTable
            title="Contas"
            description="Contas locais usadas para saldo e conciliacao."
            onAdd={() => setModal("contas")}
            headers={["Conta", "Banco", "Saldo inicial", "Acoes"]}
            empty="Nenhuma conta cadastrada."
            rows={(contas.data ?? []).map((item) => [
              item.nome,
              item.banco ?? "-",
              formatMoney(item.saldo_inicial),
              <RowActions onDelete={() => mutations.inativarConta.mutate(item.id)} />,
            ])}
          />
        </TabsContent>
        <TabsContent value="cartoes">
          <ConfigTable
            title="Cartoes"
            description="Cartoes de credito usados como metodo de pagamento."
            onAdd={() => setModal("cartoes")}
            headers={["Nome", "Instituicao", "Acoes"]}
            empty="Nenhum cartao cadastrado."
            rows={(cartoes.data ?? []).map((item) => [
              item.nome,
              item.instituicao ?? "-",
              <RowActions onDelete={() => mutations.inativarCartao.mutate(item.id)} />,
            ])}
          />
        </TabsContent>
        <TabsContent value="aparencia">
          <SectionCard title="Aparencia" description="Preferencias visuais locais para a versao desktop.">
            <div className="rounded-md bg-slate-950/60 p-3 text-[13px] text-slate-400">Tema escuro profissional ativo.</div>
          </SectionCard>
        </TabsContent>
        <TabsContent value="backup">
          <SectionCard title="Backup" description="Exportacao local do banco SQLite.">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={async () => {
                  const result = await mutations.exportar.mutateAsync();
                  setBackup(result.arquivo);
                }}
              >
                <DatabaseBackup className="h-4 w-4" />
                Exportar backup
              </Button>
              {backup && <p className="rounded-md bg-slate-950/60 px-3 py-2 text-[13px] text-slate-300">{backup}</p>}
            </div>
          </SectionCard>
        </TabsContent>
        <TabsContent value="diagnostico">
          <SectionCard title="Diagnostico" description="Status do backend local, banco e logs.">
            <div className="grid gap-3 lg:grid-cols-2">
              <DiagnosticLine label="Status" value={diagnostico.data?.status ?? "-"} />
              <DiagnosticLine label="Porta atual" value={diagnostico.data?.porta ?? "dev"} />
              <DiagnosticLine label="Banco SQLite" value={diagnostico.data?.banco ?? "-"} />
              <DiagnosticLine label="Pasta de dados" value={diagnostico.data?.pasta_dados ?? "-"} />
              <DiagnosticLine label="Pasta de logs" value={diagnostico.data?.pasta_logs ?? "-"} />
              <DiagnosticLine label="Pasta de backups" value={diagnostico.data?.pasta_backups ?? "-"} />
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
      <AddDialog
        modal={modal}
        onClose={fecharModal}
        categorias={(categorias.data ?? []).filter((item) => item.ativa)}
        categoriaPadraoSubcategoria={categoriaPadraoSubcategoria}
        onCreateCategoria={(payload) => mutations.categoria.mutateAsync(payload)}
        onCreateSubcategoria={(payload) => mutations.subcategoria.mutateAsync(payload)}
        onCreateMetodo={(payload) => mutations.metodo.mutateAsync(payload)}
        onCreateConta={(payload) => mutations.conta.mutateAsync(payload)}
        onCreateCartao={(payload) => mutations.cartao.mutateAsync(payload)}
      />
    </div>
  );
}

function ConfigTable({
  title,
  description,
  headers,
  rows,
  empty,
  onAdd,
  extraAction,
  beforeTable,
}: {
  title: string;
  description: string;
  headers: string[];
  rows: React.ReactNode[][];
  empty: string;
  onAdd: () => void;
  extraAction?: React.ReactNode;
  beforeTable?: React.ReactNode;
}) {
  return (
    <SectionCard
      title={title}
      description={description}
      action={
        <div className="flex flex-wrap gap-2">
          {extraAction}
          <Button size="sm" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </div>
      }
    >
      {beforeTable}
      {rows.length === 0 ? (
        <EmptyState title={empty} description="Use Adicionar para criar o primeiro item." />
      ) : (
        <Table>
          <thead>
            <tr>{headers.map((header) => <Th key={header}>{header}</Th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <Td key={cellIndex}>{cell}</Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </SectionCard>
  );
}

function MetodosPagamentoSettings({
  metodos,
  onCreate,
  onDelete,
}: {
  metodos: MetodoPagamento[];
  onCreate: (nome: string) => Promise<unknown>;
  onDelete: (id: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const cleanName = nome.trim();
    if (!cleanName) return;

    setSaving(true);
    try {
      await onCreate(cleanName);
      setNome("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Metodos de pagamento" description="Cadastre os nomes que aparecem nos lancamentos. Cartoes ficam na aba Cartoes.">
      <div className="grid gap-3 xl:grid-cols-[360px_minmax(0,1fr)]">
        <form className="rounded-md border border-slate-800 bg-slate-950/40 p-3" onSubmit={submit}>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Novo metodo</span>
            <Input value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Ex.: Pix, Boleto, Dinheiro" />
          </label>
          <Button className="mt-2 w-full" type="submit" disabled={saving || !nome.trim()}>
            <Plus className="h-4 w-4" />
            Adicionar metodo
          </Button>
        </form>

        <div className="overflow-hidden rounded-md border border-slate-800">
          <div className="border-b border-slate-800 bg-slate-900 px-3 py-2 text-[11px] font-semibold uppercase text-slate-400">
            Metodos cadastrados
          </div>
          {metodos.length === 0 ? (
            <div className="p-3">
              <EmptyState title="Nenhum metodo cadastrado." description="Adicione o primeiro metodo para usar nos lancamentos." />
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {metodos.map((metodo) => (
                <div key={metodo.id} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
                  <span className="truncate text-[14px] font-medium text-slate-100">{metodo.nome}</span>
                  <Button size="sm" variant="danger" className="h-7 px-2.5" onClick={() => onDelete(metodo.id)}>
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function CategoriasSubcategoriasTable({
  categorias,
  subcategoriasPorCategoria,
  ordenacao,
  onSort,
  onAddCategoria,
  onAddSubcategoria,
  onDeleteCategoria,
  onDeleteSubcategoria,
}: {
  categorias: Categoria[];
  subcategoriasPorCategoria: Record<string, Subcategoria[]>;
  ordenacao: CategoriaSort;
  onSort: (campo: CategoriaSort["campo"]) => void;
  onAddCategoria: () => void;
  onAddSubcategoria: (categoriaId?: string) => void;
  onDeleteCategoria: (id: string) => void;
  onDeleteSubcategoria: (id: string) => void;
}) {
  return (
    <SectionCard
      title="Categorias e subcategorias"
      description="Categorias principais com seus detalhes vinculados."
      action={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => onAddSubcategoria()}>
            <Plus className="h-4 w-4" />
            Subcategoria
          </Button>
          <Button size="sm" onClick={onAddCategoria}>
            <Plus className="h-4 w-4" />
            Categoria
          </Button>
        </div>
      }
    >
      {categorias.length === 0 ? (
        <EmptyState title="Nenhuma categoria cadastrada." description="Use Categoria para criar o primeiro item." />
      ) : (
        <Table className="min-w-[760px]">
          <thead>
            <tr>
              <Th className="w-[24%] px-4 text-center">
                <SortHeader label="Nome" campo="nome" ordenacao={ordenacao} onSort={onSort} align="center" />
              </Th>
              <Th className="w-[16%] px-4 text-center">
                <SortHeader label="Natureza" campo="natureza" ordenacao={ordenacao} onSort={onSort} align="center" />
              </Th>
              <Th className="px-4 text-center">Subcategorias</Th>
              <Th className="w-[136px] px-4 text-center">Acoes</Th>
            </tr>
          </thead>
          <tbody>
            {categorias.map((categoria) => {
              const subcategorias = subcategoriasPorCategoria[categoria.id] ?? [];

              return (
                <tr key={categoria.id} className="align-middle">
                  <Td className="px-4 py-3 text-center align-middle font-semibold text-slate-100">{categoria.nome}</Td>
                  <Td className="px-4 py-3 text-center align-middle">
                    <NaturezaBadge natureza={categoria.natureza ?? "GASTO"} />
                  </Td>
                  <Td className="px-4 py-2.5 align-middle">
                    <div className="grid max-w-[520px] gap-1.5">
                      {subcategorias.length === 0 ? (
                        <span className="text-[12px] text-slate-500">Sem subcategorias</span>
                      ) : (
                        <div className="overflow-hidden rounded-md border border-slate-800/80 bg-slate-950/20">
                          {subcategorias.map((subcategoria) => (
                            <div
                              key={subcategoria.id}
                              className="flex min-h-6 items-center justify-between gap-2 border-b border-slate-800/70 px-2.5 py-0.5 text-[13px] last:border-b-0"
                            >
                              <span className="truncate text-slate-200">{subcategoria.nome}</span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                title={`Excluir ${subcategoria.nome}`}
                                onClick={() => onDeleteSubcategoria(subcategoria.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button size="sm" variant="secondary" className="h-7 w-fit px-2 text-[12px]" onClick={() => onAddSubcategoria(categoria.id)}>
                        <Plus className="h-4 w-4" />
                        Subcategoria
                      </Button>
                    </div>
                  </Td>
                  <Td className="px-4 py-3 text-center align-middle">
                    <RowActions disabledDelete={categoria.nome === "Investimentos"} onDelete={() => onDeleteCategoria(categoria.id)} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </SectionCard>
  );
}

function SortHeader({
  label,
  campo,
  ordenacao,
  onSort,
  align = "left",
}: {
  label: string;
  campo: CategoriaSort["campo"];
  ordenacao: CategoriaSort;
  onSort: (campo: CategoriaSort["campo"]) => void;
  align?: "left" | "center";
}) {
  const active = ordenacao.campo === campo;

  return (
    <button
      type="button"
      onClick={() => onSort(campo)}
      className={cn(
        "flex w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase transition",
        align === "center" && "justify-center text-center",
        active ? "text-slate-100" : "text-slate-400 hover:text-slate-200",
      )}
    >
      {label}
      <ArrowUpDown className="h-3.5 w-3.5" />
      {active && <span className="text-[10px] text-slate-500">{ordenacao.direcao === "asc" ? "ASC" : "DESC"}</span>}
    </button>
  );
}

function RowActions({ onDelete, disabledDelete }: { onDelete: () => void; disabledDelete?: boolean }) {
  return (
    <div className="flex justify-center">
      <Button size="sm" variant="danger" className="h-7 px-2.5" onClick={onDelete} disabled={disabledDelete}>
        <Trash2 className="h-4 w-4" />
        Excluir
      </Button>
    </div>
  );
}

function NaturezaBadge({ natureza }: { natureza: NaturezaCategoria }) {
  return <Badge tone={natureza === "INVESTIMENTO" ? "blue" : natureza === "RECEITA" ? "green" : "neutral"}>{natureza}</Badge>;
}

function AddDialog({
  modal,
  onClose,
  categorias,
  categoriaPadraoSubcategoria,
  onCreateCategoria,
  onCreateSubcategoria,
  onCreateMetodo,
  onCreateConta,
  onCreateCartao,
}: {
  modal: TabKey | null;
  onClose: () => void;
  categorias: Array<{ id: string; nome: string; natureza?: NaturezaCategoria }>;
  categoriaPadraoSubcategoria?: string;
  onCreateCategoria: (payload: { nome: string; natureza: NaturezaCategoria }) => Promise<unknown>;
  onCreateSubcategoria: (payload: { nome: string; categoria_id: string }) => Promise<unknown>;
  onCreateMetodo: (payload: { nome: string; tipo_metodo?: TipoMetodo }) => Promise<unknown>;
  onCreateConta: (payload: Record<string, unknown>) => Promise<unknown>;
  onCreateCartao: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const title = modal ? `Adicionar ${labelFor(modal)}` : "";
  const categoriaSubcategoria = form.categoria_id ?? categoriaPadraoSubcategoria ?? "";

  function close() {
    setForm({});
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (modal === "categorias") await onCreateCategoria({ nome: form.nome, natureza: (form.natureza as NaturezaCategoria) || "GASTO" });
    if (modal === "subcategorias") await onCreateSubcategoria({ nome: form.nome, categoria_id: categoriaSubcategoria });
    if (modal === "metodos") await onCreateMetodo({ nome: form.nome });
    if (modal === "contas") await onCreateConta({ nome: form.nome, banco: form.banco, saldo_inicial: Number(form.saldo_inicial || 0), conta_gasto: true });
    if (modal === "cartoes") await onCreateCartao({ nome: form.nome, instituicao: form.instituicao });
    close();
  }

  return (
    <Dialog open={Boolean(modal)} title={title} onClose={close}>
      <form className="grid gap-3" onSubmit={submit}>
        {(modal === "categorias" || modal === "subcategorias" || modal === "metodos" || modal === "contas" || modal === "cartoes") && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Nome</span>
            <Input value={form.nome ?? ""} onChange={(event) => setForm({ ...form, nome: event.target.value })} required />
          </label>
        )}
        {modal === "categorias" && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Natureza</span>
            <Select value={form.natureza ?? "GASTO"} onChange={(event) => setForm({ ...form, natureza: event.target.value })}>
              <option value="GASTO">Gasto</option>
              <option value="RECEITA">Receita</option>
              <option value="INVESTIMENTO">Investimento</option>
            </Select>
          </label>
        )}
        {modal === "subcategorias" && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Categoria</span>
            <Select value={categoriaSubcategoria} onChange={(event) => setForm({ ...form, categoria_id: event.target.value })} required>
              <option value="">Selecione</option>
              {categorias.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome} ({item.natureza ?? "GASTO"})
                </option>
              ))}
            </Select>
          </label>
        )}
        {modal === "contas" && (
          <>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">Banco</span>
              <Input value={form.banco ?? ""} onChange={(event) => setForm({ ...form, banco: event.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">Saldo inicial</span>
              <MoneyInput value={form.saldo_inicial ?? ""} onChange={(event) => setForm({ ...form, saldo_inicial: event.target.value })} />
            </label>
          </>
        )}
        {modal === "cartoes" && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Instituicao</span>
            <Input value={form.instituicao ?? ""} onChange={(event) => setForm({ ...form, instituicao: event.target.value })} />
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit">Adicionar</Button>
        </div>
      </form>
    </Dialog>
  );
}

function labelFor(tab: TabKey) {
  return {
    categorias: "categoria",
    subcategorias: "subcategoria",
    metodos: "metodo",
    contas: "conta",
    cartoes: "cartao",
    aparencia: "aparencia",
    backup: "backup",
    diagnostico: "diagnostico",
  }[tab];
}

function DiagnosticLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2.5">
      <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
      <div className="mt-1 break-all text-[13px] font-medium text-slate-200">{value}</div>
    </div>
  );
}
