import type { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return <main className="max-w-[1200px] mx-auto px-6 py-16">{children}</main>;
}
