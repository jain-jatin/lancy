import { useState } from "react";
import {
  X, Mic, Clock, AlertCircle, Zap, HandHeart, Check, Sparkles,
} from "lucide-react";
import { Room, statusTag, statusLabel, housekeepers } from "@/simulation/data";
import { ActionButton } from "@/UI/components/ActionButton";
import { getHkColor } from "@/simulation/engine";

const nudges: { Icon: typeof Clock; label: string; reply: string }[] = [
  { Icon: Clock, label: "How much longer?", reply: "15 mins" },
  { Icon: AlertCircle, label: "Guest arriving soon", reply: "Almost done" },
  { Icon: Zap, label: "Please prioritize", reply: "On it" },
  { Icon: HandHeart, label: "Need help?", reply: "All good" },
];

interface Props {
  room: Room;
  onClose: () => void;
  onUpdateLancy: (msg: string) => void;
  onUpdateRoomStatus?: (number: string, status: Room["status"], updates?: Partial<Room>) => void;
}

function suggestAttendant(room: Room) {
  const onFloor = housekeepers.find((h) => h.rooms.some((r) => Math.abs(Number(r) - Number(room.number)) < 20));
  return onFloor ?? housekeepers[0];
}

export function RoomDetail({ room, onClose, onUpdateLancy, onUpdateRoomStatus }: Props) {
  const [recording, setRecording] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "sent" | "replied">("idle");
  const [nudgeState, setNudgeState] = useState<{ phase: "idle" | "sent" | "replied"; label?: string; reply?: string }>({ phase: "idle" });
  const [reviewed, setReviewed] = useState(false);

  const hk = housekeepers.find((h) => h.name === room.attendant);
  const suggested = !hk ? suggestAttendant(room) : null;

  const lancyLine = (() => {
    if (room.number === "215") return "Running about 9 minutes behind. Maintenance is aware of the shower head.";
    if (room.number === "412") return "Early arrival at 11 — needs to be assigned soon.";
    if (room.number === "501") return "VIP — please confirm inspection before marking ready.";
    if (room.status === "cleaning") return "In progress. Everything's on track.";
    if (room.status === "inspection") return reviewed ? "Review complete — ready to mark as ready." : "Housekeeper marked cleaning done. Awaiting your review.";
    if (room.status === "ready") return "Cleared and inspected.";
    if (room.status === "dirty") return suggested ? `I'd suggest ${suggested.name} — closest to this floor.` : "Awaiting assignment.";
    return "Occupied.";
  })();

  const toggleVoice = () => {
    if (!recording) {
      setRecording(true);
      setVoiceState("idle");
    } else {
      setRecording(false);
      setVoiceState("sent");
      setTimeout(() => setVoiceState("replied"), 2500);
    }
  };

  const sendNudge = (label: string, reply: string) => {
    setNudgeState({ phase: "sent", label, reply });
    setTimeout(() => setNudgeState({ phase: "replied", label, reply }), 1800);
  };

  return (
    <>
      <div className="absolute inset-0 z-40 bg-black/30 animate-fade-in" onClick={onClose} />
      <div className="absolute left-0 right-0 bottom-0 z-50 bg-white rounded-t-[20px] animate-slide-up max-h-[88%] flex flex-col">
        {/* Header */}
        <div className="px-5 pt-4 pb-4 border-b border-border flex items-start justify-between">
          <div>
            <div className="text-[10px] text-muted-foreground label-track uppercase font-medium">Room {room.type}</div>
            <h1 className="text-[26px] font-semibold tracking-tight text-foreground leading-tight">{room.number}</h1>
            <span className={`mt-2 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusTag[room.status]}`}>
              {statusLabel[room.status]}
            </span>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Assignment block */}
          {hk && (
            <div>
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full flex items-center justify-center text-white font-semibold text-[13px]" style={{ backgroundColor: getHkColor(hk.name) }}>
                  {hk.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-[14px]">{hk.name}</div>
                  <div className="text-[12px] text-muted-foreground">
                    {room.status === "cleaning" ? "Cleaning in progress" : room.status === "inspection" ? "Awaiting review" : ""}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {room.startedAt && <InfoRow label="Started" value={room.startedAt} />}
                {room.elapsed !== undefined && <InfoRow label="Elapsed" value={`${room.elapsed} min · avg 25`} />}
                {room.guestArrival && <InfoRow label="Guest arrives" value={room.guestArrival} />}
                {room.priority && <InfoRow label="Priority" value={room.priority} />}
              </div>

              <div className="mt-4 rounded-[12px] bg-accent-light p-3.5 text-[13px] leading-snug text-accent-text flex gap-2">
                <Sparkles size={14} className="mt-0.5 shrink-0" />
                <span>{lancyLine}</span>
              </div>
              {room.note && (
                <div className="mt-2.5 text-[13px] bg-secondary rounded-[12px] p-3 leading-snug">
                  <span className="font-semibold">Note · </span>{room.note}
                </div>
              )}
            </div>
          )}

          {/* Dirty — Lancy suggests assignment */}
          {room.status === "dirty" && suggested && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground label-track uppercase mb-2">Lancy suggests</div>
              <div className="rounded-[12px] bg-accent-light p-3.5 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold text-[12px]" style={{ backgroundColor: getHkColor(suggested.name) }}>
                  {suggested.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-accent-text">{suggested.name}</div>
                  <div className="text-[11px] text-accent-text/70">Closest to this floor</div>
                </div>
              </div>
              {room.priority && <div className="mt-2 text-[12px] text-muted-foreground">{room.priority}</div>}
              <ActionButton
                variant="primary"
                className="w-full mt-3"
                onClick={() => {
                  if (onUpdateRoomStatus) {
                    onUpdateRoomStatus(room.number, "cleaning", { attendant: suggested.name, startedAt: "10:00" });
                  }
                  onUpdateLancy(`Room ${room.number} assigned to ${suggested.name}.`);
                  onClose();
                }}
              >
                Assign {suggested.name}
              </ActionButton>
            </div>
          )}

          {/* Inspection flow */}
          {room.status === "inspection" && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground label-track uppercase mb-2">Supervisor review</div>
              {!reviewed ? (
                <ActionButton variant="primary" className="w-full" onClick={() => setReviewed(true)}>
                  <Check size={16} /> Review done
                </ActionButton>
              ) : (
                <ActionButton
                  variant="primary"
                  className="w-full"
                  onClick={() => {
                    if (onUpdateRoomStatus) {
                      onUpdateRoomStatus(room.number, "ready");
                    }
                    onUpdateLancy(`Room ${room.number} marked ready.`);
                    onClose();
                  }}
                >
                  Mark as Ready
                </ActionButton>
              )}
            </div>
          )}

          {/* Voice + nudges */}
          {hk && room.status === "cleaning" && (
            <>
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground label-track uppercase mb-2">Voice Message</div>
                <button
                  onClick={toggleVoice}
                  className={`w-full min-h-12 rounded-[12px] font-semibold flex items-center justify-center gap-2 transition-colors ${
                    recording ? "bg-accent-light text-accent-text" : "bg-accent text-white"
                  }`}
                >
                  {recording ? (
                    <div className="flex items-center gap-1 h-5">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="wave-bar w-[3px] h-full bg-accent rounded" style={{ animationDelay: `${i * 0.12}s` }} />
                      ))}
                      <span className="ml-2 text-[12px]">Listening…</span>
                    </div>
                  ) : (
                    <><Mic size={16} /> Tap to speak to {hk.name}</>
                  )}
                </button>
                {voiceState === "sent" && <div className="mt-2 text-[12px] text-muted-foreground animate-fade-in">Sent to {hk.name}</div>}
                {voiceState === "replied" && (
                  <div className="mt-2 rounded-[12px] bg-secondary p-3 text-[13px] animate-msg-in">
                    <span className="font-semibold">{hk.name}</span>
                    <span className="text-muted-foreground"> · just now</span>
                    <div className="mt-0.5">Got it, on my way.</div>
                  </div>
                )}
              </div>

              <div>
                <div className="text-[10px] font-semibold text-muted-foreground label-track uppercase mb-2">Quick nudge</div>
                <div className="grid grid-cols-2 gap-2">
                  {nudges.map(({ Icon, label, reply }) => (
                    <button
                      key={label}
                      onClick={() => sendNudge(label, reply)}
                      disabled={nudgeState.phase !== "idle"}
                      className="min-h-12 px-3 rounded-[12px] bg-white border border-border text-[13px] font-medium flex items-center gap-2 active:bg-secondary transition disabled:opacity-50 text-left"
                    >
                      <Icon size={14} className="text-muted-foreground shrink-0" />
                      <span className="leading-tight">{label}</span>
                    </button>
                  ))}
                </div>
                {nudgeState.phase === "sent" && (
                  <div className="mt-3 text-[12px] text-muted-foreground animate-fade-in">Nudge sent to {hk.name}</div>
                )}
                {nudgeState.phase === "replied" && (
                  <div className="mt-3 space-y-3 animate-msg-in">
                    <div className="rounded-[12px] bg-secondary p-3 text-[13px]">
                      <span className="font-semibold">{hk.name}</span>
                      <span className="text-muted-foreground"> · replied</span>
                      <div className="mt-0.5">{nudgeState.reply}</div>
                    </div>
                    <ActionButton variant="primary" className="w-full" onClick={() => {
                      onUpdateLancy(`${hk.name} on Room ${room.number}: ${nudgeState.reply}.`);
                      onClose();
                    }}>
                      Update Lancy
                    </ActionButton>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Occupied / Ready empty state */}
          {(room.status === "occupied" || room.status === "ready") && !hk && (
            <div className="rounded-[12px] bg-secondary p-4 text-[13px] text-muted-foreground">
              {room.status === "ready" ? "Room is ready for guest arrival." : "Guest currently in room."}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#F3F2EF] last:border-0">
      <span className="text-[12px] text-muted-foreground label-track uppercase">{label}</span>
      <span className="text-[13px] font-medium text-foreground">{value}</span>
    </div>
  );
}
