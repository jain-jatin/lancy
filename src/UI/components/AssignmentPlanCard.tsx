import { Zap } from "lucide-react";

export interface AssignmentPlanCardProps {
  onConfirm: () => void;
  onAdjust: () => void;
}

export function AssignmentPlanCard({ onConfirm, onAdjust }: AssignmentPlanCardProps) {
  const plan = [
    {
      hk: "Ana",
      color: "#818CF8",
      rooms: [
        { num: "203", type: "DLX", start: "10:00 AM", end: "10:35 AM" },
        { num: "201", type: "STD", start: "10:35 AM", end: "11:00 AM" },
        { num: "202", type: "STD", start: "11:00 AM", end: "11:25 AM" },
      ]
    },
    {
      hk: "Rosa",
      color: "#F472B6",
      rooms: [
        { num: "205", type: "STE", start: "10:00 AM", end: "10:45 AM" },
        { num: "204", type: "DLX", start: "10:45 AM", end: "11:20 AM" },
        { num: "301", type: "STD", start: "11:20 AM", end: "11:45 AM" },
      ]
    },
    {
      hk: "James",
      color: "#FBBF24",
      rooms: [
        { num: "303", type: "DLX", start: "10:00 AM", end: "10:35 AM" },
        { num: "304", type: "DLX", start: "10:35 AM", end: "11:10 AM" },
        { num: "302", type: "STD", start: "11:10 AM", end: "11:35 AM" },
      ]
    },
    {
      hk: "Priya",
      color: "#34D399",
      rooms: [
        { num: "305", type: "STE", start: "10:00 AM", end: "10:45 AM" },
        { num: "401", type: "STD", start: "10:45 AM", end: "11:10 AM" },
        { num: "402", type: "STD", start: "11:10 AM", end: "11:35 AM" },
      ]
    },
    {
      hk: "Sofia",
      color: "#2A9D8F",
      rooms: [
        { num: "505", type: "STE", start: "10:00 AM", end: "10:45 AM" },
        { num: "403", type: "DLX", start: "10:45 AM", end: "11:20 AM" },
        { num: "503", type: "DLX", start: "11:20 AM", end: "11:55 AM" },
      ]
    }
  ];

  return (
    <div className="max-w-[92%] rounded-[18px] bg-white border border-[#E8E5DF] shadow-md p-4 mt-2 mb-2 animate-fade-in space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-[#F3F2EF]">
        <div className="flex items-center gap-1.5">
          <Zap size={14} className="text-emerald-600 fill-emerald-600 animate-pulse" />
          <span className="text-[12px] font-extrabold text-emerald-800 uppercase tracking-widest">Shift Assignment Plan</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-extrabold bg-[#EFEDE8] px-2 py-0.5 rounded-full">15 Dirty Rooms</span>
      </div>
      <div className="space-y-4 max-h-[260px] overflow-y-auto pr-1 no-scrollbar">
        {plan.map((p) => (
          <div key={p.hk} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-[13px] font-extrabold text-foreground">{p.hk}</span>
            </div>
            <div className="grid grid-cols-1 gap-1.5 pl-4">
              {p.rooms.map((r) => (
                <div key={r.num} className="flex items-center justify-between text-[12px] bg-[#F8F7F4] rounded-xl p-2.5 border border-[#E8E5DF]">
                  <div>
                    <span className="font-extrabold text-foreground">Room {r.num}</span>
                    <span className="text-[9px] font-extrabold text-muted-foreground ml-2 bg-[#EFEDE8] px-1.5 py-0.5 rounded-md uppercase tracking-wider">{r.type}</span>
                  </div>
                  <div className="text-[11px] font-bold text-muted-foreground">
                    🕒 {r.start.replace(" AM", "")} - {r.end.replace(" AM", "")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-2">
        <button
          onClick={onConfirm}
          className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12.5px] font-extrabold active:scale-[0.97] transition-all shadow-sm"
        >
          Looks good, confirm
        </button>
        <button
          onClick={onAdjust}
          className="h-10 px-3.5 rounded-xl border border-[#E8E5DF] bg-white text-[12.5px] font-extrabold text-foreground active:scale-[0.97] hover:bg-[#F8F7F4] transition-all"
        >
          Go to Rooms
        </button>
      </div>
    </div>
  );
}
