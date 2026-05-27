import { useState, useEffect } from "react";
import { Housekeeper, Room, housekeepers } from "@/simulation/data";
import { LancyBubble, HousekeeperBubble } from "@/UI/components/Bubble";
import { InputBar } from "@/UI/components/InputBar";
import { lancyService } from "@/Backend/services/lancy-service";
import { Sparkles } from "lucide-react";
import { getHkColor } from "@/simulation/engine";

export interface Msg { id: string; from: "lancy" | "hk"; text: string }

interface Props {
  roomsList: Room[];
  onUpdateRoomStatus: (number: string, status: Room["status"], updates?: Partial<Room>) => void;
  onSelectHousekeeper?: (name: string) => void;
  activeHkName?: string;
  selectedTime: string;
  chatMap: Record<string, Msg[]>;
  onHousekeeperChat: (hkName: string, text: string) => Promise<void>;
  hkStatus?: string;
}

const HOUSEKEEPER_ARRIVALS: Record<string, string> = {
  James: "07:12",
  Ana: "07:30",
  Priya: "07:45",
  Rosa: "07:53",
  Sofia: "08:15",
};

function makeGreeting(hk: Housekeeper) {
  return `Good morning, ${hk.name}. You are assigned to Floors 2 & 5 today. Your active task queue has 4 rooms.`;
}

export function CleanerView({ roomsList, onUpdateRoomStatus, activeHkName, selectedTime, chatMap, onHousekeeperChat, hkStatus }: Props) {
  const active: Housekeeper = housekeepers.find((h) => h.name === activeHkName) ?? housekeepers[0];

  const timeToMins = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const currentMins = timeToMins(selectedTime);
  const arrivalTimeStr = HOUSEKEEPER_ARRIVALS[active.name] || "08:00";
  const hasArrived = currentMins >= timeToMins(arrivalTimeStr);

  const messages = chatMap[active.name] ?? [];

  const handleUser = async (text: string) => {
    await onHousekeeperChat(active.name, text);
  };

  const activeRoom = roomsList.find((r) => r.attendant === active.name && (r.status === "dirty" || r.status === "cleaning" || r.status === "inspection" || r.status === "review"));
  const activeRoomNum = activeRoom ? activeRoom.number : "201";

  const suggestedPrompts = (() => {
    const list = [];
    if (hkStatus === "Available" || !hkStatus) {
      list.push("Items confirmed, all clear");
    } else if (hkStatus === "Inspecting") {
      list.push("Inspection done, ready to clean");
    } else if (hkStatus === "Cleaning") {
      list.push("Cleaning done, room finished");
    }
    list.push(`Report broken mirror in Room ${activeRoomNum}`);
    list.push(`AC is not working in Room ${activeRoomNum}`);
    return list;
  })();

  if (hkStatus === "ABSENT") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#FEF2F2]">
        <div className="text-center space-y-3 p-6 bg-white rounded-2xl border border-red-200 shadow-sm max-w-[280px]">
          <div className="text-[40px]">🤒</div>
          <h3 className="text-[15px] font-bold text-red-700">{active.name} is Absent today</h3>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Reported sick/absent. Shifts and chat interface are locked. Rooms are being reassigned by Marcus.
          </p>
        </div>
      </div>
    );
  }

  if (!hasArrived) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#F8FAFC]">
        <div className="text-center space-y-3 p-6 bg-white rounded-2xl border border-border shadow-sm max-w-[280px]">
          <div className="text-[40px] animate-pulse">⏳</div>
          <h3 className="text-[15px] font-bold text-foreground">{active.name} has not arrived yet</h3>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Shift contract starts at <span className="font-bold">{arrivalTimeStr}</span>. Chat and room assignment functions are currently locked.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Chat feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m) =>
          m.from === "lancy" ? (
            <LancyBubble key={m.id}>{m.text}</LancyBubble>
          ) : (
            <HousekeeperBubble key={m.id} color={getHkColor(active.name)}>{m.text}</HousekeeperBubble>
          )
        )}

        {messages.length === 1 && (
          <div className="pt-2 space-y-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pl-1">
              {active.name}'s updates
            </div>
            {suggestedPrompts.map((p) => (
              <button
                key={p}
                onClick={() => handleUser(p)}
                className="w-full min-h-12 rounded-[12px] bg-white border border-border px-4 text-[13px] font-medium text-left text-foreground active:bg-secondary transition-colors shadow-sm flex items-center justify-between"
              >
                <span>{p}</span>
                <Sparkles size={12} className="text-muted-foreground shrink-0 ml-2" />
              </button>
            ))}
          </div>
        )}
      </div>

      <InputBar onSend={handleUser} placeholder={`Ask Lancy as ${active.name}…`} />
    </div>
  );
}
