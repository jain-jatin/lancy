import { useState } from "react";
import { statusDot, statusLabel } from "@/simulation/data";
import { RoomChip } from "./RoomChip";
import type { Room } from "@/simulation/data";

const statusFilters = [
  { value: "all", label: "All", color: "bg-emerald-600 border-emerald-600 text-white" },
  { value: "dirty", label: "Dirty", color: "bg-[#F87171] border-[#F87171] text-white" },
  { value: "cleaning", label: "Cleaning", color: "bg-[#818CF8] border-[#818CF8] text-white" },
  { value: "ready", label: "Ready", color: "bg-[#34D399] border-[#34D399] text-white" },
  { value: "occupied", label: "Occupied", color: "bg-[#60A5FA] border-[#60A5FA] text-white" },
];

export function RoomsView({ onSelectRoom, roomsList }: { onSelectRoom: (r: Room) => void; roomsList: Room[] }) {
  const [filter, setFilter] = useState<string>("all");

  const filtered = roomsList.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    return true;
  });

  const byFloor = filtered.reduce<Record<number, Room[]>>((acc, r) => {
    (acc[r.floor] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#EFEDE8]">
      {/* Sticky Pill Filters Row */}
      <div className="px-4 py-2.5 flex flex-col gap-2 border-b border-border bg-white shadow-sm shrink-0 sticky top-0 z-20">
        {/* Row 1: Status Filters */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar scroll-smooth">
          {statusFilters.map((f) => {
            const isActive = filter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-all active:scale-[0.96] whitespace-nowrap shrink-0 ${
                  isActive
                    ? f.color
                    : "bg-[#F3F2EF] border-[#E8E5DF] text-muted-foreground hover:bg-[#E8E5DF]"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid container taking remaining height */}
      <div className="flex-1 overflow-y-auto px-5 pt-3.5 pb-3 space-y-4">
        {Object.keys(byFloor).sort().map((floor) => (
          <div key={floor}>
            <div className="text-[9.5px] font-extrabold text-muted-foreground uppercase tracking-wider mb-1.5 pl-0.5">Floor {floor}</div>
            <div className="grid grid-cols-5 gap-3.5">
              {byFloor[Number(floor)].map((r) => (
                <RoomChip key={r.number} room={r} onClick={() => onSelectRoom(r)} />
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center text-muted-foreground text-[13px] py-12">No rooms match this filter.</div>
        )}
      </div>

      {/* Premium Legends Panel at bottom */}
      <div className="shrink-0 px-4 py-2.5 bg-transparent border-t border-[#E8E5DF]/50 flex flex-col gap-2 text-[10px] font-semibold text-muted-foreground/80">
        {/* State Legends */}
        <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 items-center justify-center">
          <span className="text-[8.5px] font-extrabold uppercase tracking-widest text-[#7C7C8A] mr-0.5">States</span>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#F87171]" />
            <span className="text-[10.5px] font-bold text-foreground/85">Dirty</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#818CF8]" />
            <span className="text-[10.5px] font-bold text-foreground/85">Cleaning</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#34D399]" />
            <span className="text-[10.5px] font-bold text-foreground/85">Ready</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#60A5FA]" />
            <span className="text-[10.5px] font-bold text-foreground/85">Occupied</span>
          </div>
        </div>

        {/* Room Type Legends */}
        <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 items-center justify-center border-t border-[#E8E5DF]/40 pt-2">
          <span className="text-[8.5px] font-extrabold uppercase tracking-widest text-[#7C7C8A] mr-0.5">Types</span>
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-extrabold bg-[#E8E5DF] px-1 py-0.5 rounded uppercase tracking-wider text-foreground leading-none">STD</span>
            <span className="text-[10.5px] font-bold text-foreground/85">Standard</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-extrabold bg-[#E8E5DF] px-1 py-0.5 rounded uppercase tracking-wider text-foreground leading-none">DLX</span>
            <span className="text-[10.5px] font-bold text-foreground/85">Deluxe</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-extrabold bg-[#E8E5DF] px-1 py-0.5 rounded uppercase tracking-wider text-foreground leading-none">STE</span>
            <span className="text-[10.5px] font-bold text-foreground/85">Suite</span>
          </div>
        </div>
      </div>
    </div>
  );
}
