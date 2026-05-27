import { Room, Housekeeper } from "./data";

export interface SimEvent {
  room: string;
  event: "OCCUPIED" | "DIRTY" | "INSPECTION" | "CLEANING" | "REVIEW" | "READY" | "BLOCKED" | "DAMAGE_REPORT" | "TV_REPORT" | "LEAK_REPORT";
  time: string;
  housekeeper?: string;
  note?: string;
}

export const hotelRoomsBase: Omit<Room, "status" | "label">[] = [
  { number: "201", floor: 2, type: "STD" },
  { number: "202", floor: 2, type: "STD" },
  { number: "203", floor: 2, type: "DLX" },
  { number: "204", floor: 2, type: "DLX" },
  { number: "205", floor: 2, type: "STE" },
  { number: "301", floor: 3, type: "STD" },
  { number: "302", floor: 3, type: "STD" },
  { number: "303", floor: 3, type: "DLX" },
  { number: "304", floor: 3, type: "DLX" },
  { number: "305", floor: 3, type: "STE" },
  { number: "401", floor: 4, type: "STD" },
  { number: "402", floor: 4, type: "STD" },
  { number: "403", floor: 4, type: "DLX" },
  { number: "404", floor: 4, type: "DLX" },
  { number: "405", floor: 4, type: "STE" },
  { number: "501", floor: 5, type: "STD" },
  { number: "502", floor: 5, type: "STD" },
  { number: "503", floor: 5, type: "DLX" },
  { number: "504", floor: 5, type: "DLX" },
  { number: "505", floor: 5, type: "STE" },
];

export const HK_ARRIVALS: Record<string, string> = {
  Ana: "07:30",
  Rosa: "07:53",
  James: "07:12",
  Priya: "07:45",
  Sofia: "08:15",
};
export function getHkColor(name: string): string {
  const colors = ["#818CF8", "#F472B6", "#FBBF24", "#34D399", "#2A9D8F"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

export const housekeeperAssignments: Record<string, string[]> = {
  Ana: ["201", "202", "203", "502"],
  Rosa: ["204", "205", "301", "404"],
  James: ["302", "303", "304"],
  Priya: ["305", "401", "402", "405"],
  Sofia: ["403", "503", "505"],
};

export const checkOutRooms = [
  "201", "202", "203", "204", "205", "301", "302", "303", "304", "305", "401", "402", "403", "503", "505"
];

export const continuingRooms = ["404", "405", "502"];

export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export const masterTimeline: SimEvent[] = [
  // --- ANA (Arrives 07:30) ---
  { room: "201", event: "DIRTY", time: "07:00" },
  { room: "201", event: "INSPECTION", time: "07:30", housekeeper: "Ana" },
  { room: "201", event: "CLEANING", time: "07:45", housekeeper: "Ana" },
  { room: "201", event: "REVIEW", time: "08:10", housekeeper: "Ana" },
  { room: "201", event: "READY", time: "08:15", housekeeper: "Ana" },

  { room: "202", event: "DIRTY", time: "08:15" },
  { room: "202", event: "INSPECTION", time: "08:15", housekeeper: "Ana" },
  { room: "202", event: "CLEANING", time: "08:30", housekeeper: "Ana" },
  { room: "202", event: "REVIEW", time: "08:55", housekeeper: "Ana" },
  { room: "202", event: "READY", time: "09:00", housekeeper: "Ana" },

  { room: "203", event: "DIRTY", time: "09:00" },
  { room: "203", event: "INSPECTION", time: "09:00", housekeeper: "Ana" },
  { room: "203", event: "CLEANING", time: "09:15", housekeeper: "Ana" },
  { room: "203", event: "REVIEW", time: "09:50", housekeeper: "Ana" },
  { room: "203", event: "READY", time: "09:55", housekeeper: "Ana" },

  { room: "502", event: "CLEANING", time: "09:55", housekeeper: "Ana" },
  { room: "502", event: "READY", time: "10:20", housekeeper: "Ana" },

  // --- ROSA (Arrives 07:53) ---
  { room: "204", event: "DIRTY", time: "07:00" },
  { room: "204", event: "INSPECTION", time: "07:53", housekeeper: "Rosa" },
  { room: "204", event: "DAMAGE_REPORT", time: "08:03", housekeeper: "Rosa", note: "Broken mirror reported" },
  { room: "204", event: "CLEANING", time: "08:08", housekeeper: "Rosa" },
  { room: "204", event: "REVIEW", time: "08:43", housekeeper: "Rosa" },
  { room: "204", event: "READY", time: "08:48", housekeeper: "Rosa" },

  { room: "205", event: "DIRTY", time: "08:48" },
  { room: "205", event: "INSPECTION", time: "08:48", housekeeper: "Rosa" },
  { room: "205", event: "CLEANING", time: "09:03", housekeeper: "Rosa" },
  { room: "205", event: "REVIEW", time: "09:48", housekeeper: "Rosa" },
  { room: "205", event: "READY", time: "09:53", housekeeper: "Rosa" },

  { room: "301", event: "DIRTY", time: "09:53" },
  { room: "301", event: "INSPECTION", time: "09:53", housekeeper: "Rosa" },
  { room: "301", event: "CLEANING", time: "10:08", housekeeper: "Rosa" },
  { room: "301", event: "REVIEW", time: "10:33", housekeeper: "Rosa" },
  { room: "301", event: "READY", time: "10:38", housekeeper: "Rosa" },

  { room: "404", event: "CLEANING", time: "10:38", housekeeper: "Rosa" },
  { room: "404", event: "READY", time: "11:13", housekeeper: "Rosa" },

  // --- JAMES (Arrives 07:12) ---
  { room: "302", event: "DIRTY", time: "07:00" },
  { room: "302", event: "INSPECTION", time: "07:12", housekeeper: "James" },
  { room: "302", event: "CLEANING", time: "07:27", housekeeper: "James" },
  { room: "302", event: "REVIEW", time: "07:52", housekeeper: "James" },
  { room: "302", event: "READY", time: "07:57", housekeeper: "James" },

  { room: "303", event: "DIRTY", time: "07:57" },
  { room: "303", event: "INSPECTION", time: "07:57", housekeeper: "James" },
  { room: "303", event: "CLEANING", time: "08:12", housekeeper: "James" },
  { room: "303", event: "TV_REPORT", time: "08:27", housekeeper: "James", note: "TV not working in 303" },
  { room: "303", event: "REVIEW", time: "08:47", housekeeper: "James" },
  { room: "303", event: "READY", time: "08:52", housekeeper: "James" },

  { room: "304", event: "DIRTY", time: "08:52" },
  { room: "304", event: "INSPECTION", time: "08:52", housekeeper: "James" },
  { room: "304", event: "CLEANING", time: "09:07", housekeeper: "James" },
  { room: "304", event: "REVIEW", time: "09:42", housekeeper: "James" },
  { room: "304", event: "READY", time: "09:47", housekeeper: "James" },

  // --- PRIYA (Arrives 07:45) ---
  { room: "305", event: "DIRTY", time: "07:00" },
  { room: "305", event: "INSPECTION", time: "07:45", housekeeper: "Priya" },
  { room: "305", event: "CLEANING", time: "08:00", housekeeper: "Priya" },
  { room: "305", event: "REVIEW", time: "08:45", housekeeper: "Priya" },
  { room: "305", event: "READY", time: "08:50", housekeeper: "Priya" },

  { room: "401", event: "DIRTY", time: "08:50" },
  { room: "401", event: "INSPECTION", time: "08:50", housekeeper: "Priya" },
  { room: "401", event: "CLEANING", time: "09:05", housekeeper: "Priya" },
  { room: "401", event: "REVIEW", time: "09:30", housekeeper: "Priya" },
  { room: "401", event: "READY", time: "09:35", housekeeper: "Priya" },

  { room: "402", event: "DIRTY", time: "09:35" },
  { room: "402", event: "INSPECTION", time: "09:35", housekeeper: "Priya" },
  { room: "402", event: "CLEANING", time: "09:50", housekeeper: "Priya" },
  { room: "402", event: "LEAK_REPORT", time: "10:00", housekeeper: "Priya", note: "Bathroom leaking badly" },
  { room: "402", event: "BLOCKED", time: "10:02", housekeeper: "Priya" },

  { room: "405", event: "CLEANING", time: "10:05", housekeeper: "Priya" },
  { room: "405", event: "READY", time: "10:50", housekeeper: "Priya" },

  // --- SOFIA (Arrives 08:15) ---
  { room: "403", event: "DIRTY", time: "07:00" },
  { room: "403", event: "INSPECTION", time: "08:15", housekeeper: "Sofia" },
  { room: "403", event: "CLEANING", time: "08:30", housekeeper: "Sofia" },
  { room: "403", event: "REVIEW", time: "09:05", housekeeper: "Sofia" },
  { room: "403", event: "READY", time: "09:10", housekeeper: "Sofia" },

  { room: "503", event: "DIRTY", time: "09:10" },
  { room: "503", event: "INSPECTION", time: "09:10", housekeeper: "Sofia" },
  { room: "503", event: "CLEANING", time: "09:25", housekeeper: "Sofia" },
  { room: "503", event: "REVIEW", time: "10:00", housekeeper: "Sofia" },
  { room: "503", event: "READY", time: "10:05", housekeeper: "Sofia" },

  { room: "505", event: "DIRTY", time: "10:05" },
  { room: "505", event: "INSPECTION", time: "10:05", housekeeper: "Sofia" },
  { room: "505", event: "CLEANING", time: "10:20", housekeeper: "Sofia" },
  { room: "505", event: "REVIEW", time: "11:05", housekeeper: "Sofia" },
  { room: "505", event: "READY", time: "11:10", housekeeper: "Sofia" },

  // --- EMPTY ROOM ARRIVALS ---
  { room: "501", event: "OCCUPIED", time: "13:00" },
  { room: "504", event: "OCCUPIED", time: "13:00" },
];

export interface SimState {
  rooms: Record<string, Room & { 
    startedAt?: string; 
    elapsed?: number; 
    remaining?: number; 
    damageReported?: boolean; 
    tvIssue?: boolean;
    isBlocked?: boolean;
  }>;
  housekeepers: Record<string, {
    name: string;
    status: "Inspecting" | "Cleaning" | "Available" | "Not Arrived" | "ABSENT";
    currentRoom?: string;
    startedAt?: string;
    elapsed?: number;
    completed: string[];
    nextInQueue?: string;
  }>;
  reviewQueue: { room: string; housekeeper: string; timeEntered: string }[];
}

export function compileSimulation(simTime: string): SimState {
  const currentMinutes = timeToMinutes(simTime);

  const roomsState: SimState["rooms"] = {};
  hotelRoomsBase.forEach((r) => {
    const isOccupied = r.number !== "501" && r.number !== "504";
    roomsState[r.number] = {
      ...r,
      status: isOccupied ? "occupied" : "ready",
      label: isOccupied ? "Occupied" : "Empty",
    };
  });

  const hkState: SimState["housekeepers"] = {};
  Object.keys(housekeeperAssignments).forEach((name) => {
    const arrivalMins = timeToMinutes(HK_ARRIVALS[name]);
    const arrived = currentMinutes >= arrivalMins;
    hkState[name] = {
      name,
      status: arrived ? "Available" : "Not Arrived",
      completed: [],
    };
  });

  const flags = {
    damage204: false,
    tv303: false,
    blocked402: false,
  };

  const activeEvents = masterTimeline.filter((e) => timeToMinutes(e.time) <= currentMinutes);
  activeEvents.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

  activeEvents.forEach((ev) => {
    const room = roomsState[ev.room];
    if (!room) return;

    if (ev.event === "DAMAGE_REPORT") {
      flags.damage204 = true;
      room.damageReported = true;
      return;
    }
    if (ev.event === "TV_REPORT") {
      flags.tv303 = true;
      room.tvIssue = true;
      return;
    }
    if (ev.event === "LEAK_REPORT") {
      return;
    }

    if (ev.event === "BLOCKED") {
      flags.blocked402 = true;
      room.status = "blocked";
      room.isBlocked = true;
      room.label = "Blocked";
      return;
    }

    if (ev.event === "DIRTY") {
      room.status = "dirty";
      room.label = "Dirty";
    } else if (ev.event === "INSPECTION") {
      room.status = "inspection";
      room.label = "Inspecting";
      room.attendant = ev.housekeeper;
      room.startedAt = ev.time;
    } else if (ev.event === "CLEANING") {
      room.status = "cleaning";
      room.label = "Cleaning";
      room.attendant = ev.housekeeper;
      room.startedAt = ev.time;
    } else if (ev.event === "REVIEW") {
      room.status = "review";
      room.label = "Review Pending";
      room.attendant = ev.housekeeper;
    } else if (ev.event === "READY") {
      room.status = "ready";
      room.label = "Ready";
    } else if (ev.event === "OCCUPIED") {
      room.status = "occupied";
      room.label = "Occupied";
    }
  });

  // Calculate standards
  Object.keys(roomsState).forEach((num) => {
    const r = roomsState[num];
    if (r.startedAt && (r.status === "dirty" || r.status === "inspection" || r.status === "cleaning")) {
      const startMins = timeToMinutes(r.startedAt);
      const elapsed = currentMinutes - startMins;
      r.elapsed = elapsed >= 0 ? elapsed : 0;

      let standard = 25;
      if (r.status === "dirty" || r.status === "inspection") {
        standard = 15;
      } else {
        if (r.type === "DLX") standard = 35;
        if (r.type === "STE") standard = 45;
      }
      r.remaining = standard - r.elapsed;
    }
  });

  // derive housekeepers status
  masterTimeline.forEach((ev) => {
    if (!ev.housekeeper) return;
    const hk = hkState[ev.housekeeper];
    if (!hk) return;

    const evMins = timeToMinutes(ev.time);
    if (evMins > currentMinutes) return;

    if (ev.event === "READY") {
      if (!hk.completed.includes(ev.room)) {
        hk.completed.push(ev.room);
      }
    }

    if (ev.event === "INSPECTION") {
      hk.status = "Inspecting";
      hk.currentRoom = ev.room;
      hk.startedAt = ev.time;
    } else if (ev.event === "CLEANING") {
      hk.status = "Cleaning";
      hk.currentRoom = ev.room;
      hk.startedAt = ev.time;
    } else if (ev.event === "REVIEW") {
      hk.status = "Available";
      hk.currentRoom = undefined;
    } else if (ev.event === "BLOCKED") {
      hk.status = "Available";
      hk.currentRoom = undefined;
    }
  });

  Object.keys(hkState).forEach((name) => {
    const hk = hkState[name];
    if (hk.status === "Inspecting" || hk.status === "Cleaning") {
      const startMins = timeToMinutes(hk.startedAt || "08:00");
      hk.elapsed = currentMinutes - startMins;
    }

    const allAssigned = housekeeperAssignments[name] || [];
    const remaining = allAssigned.filter((r) => !hk.completed.includes(r) && r !== hk.currentRoom);
    
    if (name === "Priya" && flags.blocked402) {
      const idx402 = remaining.indexOf("402");
      if (idx402 !== -1) {
        remaining.splice(idx402, 1);
      }
      if (currentMinutes >= timeToMinutes("12:20") && !hk.completed.includes("405") && hk.currentRoom !== "405") {
        if (!remaining.includes("405")) remaining.push("405");
      }
    }

    hk.nextInQueue = remaining[0] || "None";
  });

  const reviewQueue: SimState["reviewQueue"] = [];
  masterTimeline.forEach((ev) => {
    if (ev.event === "REVIEW" && timeToMinutes(ev.time) <= currentMinutes) {
      reviewQueue.push({
        room: ev.room,
        housekeeper: ev.housekeeper || "Ana",
        timeEntered: ev.time,
      });
    }
  });

  masterTimeline.forEach((ev) => {
    if (ev.event === "READY" && timeToMinutes(ev.time) <= currentMinutes) {
      const idx = reviewQueue.findIndex((item) => item.room === ev.room);
      if (idx !== -1) {
        reviewQueue.splice(idx, 1);
      }
    }
  });

  return {
    rooms: roomsState,
    housekeepers: hkState,
    reviewQueue,
  };
}
