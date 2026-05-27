import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Phone, Wrench, Mic } from "lucide-react";
import { Toaster, toast } from "sonner";
import { LancyBubble, MarcusBubble, LancyCard } from "@/UI/components/Bubble";
import { ActionButton } from "@/UI/components/ActionButton";
import { RoomDetail } from "@/UI/views/RoomDetail";
import { HandoffScreen } from "@/UI/views/HandoffScreen";
import { InputBar } from "@/UI/components/InputBar";
import { BottomNav, Tab } from "@/UI/components/BottomNav";
import { RoomsView } from "@/UI/views/RoomsView";
import { CleanerView } from "@/UI/views/CleanerView";
import { Room, housekeepers, Housekeeper } from "@/simulation/data";
import { lancyService } from "@/Backend/services/lancy-service";
import { compileSimulation, timeToMinutes } from "@/simulation/engine";
import { AppSelect } from "@/UI/components/AppSelect";

export const Route = createFileRoute("/")({ component: LancyApp });

type Step =
  | "intro" | "priority" | "priority-done"
  | "issue" | "issue-sent"
  | "frontdesk" | "frontdesk-done"
  | "sofia" | "sofia-done"
  | "maintenance" | "maintenance-done";

interface ChatItem { id: string; render: () => React.ReactNode }

const timePills = [
  { value: "08:00", label: "8:00 AM" },
  { value: "08:30", label: "8:30 AM" },
  { value: "09:00", label: "9:00 AM" },
  { value: "09:30", label: "9:30 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "10:30", label: "10:30 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "11:30", label: "11:30 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "12:30", label: "12:30 PM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "13:30", label: "1:30 PM" },
  { value: "14:00", label: "2:00 PM" },
];

function LancyApp() {
  const [tab, setTab] = useState<Tab>("chat");
  const [step, setStep] = useState<Step>("intro");
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [showHandoff, setShowHandoff] = useState(false);
  const [showDraft, setShowDraft] = useState(false);
  const [extra, setExtra] = useState<ChatItem[]>(() => [
    {
      id: "greeting",
      render: () => <LancyBubble>Good morning, Marcus. Would you like to see the summary of today's checkouts and checkins?</LancyBubble>
    },
    {
      id: "greeting-btn",
      render: () => (
        <div className="flex flex-wrap gap-2 mt-1 pl-1">
          <button
            onClick={() => onSendRef.current("Yes, please")}
            className="h-9 px-4 rounded-full border border-emerald-600 bg-white text-[13px] font-semibold text-emerald-700 active:bg-emerald-50 hover:bg-emerald-50 transition-all shadow-sm"
          >
            Yes, please
          </button>
        </div>
      )
    }
  ]);
  const [activeHkName, setActiveHkName] = useState<string>(housekeepers[0].name);

  const [selectedTime, setSelectedTime] = useState("08:00");
  const [simState, setSimState] = useState(() => compileSimulation("08:00"));
  const roomsList = Object.values(simState.rooms);

  const scrollRef = useRef<HTMLDivElement>(null);
  const onSendRef = useRef<(text: string) => Promise<void>>(async () => {});

  const pushMsg = (node: React.ReactNode, id: string = crypto.randomUUID()) =>
    setExtra((p) => [...p, { id, render: () => node }]);

  const handleSimulate = async (time: string) => {
    setSelectedTime(time);
    const compiled = compileSimulation(time);
    setSimState(compiled);

    // Sync mock DB (localStorage) with compiled state
    const dbHks = await lancyService.getHousekeepers();
    const dbRooms = await lancyService.getRooms();

    for (const hk of dbHks) {
      const compHk = compiled.housekeepers[hk.name];
      if (compHk) {
        let dbActivity: "INSPECTION" | "CLEANING" | null = null;
        if (compHk.status === "Inspecting") dbActivity = "INSPECTION";
        if (compHk.status === "Cleaning") dbActivity = "CLEANING";

        await lancyService.updateHousekeeper(hk.name, {
          current_room: compHk.currentRoom || null,
          current_activity: dbActivity,
          rooms_completed: compHk.completed || [],
          next_room: compHk.nextInQueue && compHk.nextInQueue !== "None" ? compHk.nextInQueue : null,
        });
      }
    }

    for (const r of dbRooms) {
      const compRoom = compiled.rooms[r.number];
      if (compRoom) {
        await lancyService.updateRoomStatus(r.number, compRoom.status, {
          attendant: compRoom.attendant || undefined,
          damageReported: compRoom.damageReported || false,
          tvIssue: compRoom.tvIssue || false,
          isBlocked: compRoom.isBlocked || false,
          note: compRoom.note || undefined,
        });
      }
    }

    // Call buildAutoRecommendation to get deterministic Lancy recommendations
    const rec = await lancyService.buildAutoRecommendation(time);

    // Clear old action buttons
    setExtra((prev) => prev.filter((item) => item.id !== "greeting-btn" && !item.id.endsWith("-btn")));

    // Push the text recommendation bubble
    pushMsg(<LancyBubble><div className="whitespace-pre-line">{rec.msg}</div></LancyBubble>);

    // Push inline card recommendations
    if (rec.recommendations && rec.recommendations.length > 0) {
      rec.recommendations.forEach((r) => {
        const btnId = `${r.roomNumber}-${r.hkName}-btn`;
        pushMsg(
          <div className="max-w-[88%] rounded-[14px] bg-white border border-border shadow-card p-3.5 mt-1 animate-fade-in" key={btnId}>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Recommendation</div>
            <div className="text-[13px] font-bold text-foreground">Room {r.roomNumber} &rarr; {r.hkName}</div>
            <div className="flex gap-2 mt-2.5">
              <button
                onClick={async () => {
                  await lancyService.assignHousekeeperRoom(r.hkName, r.roomNumber);
                  toast.success(`Assigned Room ${r.roomNumber} to ${r.hkName}`);
                  // Refresh state
                  handleSimulate(time);
                }}
                className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold active:scale-95 transition-all shadow-sm"
              >
                Assign {r.hkName}
              </button>
              <button
                onClick={() => {
                  setActiveRoom(compiled.rooms[r.roomNumber] || null);
                }}
                className="h-8 px-3 rounded-lg border border-border hover:bg-secondary text-foreground text-[11px] font-bold active:scale-95 transition-all"
              >
                Edit
              </button>
            </div>
          </div>,
          btnId
        );
      });
    }
  };

  const handleUpdateRoomStatus = async (number: string, status: Room["status"], updates?: Partial<Room>) => {
    if (number) {
      await lancyService.updateRoomStatus(number, status, updates);
    }
    // Reload state from database
    const dbRooms = await lancyService.getRooms();
    const dbHks = await lancyService.getHousekeepers();
    setSimState((prev) => {
      const updatedRooms = { ...prev.rooms };
      dbRooms.forEach((r) => {
        if (updatedRooms[r.number]) {
          updatedRooms[r.number] = {
            ...updatedRooms[r.number],
            ...r,
          };
        }
      });
      return {
        ...prev,
        rooms: updatedRooms,
      };
    });
  };

  const handleUpdateFromLancy = async (msg: string) => {
    pushMsg(<LancyBubble>{msg}</LancyBubble>);
    setTab("chat");

    const lower = msg.toLowerCase();
    const match = msg.match(/\b\d{3}\b/);
    if (match) {
      const roomNum = match[0];
      if (lower.includes("assigned to")) {
        const hkMatch = msg.match(/assigned to (\w+)/i);
        const hkName = hkMatch ? hkMatch[1] : undefined;
        await handleUpdateRoomStatus(roomNum, "cleaning", { attendant: hkName });
      } else if (lower.includes("ready")) {
        await handleUpdateRoomStatus(roomNum, "ready");
      }
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [step, extra, tab]);

  const onSend = async (text: string) => {
    console.log("[index.tsx] onSend triggered with text:", text);
    setExtra((prev) => prev.filter((item) => item.id !== "greeting-btn" && !item.id.endsWith("-btn")));
    pushMsg(<MarcusBubble>{text}</MarcusBubble>);
    
    // Call the intelligent operations AI
    const res = await lancyService.lancyChat(text, undefined, selectedTime);
    console.log("[index.tsx] lancyChat response resolved:", res);
    setTimeout(() => {
      pushMsg(<LancyBubble>{res.reply}</LancyBubble>);
      
      if (res.buttons && res.buttons.length > 0) {
        pushMsg(
          <div className="flex flex-wrap gap-2 mt-1 pl-1">
            {res.buttons.map((btn) => (
              <button
                key={btn.label}
                onClick={() => onSendRef.current(btn.textToSend)}
                className="h-9 px-4 rounded-full border border-emerald-600 bg-white text-[13px] font-semibold text-emerald-700 active:bg-emerald-50 hover:bg-emerald-50 transition-all shadow-sm animate-fade-in"
              >
                {btn.label}
              </button>
            ))}
          </div>,
          crypto.randomUUID() + "-btn"
        );
      } else if (res.card && res.card.action === "day-summary") {
        pushMsg(
          <div className="max-w-[88%] rounded-[14px] bg-white border border-border shadow-card p-3.5 mt-1 animate-fade-in">
            <div className="text-[10px] font-semibold text-muted-foreground label-track uppercase mb-2.5">Today at a glance</div>
            <div className="grid grid-cols-2 gap-3">
              <SummaryBlock
                title="Check-ins"
                total={checkIns.total}
                rows={[
                  { label: "VIP", value: checkIns.vip },
                  { label: "Deluxe", value: checkIns.deluxe },
                  { label: "Standard", value: checkIns.standard },
                ]}
              />
              <SummaryBlock
                title="Checkouts"
                total={checkOuts.total}
                rows={[
                  { label: "Early", value: checkOuts.early },
                  { label: "On time", value: checkOuts.onTime },
                  { label: "Late", value: checkOuts.late },
                ]}
              />
            </div>
          </div>
        );
 
        // Instantly append continuation option
        setTimeout(() => {
          pushMsg(
            <div className="flex flex-wrap gap-2 mt-1 pl-1">
              <button
                onClick={() => onSendRef.current("Go to Room turnarounds")}
                className="h-9 px-4 rounded-full border border-emerald-600 bg-white text-[13px] font-semibold text-emerald-700 active:bg-emerald-50 hover:bg-emerald-50 transition-all shadow-sm animate-fade-in"
              >
                Continue to room Turnarounds
              </button>
            </div>,
            crypto.randomUUID() + "-btn"
          );
        }, 400);
      }
    }, 600);
  };

  onSendRef.current = onSend;

  const checkIns = { total: 17, vip: 1, deluxe: 7, standard: 9 };
  const checkOuts = { total: 15, early: 3, onTime: 12, late: 0 };

  return (
    <div className="h-screen w-full flex justify-center bg-[#EFEDE8] overflow-hidden">
      <Toaster position="top-center" />
      <div className="relative w-full max-w-[390px] h-screen bg-background flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <header className="bg-white border-b border-border px-5 pt-3 pb-3 shrink-0 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            {/* Left: hotel + name or attendant dropdown */}
            <div className="shrink-0">
              <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider leading-none">Maplewood Suites</div>
              {tab === "cleaner" ? (
                <AppSelect
                  value={activeHkName}
                  onChange={setActiveHkName}
                  options={housekeepers.map((h) => ({ value: h.name, label: h.name }))}
                  headerVariant
                />
              ) : (
                <h1 className="text-[20px] font-extrabold tracking-tight text-[#1A1A2E] leading-tight">Marcus</h1>
              )}
            </div>
            {/* Right: compact time dropdown + simulate */}
            <div data-tour="simulate" className="flex items-center gap-2 flex-1 justify-end">
              <AppSelect
                value={selectedTime}
                onChange={setSelectedTime}
                options={timePills}
              />
              <button
                onClick={() => handleSimulate(selectedTime)}
                className="h-9 px-4 rounded-[10px] bg-accent text-white text-[13px] font-bold active:scale-[0.97] transition-all shrink-0 shadow-sm hover:bg-accent/90"
              >
                Simulate
              </button>
            </div>
          </div>
        </header>

        {/* Tab content */}
        <div className="flex-1 flex flex-col overflow-hidden animate-fade-in" key={tab}>
          {tab === "chat" && (
            <>
              {/* Chat feed */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {/* 1. Dynamic conversational feed */}
                {extra.map((m) => (
                  <div key={m.id} className="animate-fade-in">{m.render()}</div>
                ))}

                {/* 2. Real-time active operational scenario cards */}
                {timeToMinutes(selectedTime) >= timeToMinutes("10:00") && (
                  <>
                    {/* Pending Supervisor Reviews Queue */}
                    {simState.reviewQueue.length > 0 && (
                      <LancyCard urgency="warning">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#92400E] mb-1.5">
                          ⚠️ Supervisor Review Pending
                        </div>
                        <div className="text-[13px] text-foreground mb-3">
                          {simState.reviewQueue.length} room{simState.reviewQueue.length > 1 ? "s" : ""} need{simState.reviewQueue.length === 1 ? "s" : ""} your review.
                        </div>
                        <div className="space-y-2">
                          {simState.reviewQueue.map((rev) => (
                            <div key={rev.room} className="flex items-center justify-between bg-[#FEF3C7]/40 border border-[#FEF3C7] rounded-xl p-3 text-[12px] shadow-sm animate-msg-in">
                              <div>
                                <span className="font-bold">Room {rev.room}</span> · {simState.rooms[rev.room]?.type}
                                <div className="text-[10px] text-muted-foreground mt-0.5">Housekeeper: {rev.housekeeper} · waiting since {rev.timeEntered}</div>
                              </div>
                              <button
                                onClick={() => {
                                  const r = simState.rooms[rev.room];
                                  if (r) setActiveRoom(r);
                                }}
                                className="h-7 px-3 rounded-lg bg-[#F59E0B] text-white text-[11px] font-bold active:scale-95 transition-transform"
                              >
                                Review
                              </button>
                            </div>
                          ))}
                        </div>
                      </LancyCard>
                    )}

                    {/* SCENARIO A: Guest Damage Card (from 10:10 AM) */}
                    {timeToMinutes(selectedTime) >= timeToMinutes("10:10") && (
                      <LancyBubble>
                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#991B1B] mb-1">
                          🚨 Room 204 Guest Damage
                        </div>
                        {"Rosa reported guest damage in Room 204 (broken mirror). I have notified the front desk. Charge will be applied to the departing guest's bill automatically."}
                      </LancyBubble>
                    )}

                    {/* SCENARIO B: Minor TV Issue Card (from 11:15 AM) */}
                    {timeToMinutes(selectedTime) >= timeToMinutes("11:15") && (
                      <LancyCard urgency="warning">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                          🔧 Minor Issue · Room 303
                        </div>
                        <div className="text-[13px] text-foreground mb-3">
                          James reports the TV is not functioning in Room 303. Do you want to continue cleaning or pause for maintenance?
                        </div>
                        <div className="flex gap-2">
                          <ActionButton variant="primary" className="flex-1" onClick={() => toast.success("Maintenance ticket logged. Continue cleaning.")}>
                            Continue Cleaning
                          </ActionButton>
                          <ActionButton variant="ghost" onClick={() => toast.info("Turnover paused for maintenance.")}>
                            Pause
                          </ActionButton>
                        </div>
                      </LancyCard>
                    )}

                    {/* SCENARIO C: Major Plumbing Leak Card (from 12:17 PM) */}
                    {timeToMinutes(selectedTime) >= timeToMinutes("12:17") && (
                      <LancyCard urgency="urgent">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#991B1B] mb-1.5">
                          🚨 URGENT: Major Plumbing Issue
                        </div>
                        <div className="text-[13px] text-foreground mb-3">
                          Priya reports the bathroom is actively leaking in Room 402. Block room from inventory?
                        </div>
                        {simState.rooms["402"]?.status !== "blocked" && !simState.rooms["402"]?.isBlocked ? (
                          <div className="flex gap-2">
                            <ActionButton
                              variant="primary"
                              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                              onClick={() => {
                                handleUpdateRoomStatus("402", "blocked", { isBlocked: true } as any);
                                toast.error("Room 402 BLOCKED. Priya reassigned to Room 405.");
                              }}
                            >
                              Stop & Block Room
                            </ActionButton>
                            <ActionButton variant="ghost" onClick={() => toast.warning("Proceeding with caution.")}>
                              Continue
                            </ActionButton>
                          </div>
                        ) : (
                          <div className="text-[12px] bg-red-50 text-red-700 rounded-xl p-3 border border-red-200 leading-snug">
                            ✅ Room 402 is BLOCKED and out of inventory. Reception has been alerted to reassign guests.
                          </div>
                        )}
                      </LancyCard>
                    )}
                  </>
                )}
              </div>

              <div data-tour="mic" className="shrink-0 border-t border-border bg-white">
                <InputBar onSend={onSend} />
              </div>
            </>
          )}

          {tab === "rooms" && (
            <RoomsView onSelectRoom={(r) => setActiveRoom(r)} roomsList={roomsList} />
          )}

          {tab === "cleaner" && (
            <CleanerView
              roomsList={roomsList}
              onUpdateRoomStatus={handleUpdateRoomStatus}
              onSelectHousekeeper={setActiveHkName}
              activeHkName={activeHkName}
              selectedTime={selectedTime}
            />
          )}
        </div>

        <BottomNav active={tab} onChange={setTab} />

        {activeRoom && (
          <RoomDetail
            room={activeRoom}
            onClose={() => setActiveRoom(null)}
            onUpdateLancy={handleUpdateFromLancy}
            onUpdateRoomStatus={handleUpdateRoomStatus}
          />
        )}

        {showDraft && (
          <>
            <div className="absolute inset-0 z-40 bg-black/30 animate-fade-in" onClick={() => setShowDraft(false)} />
            <div className="absolute left-0 right-0 bottom-0 z-50 bg-white rounded-t-[20px] p-5 animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[15px] font-semibold tracking-tight">Maintenance · Room 215</h3>
                <button onClick={() => setShowDraft(false)} className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                  <span className="text-lg leading-none">×</span>
                </button>
              </div>
              <div className="rounded-[12px] bg-secondary p-3.5 text-[13px] leading-relaxed mb-4 text-foreground">
                Room 215 has a broken shower head. Guest arriving at 3pm — please inspect and repair before 2pm. Priority: high.
              </div>
              <div className="flex gap-2">
                <ActionButton variant="primary" className="flex-1" onClick={() => { setShowDraft(false); setStep("issue-sent"); }}>Confirm & send</ActionButton>
                <ActionButton variant="ghost" onClick={() => setShowDraft(false)}>Edit</ActionButton>
              </div>
            </div>
          </>
        )}

        {showHandoff && (
          <HandoffScreen
            onClose={() => setShowHandoff(false)}
            onSend={() => { setShowHandoff(false); toast.success("Handoff sent to evening supervisor"); }}
          />
        )}
      </div>
    </div>
  );
}

function SummaryBlock({
  title,
  total,
  rows,
}: {
  title: string;
  total: number;
  rows: { label: string; value: number }[];
}) {
  return (
    <div className="rounded-[12px] bg-secondary p-3">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase label-track text-muted-foreground">{title}</span>
        <span className="text-[13px] font-semibold text-foreground leading-none">{total}</span>
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground">{r.label}</span>
            <span className="text-[12px] font-semibold text-foreground">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
