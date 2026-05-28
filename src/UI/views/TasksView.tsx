import { useState } from "react";
import { Lock, Zap, Clock, User, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { Room, Housekeeper, statusDot, statusLabel } from "@/simulation/data";
import { timeToMinutes, minutesToTime, getHkColor } from "@/simulation/engine";
import { lancyService } from "@/Backend/services/lancy-service";
import { toast } from "sonner";

interface Props {
  roomsList: Room[];
  housekeepers: Housekeeper[];
  simTime: string;
  onUpdateRoomStatus: (number: string, status: Room["status"], updates?: Partial<Room>) => void;
  onRefreshState: () => Promise<void>;
}

export function TasksView({ roomsList, housekeepers, simTime, onUpdateRoomStatus, onRefreshState }: Props) {
  const [selectedHk, setSelectedHk] = useState<string>("All");
  const [reassigningRoom, setReassigningRoom] = useState<Room | null>(null);

  // Helper: Format t (e.g. "10:35") to "10:35 AM"
  function formatTimeStr(t: string | null | undefined): string {
    if (!t) return "10:00 AM";
    const [h, m] = t.split(":").map(Number);
    const hour = h % 12 || 12;
    const ampm = h >= 12 ? "PM" : "AM";
    return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
  }

  // Helper: Calculate remaining minutes or "Overdue"
  function getRemainingInfo(simTime: string, etaStr: string) {
    const simMins = timeToMinutes(simTime);
    const etaMins = timeToMinutes(etaStr);
    const diff = etaMins - simMins;
    if (diff <= 0) {
      return { text: "Overdue", isOverdue: true };
    }
    return { text: `${diff} mins`, isOverdue: false };
  }

  // Helper: Calculate Progress Bar Percent
  function getProgressPct(simTime: string, startStr: string | null | undefined, duration: number) {
    if (!startStr) return 0;
    const simMins = timeToMinutes(simTime);
    const startMins = timeToMinutes(startStr);
    const elapsed = simMins - startMins;
    if (elapsed <= 0) return 0;
    return Math.min(Math.round((elapsed / duration) * 100), 100);
  }

  // Handle reassigning housekeeper
  const handleReassignSelect = async (targetHkName: string) => {
    if (!reassigningRoom) return;
    const rNum = reassigningRoom.number;

    // Find target housekeeper's current queue
    const targetHk = housekeepers.find((h) => h.name === targetHkName);
    if (!targetHk) return;

    // Insert room based on priority: Suite first, Deluxe second, Standard third. Placed at the end of that type group.
    const filtered = (targetHk.rooms || []).filter((num) => num !== rNum);
    const suites: string[] = [];
    const deluxe: string[] = [];
    const standard: string[] = [];

    filtered.forEach((num) => {
      const rm = roomsList.find((r) => r.number === num);
      if (rm?.type === "STE") suites.push(num);
      else if (rm?.type === "DLX") deluxe.push(num);
      else standard.push(num);
    });

    if (reassigningRoom.type === "STE") {
      suites.push(rNum);
    } else if (reassigningRoom.type === "DLX") {
      deluxe.push(rNum);
    } else {
      standard.push(rNum);
    }

    const updatedRooms = [...suites, ...deluxe, ...standard];

    // Remove from other housekeeper queues
    for (const h of housekeepers) {
      if (h.name !== targetHkName && h.rooms.includes(rNum)) {
        const nextRooms = h.rooms.filter((num) => num !== rNum);
        await lancyService.updateHousekeeper(h.name, { rooms: nextRooms });
      }
    }

    // Update target housekeeper rooms
    await lancyService.updateHousekeeper(targetHkName, { rooms: updatedRooms });

    // Calculate new timings for target housekeeper's entire queue
    let currentMins = 600; // 10:00 AM start
    for (const num of updatedRooms) {
      const rm = roomsList.find((r) => r.number === num);
      const rType = rm ? rm.type : "STD";
      const duration = rType === "STE" ? 45 : rType === "DLX" ? 35 : 25;
      const start = currentMins;
      const end = currentMins + duration;

      await lancyService.updateRoomStatus(num, "dirty", {
        attendant: targetHkName,
        scheduled_start_time: minutesToTime(start),
        scheduled_end_time: minutesToTime(end),
      });

      currentMins = end;
    }

    toast.success(`Room ${rNum} reassigned to ${targetHkName}`);
    setReassigningRoom(null);
    onUpdateRoomStatus(rNum, "dirty", { attendant: targetHkName });
    await onRefreshState();
  };

  // Compile tasks
  const checkoutRooms = roomsList.filter((r) => r.attendant && (r.status === "dirty" || r.status === "cleaning" || r.status === "ready"));

  const filteredTasks = checkoutRooms.filter((t) => {
    if (selectedHk === "All") return true;
    return t.attendant === selectedHk;
  });

  // Group task lists by status
  const currentTasks = filteredTasks.filter((t) => t.status === "cleaning");
  const pastTasks = filteredTasks.filter((t) => t.status === "ready");

  // Sort upcoming tasks by priority: Suite -> Deluxe -> Standard, then by start time
  const upcomingTasks = filteredTasks
    .filter((t) => t.status === "dirty")
    .sort((a, b) => {
      const order: Record<string, number> = { STE: 0, DLX: 1, STD: 2 };
      const diff = order[a.type] - order[b.type];
      if (diff !== 0) return diff;
      return timeToMinutes(a.scheduled_start_time || "10:00") - timeToMinutes(b.scheduled_start_time || "10:00");
    });

  // Count variables
  const countCurrent = currentTasks.length;
  const countUpcoming = upcomingTasks.length;
  const countPast = pastTasks.length;

  return (
    <div className="flex-1 overflow-y-auto bg-[#EFEDE8] flex flex-col">
      {/* Header Selector */}
      <div className="px-4 py-3 bg-white border-b border-border shadow-sm shrink-0 sticky top-0 z-20 flex flex-col gap-1.5">
        <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest pl-0.5">Select Housekeeper</label>
        <div className="relative">
          <select
            value={selectedHk}
            onChange={(e) => setSelectedHk(e.target.value)}
            className="w-full h-11 px-3.5 rounded-xl border border-[#E8E5DF] bg-[#F8F7F4] text-[13px] font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all appearance-none cursor-pointer"
          >
            <option value="All">All Staff (Grouped)</option>
            {housekeepers.map((h) => (
              <option key={h.name} value={h.name}>{h.name}</option>
            ))}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground font-bold">▼</div>
        </div>
      </div>

      <div className="px-4 pt-4 pb-24 space-y-6 flex-1 overflow-y-auto">
        {/* CURRENT SECTOR */}
        {countCurrent > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 px-1">
              <span className="text-[11px] font-extrabold text-[#3730A3] uppercase tracking-wider">Current</span>
              <span className="bg-[#E0E7FF] text-[#3730A3] text-[10px] font-extrabold px-2 py-0.5 rounded-full">{countCurrent}</span>
            </div>
            <div className="space-y-2.5">
              {currentTasks.map((t) => {
                const duration = t.type === "STE" ? 45 : t.type === "DLX" ? 35 : 25;
                const eta = t.actual_start_time ? minutesToTime(timeToMinutes(t.actual_start_time) + duration) : t.scheduled_end_time || "10:25";
                const rem = getRemainingInfo(simTime, eta);
                const pct = getProgressPct(simTime, t.actual_start_time, duration);

                return (
                  <div key={t.number} className="rounded-2xl bg-white border border-[#E8E5DF] shadow-sm p-4 space-y-3 relative overflow-hidden">
                    {/* Top Row */}
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full bg-[#6366F1]" />
                        <div>
                          <h4 className="text-[16px] font-extrabold text-foreground">Room {t.number}</h4>
                          <span className="text-[11px] text-muted-foreground font-medium">{t.type} · Floor {t.floor}</span>
                        </div>
                      </div>
                      <Lock size={14} className="text-muted-foreground/60 mr-1 mt-0.5" />
                    </div>

                    {/* Staff details */}
                    <div className="flex items-center gap-2 bg-[#F8F7F4] rounded-xl px-3 py-2 border border-[#E8E5DF]/50">
                      <span className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white" style={{ backgroundColor: getHkColor(t.attendant || "Ana") }}>
                        {(t.attendant || "A")[0]}
                      </span>
                      <span className="text-[12px] font-bold text-foreground">{t.attendant}</span>
                    </div>

                    {/* Timing grid */}
                    <div className="grid grid-cols-3 gap-2 pt-1.5 text-left">
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Started</div>
                        <div className="text-[12px] font-extrabold text-[#1A1A2E] mt-0.5">{formatTimeStr(t.actual_start_time)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">ETA</div>
                        <div className="text-[12px] font-extrabold text-[#1A1A2E] mt-0.5">{formatTimeStr(eta)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Remaining</div>
                        <div className={`text-[12px] font-extrabold mt-0.5 ${rem.isOverdue ? "text-amber-600 flex items-center gap-0.5" : "text-[#1A1A2E]"}`}>
                          {rem.isOverdue && <AlertTriangle size={11} />}
                          {rem.text}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="pt-2 space-y-1">
                      <div className="h-2 w-full rounded-full bg-[#EFEDE8] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${rem.isOverdue ? "bg-amber-500" : "bg-[#6366F1]"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-right text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest">{pct}% Complete</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* UPCOMING SECTOR */}
        {countUpcoming > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 px-1">
              <span className="text-[11px] font-extrabold text-[#991B1B] uppercase tracking-wider">Upcoming</span>
              <span className="bg-[#FEE2E2] text-[#991B1B] text-[10px] font-extrabold px-2 py-0.5 rounded-full">{countUpcoming}</span>
            </div>
            <div className="space-y-2.5">
              {upcomingTasks.map((t) => {
                const duration = t.type === "STE" ? 45 : t.type === "DLX" ? 35 : 25;
                const hk = housekeepers.find((h) => h.name === t.attendant);
                const qPos = hk ? hk.rooms.indexOf(t.number) + 1 : 1;

                return (
                  <div key={t.number} className="rounded-2xl bg-white border border-[#E8E5DF] shadow-sm p-4 space-y-3 relative overflow-hidden">
                    {/* Top Row */}
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full bg-[#EF4444]" />
                        <div>
                          <h4 className="text-[16px] font-extrabold text-foreground">Room {t.number}</h4>
                          <span className="text-[11px] text-muted-foreground font-medium">{t.type} · Floor {t.floor}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setReassigningRoom(t)}
                        className="h-7 px-3 rounded-lg border border-[#E8E5DF] hover:border-emerald-500 hover:text-emerald-700 bg-white text-[11px] font-extrabold text-muted-foreground active:scale-95 transition-all shadow-sm"
                      >
                        Reassign
                      </button>
                    </div>

                    {/* Staff details */}
                    <div className="flex items-center gap-2 bg-[#F8F7F4] rounded-xl px-3 py-2 border border-[#E8E5DF]/50">
                      <span className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white" style={{ backgroundColor: getHkColor(t.attendant || "Ana") }}>
                        {(t.attendant || "A")[0]}
                      </span>
                      <span className="text-[12px] font-bold text-foreground">{t.attendant}</span>
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-3 gap-2 pt-1.5 text-left border-t border-[#F3F2EF]">
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Scheduled</div>
                        <div className="text-[11.5px] font-extrabold text-[#1A1A2E] mt-0.5">{formatTimeStr(t.scheduled_start_time)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Duration</div>
                        <div className="text-[11.5px] font-extrabold text-[#1A1A2E] mt-0.5">{duration} mins</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Queue Rank</div>
                        <div className="text-[11.5px] font-extrabold text-[#1A1A2E] mt-0.5">#{qPos} in queue</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PAST SECTOR */}
        {countPast > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 px-1">
              <span className="text-[11px] font-extrabold text-[#065F46] uppercase tracking-wider">Past</span>
              <span className="bg-[#D1FAE5] text-[#065F46] text-[10px] font-extrabold px-2 py-0.5 rounded-full">{countPast}</span>
            </div>
            <div className="space-y-2.5 opacity-[0.7]">
              {pastTasks.map((t) => {
                const duration = t.type === "STE" ? 45 : t.type === "DLX" ? 35 : 25;
                return (
                  <div key={t.number} className="rounded-2xl bg-white border border-[#E8E5DF] shadow-sm p-4 space-y-3 relative overflow-hidden">
                    {/* Top Row */}
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-[#10B981]" />
                      <div>
                        <h4 className="text-[16px] font-extrabold text-[#4B5563]">Room {t.number}</h4>
                        <span className="text-[11px] text-muted-foreground font-medium">{t.type} · Floor {t.floor}</span>
                      </div>
                    </div>

                    {/* Staff details */}
                    <div className="flex items-center gap-2 bg-[#F8F7F4] rounded-xl px-3 py-2 border border-[#E8E5DF]/50">
                      <span className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white" style={{ backgroundColor: getHkColor(t.attendant || "Ana") }}>
                        {(t.attendant || "A")[0]}
                      </span>
                      <span className="text-[12px] font-bold text-foreground">{t.attendant}</span>
                    </div>

                    {/* Timings */}
                    <div className="grid grid-cols-3 gap-2 pt-1 text-left">
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Started</div>
                        <div className="text-[11.5px] font-extrabold text-[#4B5563] mt-0.5">{formatTimeStr(t.actual_start_time)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Completed</div>
                        <div className="text-[11.5px] font-extrabold text-[#4B5563] mt-0.5">{formatTimeStr(t.actual_end_time)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Duration</div>
                        <div className="text-[11.5px] font-extrabold text-[#4B5563] mt-0.5">{duration} mins</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {checkoutRooms.length === 0 && (
          <div className="text-center py-20 text-muted-foreground text-[13px] font-medium bg-white rounded-2xl border border-[#E8E5DF] p-6">
            No checkout tasks generated yet. Start the shift to view daily housekeeping tasks.
          </div>
        )}
      </div>

      {/* REASSIGN BOTTOM SHEET */}
      {reassigningRoom && (
        <>
          <div className="absolute inset-0 z-40 bg-black/40 animate-fade-in" onClick={() => setReassigningRoom(null)} />
          <div className="absolute left-0 right-0 bottom-0 z-50 bg-[#EFEDE8] rounded-t-[24px] p-5 animate-slide-up shadow-2xl border-t border-border/30 max-h-[70%] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#E8E5DF] shrink-0">
              <div>
                <h3 className="text-[17px] font-extrabold text-[#1A1A2E] tracking-tight">Reassign Room {reassigningRoom.number}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Select a housekeeper to re-schedule this {reassigningRoom.type} room.</p>
              </div>
              <button
                onClick={() => setReassigningRoom(null)}
                className="h-8 w-8 rounded-full bg-white flex items-center justify-center text-muted-foreground active:scale-95 transition-all shadow-sm"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4 space-y-2">
              {housekeepers.map((h) => {
                const count = h.rooms.length;
                return (
                  <button
                    key={h.name}
                    onClick={() => handleReassignSelect(h.name)}
                    className="w-full bg-white hover:bg-emerald-50 border border-[#E8E5DF] hover:border-emerald-500/20 rounded-xl p-3.5 flex items-center justify-between transition-all active:scale-[0.98] shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-extrabold text-white" style={{ backgroundColor: getHkColor(h.name) }}>
                        {h.name[0]}
                      </span>
                      <span className="text-[13.5px] font-extrabold text-[#1A1A2E]">{h.name}</span>
                    </div>
                    <span className="text-[11.5px] font-bold text-muted-foreground">{count} rooms in queue</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
