import { MessageCircle, Grid3x3 } from "lucide-react";

export type Tab = "chat" | "rooms";

const tabs: { id: Tab; label: string; Icon: typeof MessageCircle }[] = [
  { id: "chat", label: "Lancy", Icon: MessageCircle },
  { id: "rooms", label: "Rooms", Icon: Grid3x3 },
];

export function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="bottom-nav bg-white border-t border-border" style={{ boxShadow: "0 -1px 0 #E8E5DF" }}>
      <div className="flex">
        {tabs.map(({ id, label, Icon }) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              data-tour={`nav-${id}`}
              className="flex-1 min-h-[46px] flex flex-col items-center justify-center gap-0.5 relative transition-colors"
              style={{ color: isActive ? "#059669" : "#7C7C8A" }}
            >
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
              <span className="text-[10px] font-semibold">{label}</span>
              {isActive && <span className="absolute bottom-0.5 h-[3px] w-[3px] rounded-full bg-emerald-600" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
