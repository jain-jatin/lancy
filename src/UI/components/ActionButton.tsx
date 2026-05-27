import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function ActionButton({
  children,
  variant = "secondary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  const base = "min-h-12 px-4 rounded-[12px] font-semibold text-[14px] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50";
  const variants: Record<Variant, string> = {
    primary: "bg-accent text-white",
    secondary: "bg-white text-foreground border border-border",
    ghost: "bg-secondary text-foreground border border-border",
    danger: "bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5]",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
