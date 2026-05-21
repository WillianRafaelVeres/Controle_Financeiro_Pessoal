import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { Input } from "../ui/input";
import { Table } from "../ui/table";

interface DataTableProps<T> {
  data: T[];
  searchText: (item: T) => string;
  empty: ReactNode;
  children: (items: T[]) => ReactNode;
}

export function DataTable<T>({ data, searchText, empty, children }: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data;
    return data.filter((item) => searchText(item).toLowerCase().includes(normalized));
  }, [data, query, searchText]);

  return (
    <div className="space-y-2">
      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-500" />
        <Input className="pl-9" placeholder="Buscar" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {filtered.length === 0 ? empty : <Table>{children(filtered)}</Table>}
    </div>
  );
}
