import { ReactNode } from "react";

export function LancyBubble({ children }: { children: ReactNode }) {
  return (
    <div className="animate-msg-in flex flex-col items-start max-w-[88%]">
      <div className="rounded-2xl rounded-bl-[4px] bg-white border border-border px-4 py-2.5 shadow-card text-[14px] leading-[1.45] whitespace-pre-line text-foreground">
        {children}
      </div>
    </div>
  );
}

export function MarcusBubble({ children }: { children: ReactNode }) {
  return (
    <div className="animate-msg-in flex justify-end">
      <div className="rounded-2xl rounded-br-[4px] bg-accent text-white px-4 py-2.5 text-[14px] leading-[1.45] max-w-[80%] font-medium">
        {children}
      </div>
    </div>
  );
}

export function HousekeeperBubble({ children, color }: { children: ReactNode; color: string; name?: string }) {
  return (
    <div className="animate-msg-in flex flex-col items-end max-w-[80%] self-end ml-auto">
      <div className="rounded-2xl rounded-br-[4px] px-4 py-2.5 text-[14px] leading-[1.45] text-white font-medium" style={{ backgroundColor: color }}>
        {children}
      </div>
    </div>
  );
}

export function LancyCard({ children, urgency = "normal" }: { children: ReactNode; urgency?: "urgent" | "warning" | "normal" }) {
  const borderColor = urgency === "urgent" ? "#EF4444" : urgency === "warning" ? "#F59E0B" : "#2A9D8F";
  return (
    <div className="animate-msg-in max-w-[88%]">
      <div
        className="rounded-[14px] bg-white border border-border shadow-card p-4"
        style={{ borderLeft: `3px solid ${borderColor}` }}
      >
        {children}
      </div>
    </div>
  );
}
