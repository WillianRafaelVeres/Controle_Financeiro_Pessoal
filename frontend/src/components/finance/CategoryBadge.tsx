import { Badge } from "../ui/badge";

export function CategoryBadge({ children }: { children: string }) {
  return <Badge tone="blue">{children}</Badge>;
}

