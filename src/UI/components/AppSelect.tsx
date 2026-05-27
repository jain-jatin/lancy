import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  headerVariant?: boolean;
  placeholder?: string;
}

export function AppSelect({ value, onChange, options, className = "", headerVariant = false, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? options[0];
  const displayText = (value === "all" && placeholder) ? placeholder : selected.label;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const triggerClass = headerVariant
    ? "inline-flex items-center gap-1 cursor-pointer outline-none text-[20px] font-extrabold tracking-tight text-[#1A1A2E] leading-tight bg-transparent border-0 p-0"
    : "inline-flex items-center gap-1.5 h-9 pl-3 pr-2.5 rounded-[10px] bg-[#F5F5F4] border border-border text-[13px] font-semibold text-foreground outline-none cursor-pointer hover:bg-[#EFEFED] transition-colors whitespace-nowrap";

  const chevronSize = headerVariant ? 16 : 13;

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={triggerClass}
      >
        <span>{displayText}</span>
        <ChevronDown
          size={chevronSize}
          className={`text-muted-foreground transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown panel - rounded, soft shadow, no sharp edges */}
      {open && (
        <div className="absolute z-50 top-full mt-1.5 left-0 min-w-full bg-white border border-border rounded-[12px] shadow-[0_4px_20px_rgba(0,0,0,0.08)] overflow-hidden animate-fade-in">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3.5 py-2 text-[13px] transition-colors whitespace-nowrap ${
                o.value === value
                  ? "text-emerald-700 font-semibold bg-emerald-50"
                  : "text-foreground hover:bg-secondary font-medium"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
