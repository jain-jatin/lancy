import { useEffect, useState, useLayoutEffect } from "react";
import { X } from "lucide-react";

interface Step {
  selector: string;
  title: string;
  body: string;
  placement?: "top" | "bottom";
}

const steps: Step[] = [
  { selector: "[data-tour='nav-chat']", title: "Talk to Lancy", body: "Chat with Lancy to plan the shift, assign rooms, and stay on top of the day.", placement: "top" },
  { selector: "[data-tour='nav-rooms']", title: "See all rooms", body: "Tap any room to see who is working on it and how long they have been there.", placement: "top" },
  { selector: "[data-tour='nav-cleaner']", title: "Act as a housekeeper", body: "Switch into a housekeeper's view to simulate their workflow and chat as them.", placement: "top" },
  { selector: "[data-tour='simulate']", title: "Simulate the day", body: "Pick a time and tap Simulate to jump to that point, housekeepers and rooms update to match.", placement: "bottom" },
];

interface Props {
  onFinish: () => void;
  onStepChange?: (index: number) => void;
}

export function Tour({ onFinish, onStepChange }: Props) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => { onStepChange?.(i); }, [i, onStepChange]);

  useLayoutEffect(() => {
    const update = () => {
      const el = document.querySelector(steps[i].selector) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => setRect(el.getBoundingClientRect()), 220);
      } else {
        setRect(null);
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [i]);

  const step = steps[i];
  const next = () => (i === steps.length - 1 ? onFinish() : setI(i + 1));

  let tipTop = 0;
  let tipLeft = 16;
  if (rect) {
    const placement = step.placement ?? "bottom";
    tipLeft = Math.max(12, Math.min(window.innerWidth - 280 - 12, rect.left));
    tipTop = placement === "bottom" ? rect.bottom + 12 : rect.top - 12 - 140;
  }

  return (
    <div className="fixed inset-0 z-[100] animate-fade-in">
      <div className="absolute inset-0 bg-black/55" onClick={next} />

      {rect && (
        <div
          className="absolute rounded-[12px] pointer-events-none transition-all duration-200"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 2px rgba(255,255,255,0.9)",
            background: "transparent",
          }}
        />
      )}

      <button
        onClick={onFinish}
        className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/15 text-white flex items-center justify-center backdrop-blur"
        aria-label="Skip tour"
      >
        <X size={16} />
      </button>

      <div
        className="absolute w-[280px] rounded-[14px] bg-white shadow-card p-4 animate-msg-in"
        style={{ top: rect ? tipTop : 120, left: rect ? tipLeft : 16 }}
      >
        <div className="flex items-start justify-between">
          <div className="text-[14px] font-semibold text-foreground leading-tight">{step.title}</div>
          <div className="text-[10px] text-muted-foreground label-track shrink-0 ml-2">{i + 1} of {steps.length}</div>
        </div>
        <div className="text-[13px] text-muted-foreground mt-1.5 leading-snug">{step.body}</div>
        <div className="mt-3 flex justify-end">
          <button onClick={next} className="h-9 px-4 rounded-[10px] bg-accent text-white text-[13px] font-semibold">
            {i === steps.length - 1 ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
