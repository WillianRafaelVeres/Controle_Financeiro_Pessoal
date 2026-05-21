import { Dialog } from "../../components/ui/dialog";

export function SepararCompromissoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} title="Separar compromisso" onClose={onClose}>
      <p className="text-sm text-slate-600">Use a linha do compromisso para separar uma parte e afetar o orçamento do mês.</p>
    </Dialog>
  );
}

