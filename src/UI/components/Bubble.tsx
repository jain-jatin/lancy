import { ReactNode, Fragment } from "react";

export function formatMessageText(text: string): ReactNode {
  if (typeof text !== "string") return text;
  
  const lines = text.split("\n");
  
  return (
    <Fragment>
      {lines.map((line, lineIdx) => {
        // Check if the line is a bullet item (starts with "- " or "* ")
        const isBullet = line.trim().startsWith("-");
        const cleanLine = isBullet ? line.trim().substring(1).trim() : line;
        
        // Parse bold elements in the line
        const parts = cleanLine.split("**");
        const renderedLine = parts.map((part, partIdx) => {
          // Odd indices are bolded
          if (partIdx % 2 === 1) {
            return <strong key={partIdx} className="font-bold">{part}</strong>;
          }
          return part;
        });

        const lineContent = (
          <Fragment key={lineIdx}>
            {renderedLine}
          </Fragment>
        );

        if (isBullet) {
          return (
            <div key={lineIdx} className="flex items-start gap-1.5 ml-2 my-0.5 text-left">
              <span className="text-muted-foreground select-none">•</span>
              <span className="flex-1">{lineContent}</span>
            </div>
          );
        }

        return (
          <div key={lineIdx} className="min-h-[1.25em] text-left">
            {lineContent}
          </div>
        );
      })}
    </Fragment>
  );
}

export function LancyBubble({ children }: { children: ReactNode }) {
  const content = typeof children === "string" ? formatMessageText(children) : children;
  return (
    <div className="animate-msg-in flex flex-col items-start max-w-[88%]">
      <div className="rounded-2xl rounded-bl-[4px] bg-white border border-border px-4 py-2.5 shadow-card text-[14px] leading-[1.45] text-foreground">
        {content}
      </div>
    </div>
  );
}

export function MarcusBubble({ children }: { children: ReactNode }) {
  const content = typeof children === "string" ? formatMessageText(children) : children;
  return (
    <div className="animate-msg-in flex justify-end">
      <div className="rounded-2xl rounded-br-[4px] bg-accent text-white px-4 py-2.5 text-[14px] leading-[1.45] max-w-[80%] font-medium">
        {content}
      </div>
    </div>
  );
}

export function HousekeeperBubble({ children, color }: { children: ReactNode; color: string; name?: string }) {
  const content = typeof children === "string" ? formatMessageText(children) : children;
  return (
    <div className="animate-msg-in flex flex-col items-end max-w-[80%] self-end ml-auto">
      <div className="rounded-2xl rounded-br-[4px] px-4 py-2.5 text-[14px] leading-[1.45] text-white font-medium" style={{ backgroundColor: color }}>
        {content}
      </div>
    </div>
  );
}

export function LancyCard({ children, urgency = "normal" }: { children: ReactNode; urgency?: "urgent" | "warning" | "normal" }) {
  return (
    <div className="animate-msg-in max-w-[88%]">
      <div
        className="rounded-[14px] bg-white border border-border shadow-card p-4"
        style={{ borderLeft: `3px solid ${urgency === "urgent" ? "#EF4444" : urgency === "warning" ? "#F59E0B" : "#2A9D8F"}` }}
      >
        {children}
      </div>
    </div>
  );
}
