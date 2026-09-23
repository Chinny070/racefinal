import { Badge } from "../ui/Badge";
import { CONTEST_STATUS, STATUS_LABEL } from "../../lib/constants";

export function StatusBadge({ status }: { status: number }) {
  const label = STATUS_LABEL[status] ?? "Unknown";

  if (status === CONTEST_STATUS.MATCHED) {
    return <Badge variant="accent">{label}</Badge>;
  }
  if (status === CONTEST_STATUS.SETTLED_A || status === CONTEST_STATUS.SETTLED_B || status === CONTEST_STATUS.TIE) {
    return <Badge variant="dark">{label}</Badge>;
  }
  if (status === CONTEST_STATUS.CANCELLED || status === CONTEST_STATUS.REFUNDED) {
    return <Badge variant="filled">{label}</Badge>;
  }
  return <Badge variant="outline">{label}</Badge>;
}
