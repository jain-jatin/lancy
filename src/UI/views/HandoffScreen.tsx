import { Check, AlertCircle, X } from "lucide-react";
import { ActionButton } from "@/UI/components/ActionButton";

const items: { kind: "ok" | "warn"; text: string }[] = [
  { kind: "ok", text: "19 of 23 rooms turned" },
  { kind: "ok", text: "VIP Room 501 ready by 1:47pm" },
  { kind: "ok", text: "Maintenance ticket resolved · Room 312" },
  { kind: "warn", text: "4 rooms carried over · 201, 208, 301, 312" },
  { kind: "warn", text: "Open ticket · Room 215 shower head" },
];

export function HandoffScreen({ onClose, onSend }: { onClose: () => void; onSend: () => void }) {
  return (
    <div className="absolute inset-0 z-40 bg-background animate-slide-up flex flex-col">
      <div className="px-5 pt-5 pb-4 bg-white border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] text-muted-foreground label-track uppercase font-medium">Prepared by Lancy</div>
            <h1 className="text-[20px] font-semibold tracking-tight text-foreground">Shift summary</h1>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
        {items.map(({ kind, text }) => (
          <div key={text} className="rounded-[14px] bg-white border border-border shadow-card p-4 flex items-start gap-3 text-[13px]"
               style={{ borderLeft: `3px solid ${kind === "ok" ? "#10B981" : "#F59E0B"}` }}>
            <span
              className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: kind === "ok" ? "#D1FAE5" : "#FEF3C7", color: kind === "ok" ? "#065F46" : "#92400E" }}
            >
              {kind === "ok" ? <Check size={14} strokeWidth={2.5} /> : <AlertCircle size={14} strokeWidth={2.5} />}
            </span>
            <span className="font-medium leading-snug pt-0.5 text-foreground">{text}</span>
          </div>
        ))}
      </div>
      <div className="p-4 bg-white border-t border-border">
        <ActionButton variant="primary" className="w-full" onClick={onSend}>
          Send to evening supervisor
        </ActionButton>
      </div>
    </div>
  );
}
