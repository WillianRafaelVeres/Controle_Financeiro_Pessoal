import { Dialog } from "../../components/ui/dialog";

export function EditarOrcamentoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} title="Editar orçamento" onClose={onClose}>
      <p className="text-sm text-slate-600">A tabela permite salvar o valor do mês atual. O backend já preserva meses anteriores.</p>
    </Dialog>
  );
}

