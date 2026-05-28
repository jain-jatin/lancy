import { useState, useEffect } from "react";
import { X, Clock, User, CheckCircle2, ChevronRight, Zap } from "lucide-react";
import { Room, statusTag, statusLabel, Housekeeper } from "@/simulation/data";
import { lancyService } from "@/Backend/services/lancy-service";
import { continuingRooms } from "@/simulation/engine";
import { toast } from "sonner";

interface Props {
  room: Room;
  onClose: () => void;
  onUpdateLancy: (msg: string) => void;
  onUpdateRoomStatus: (number: string, status: Room["status"], updates?: Partial<Room>) => void;
}

export function RoomDetail({ room, onClose, onUpdateLancy, onUpdateRoomStatus }: Props) {
  const [hkList, setHkList] = useState<Housekeeper[]>([]);
  const [roomsList, setRoomsList] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLiveState = async () => {
    setLoading(true);
    const hks = await lancyService.getHousekeepers();
    const rms = await lancyService.getRooms();
    setHkList(hks);
    setRoomsList(rms);
    setLoading(false);
  };

  useEffect(() => {
    fetchLiveState();
  }, [room.number, room.attendant]);

  const hkName = room.attendant;
  const hk = hkList.find((h) => h.name === hkName);

  let queuePosition = 0;
  let scheduledStart = "10:00 AM";
  let expectedCompletion = "10:25 AM";

  if (hk) {
    const queueIndex = hk.rooms.indexOf(room.number);
    queuePosition = queueIndex + 1;

    let currentMins = 600; // 10:00 AM
    for (let i = 0; i <= queueIndex; i++) {
      const rNum = hk.rooms[i];
      const rObj = roomsList.find((r) => r.number === rNum);
      const rType = rObj ? rObj.type : "STD";
      const duration = rType === "STE" ? 45 : rType === "DLX" ? 35 : 25;

      if (i === queueIndex) {
        scheduledStart = formatMins(currentMins);
        expectedCompletion = formatMins(currentMins + duration);
      }
      currentMins += duration;
    }
  }

  function formatMins(mins: number): string {
    const h = Math.floor(mins / 60) % 12 || 12;
    const m = String(mins % 60).padStart(2, "0");
    const ampm = Math.floor(mins / 60) >= 12 ? "PM" : "AM";
    return `${h}:${m} ${ampm}`;
  }

  const handleReassign = async (newHkName: string) => {
    await lancyService.assignHousekeeperRoom(newHkName, room.number);
    toast.success(`Room ${room.number} reassigned to ${newHkName}`);
    onUpdateRoomStatus(room.number, room.status, { attendant: newHkName });
    await fetchLiveState();
  };

  const handleMoveToTop = async () => {
    if (!hkName) return;
    await lancyService.moveRoomToTop(hkName, room.number);
    toast.success(`Room ${room.number} moved to top of ${hkName}'s queue`);
    onUpdateRoomStatus(room.number, room.status, { attendant: hkName });
    await fetchLiveState();
  };

  return (
    <>
      <div className="absolute inset-0 z-40 bg-black/30 animate-fade-in" onClick={onClose} />
      <div className="absolute left-0 right-0 bottom-0 z-50 bg-[#EFEDE8] rounded-t-[24px] animate-slide-up max-h-[85%] flex flex-col shadow-2xl border-t border-border/30 overflow-hidden">
        {/* Header Block */}
        <div className="px-5 pt-5 pb-4 bg-white border-b border-[#E8E5DF] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-extrabold uppercase tracking-widest">
              <span>Room {room.type}</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/35" />
              <span>Floor {room.floor}</span>
            </div>
            <h1 className="text-[28px] font-extrabold text-[#1A1A2E] tracking-tight mt-0.5 leading-none">{room.number}</h1>
            <span className={`mt-2.5 inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold ${statusTag[room.status]} shadow-sm`}>
              {statusLabel[room.status]}
            </span>
          </div>
          <button onClick={onClose} className="h-10 w-10 rounded-full bg-[#EFEDE8] hover:bg-secondary flex items-center justify-center transition-all active:scale-95 shadow-sm">
            <X size={18} className="text-[#1A1A2E]" />
          </button>
        </div>

        {/* Content Block */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground text-[13px] font-medium">Loading live room data...</div>
          ) : (
            <>
              {/* DIRTY & CLEANING FLOW */}
              {(room.status === "dirty" || room.status === "cleaning") && (
                <div className="space-y-4">
                  {/* Assigner Panel */}
                  <div className="rounded-[18px] bg-white border border-[#E8E5DF] p-4 shadow-sm space-y-3.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">Assigned Attendant</label>
                      <div className="relative">
                        <select
                          value={hkName || ""}
                          onChange={(e) => handleReassign(e.target.value)}
                          className="w-full h-11 px-3.5 rounded-xl border border-[#E8E5DF] bg-[#F8F7F4] text-[13px] font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all appearance-none cursor-pointer"
                        >
                          <option value="" disabled>Select Housekeeper</option>
                          {hkList.map((h) => (
                            <option key={h.name} value={h.name}>{h.name}</option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground font-bold">▼</div>
                      </div>
                    </div>

                    {hkName && (
                      <div className="pt-2 border-t border-[#F3F2EF] space-y-2.5">
                        <div className="flex justify-between items-center text-[12.5px]">
                          <span className="text-muted-foreground font-medium flex items-center gap-1.5">🕒 Scheduled Start:</span>
                          <span className="font-bold text-[#1A1A2E]">{scheduledStart}</span>
                        </div>
                        <div className="flex justify-between items-center text-[12.5px]">
                          <span className="text-muted-foreground font-medium flex items-center gap-1.5">⏱️ Expected Completion:</span>
                          <span className="font-bold text-[#1A1A2E]">{expectedCompletion}</span>
                        </div>
                        <div className="flex justify-between items-center text-[12.5px]">
                          <span className="text-muted-foreground font-medium flex items-center gap-1.5">🔢 Queue Position:</span>
                          <span className="font-bold text-[#1A1A2E]">{queuePosition} of {hk.rooms.length} ({hkName})</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Move to Top Button */}
                  {hkName && queuePosition > 1 && (
                    <button
                      onClick={handleMoveToTop}
                      className="w-full h-12 bg-white hover:bg-emerald-50 border border-[#E8E5DF] hover:border-emerald-500/30 text-[13px] font-bold text-emerald-700 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-sm"
                    >
                      <Zap size={14} className="fill-emerald-600 text-emerald-600" />
                      Move to Top of Queue (Next Room)
                    </button>
                  )}
                </div>
              )}

              {/* READY FLOW */}
              {room.status === "ready" && (
                <div className="rounded-[18px] bg-white border border-[#E8E5DF] p-5 shadow-sm flex flex-col items-center text-center space-y-3">
                  <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center">
                    <CheckCircle2 className="text-[#10B981]" size={28} />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-extrabold text-[#1A1A2E]">Room Cleaned &amp; Ready</h3>
                    <p className="text-[12px] text-muted-foreground mt-1 max-w-[80%] mx-auto">This room is cleared and fully sanitized for upcoming guest arrival.</p>
                  </div>
                  <div className="w-full pt-3 border-t border-[#F3F2EF] grid grid-cols-2 gap-4 text-left">
                    <div>
                      <div className="text-[10px] font-bold text-muted-foreground uppercase">Attendant</div>
                      <div className="text-[13px] font-bold text-[#1A1A2E] mt-0.5">{room.cleaned_by || room.attendant || "Sofia"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-muted-foreground uppercase">Completed At</div>
                      <div className="text-[13px] font-bold text-[#1A1A2E] mt-0.5">{room.ready_at || "10:35 AM"}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* OCCUPIED FLOW */}
              {room.status === "occupied" && (
                <div className="rounded-[18px] bg-white border border-[#E8E5DF] p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                      <User className="text-[#3B82F6]" size={20} />
                    </div>
                    <div>
                      <h3 className="text-[14px] font-bold text-[#1A1A2E]">{continuingRooms.includes(room.number) ? "VIP Continuing Guest" : "Stayover Guest"}</h3>
                      <p className="text-[11px] text-muted-foreground">Guest currently registered in room.</p>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-[#F3F2EF] space-y-2">
                    <div className="flex justify-between items-center text-[12.5px]">
                      <span className="text-muted-foreground font-medium">Checkout Schedule:</span>
                      <span className="font-bold text-[#1A1A2E]">{continuingRooms.includes(room.number) ? "Continuing stayover" : "10:00 AM standard"}</span>
                    </div>
                    <div className="flex justify-between items-center text-[12.5px]">
                      <span className="text-muted-foreground font-medium">Housekeeper:</span>
                      <span className="font-bold text-[#1A1A2E]">{room.attendant || "None assigned"}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
