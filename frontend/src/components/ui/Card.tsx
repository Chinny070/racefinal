import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padded?: boolean;
}

export function Card({ children, padded = true, className = "", ...rest }: CardProps) {
  return (
    <div
      className={`bg-snow border border-cloud rounded-[36px] ${padded ? "p-7" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SubtleCard({ children, padded = true, className = "", ...rest }: CardProps) {
  return (
    <div
      className={`bg-[#fafafa] rounded-[36px] ${padded ? "p-7" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
