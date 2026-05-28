import { Room, statusDot, statusBorder } from "@/simulation/data";
import { Zap, AlertTriangle, Wrench } from "lucide-react";

export function RoomChip({ room, onClick }: { room: Room & { damageReported?: boolean; tvIssue?: boolean; isBlocked?: boolean }; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`aspect-square w-full rounded-[10px] bg-white border ${statusBorder[room.status]} flex flex-col items-center justify-between py-2 px-1 active:scale-[0.97] transition-all duration-150 relative shadow-sm`}
    >
      <div className="w-full flex items-center justify-between px-1 shrink-0">
        <span className="text-[7.5px] font-extrabold text-muted-foreground/80 tracking-wider uppercase leading-none">{room.type}</span>
      </div>

      <span className="text-[15px] font-extrabold text-[#1A1A2E] leading-none my-0.5">{room.number}</span>

      <div className="w-full flex items-center justify-between px-1 shrink-0 leading-none">
        <div className="flex gap-0.5 items-center">
          {room.damageReported && (
            <AlertTriangle size={8} className="text-red-500 fill-red-500 animate-pulse" />
          )}
          {(room.tvIssue || room.isBlocked) && (
            <Wrench size={8} className="text-[#6B7280]" />
          )}
        </div>
        <span className={`h-2 w-2 rounded-full ${statusDot[room.status]} shadow-sm`} />
      </div>
    </button>
  );
}
