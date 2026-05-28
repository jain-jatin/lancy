import { createClient } from "@supabase/supabase-js";
import { rooms as initialRooms, housekeepers as initialHousekeepers, Room, Housekeeper } from "@/simulation/data";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isRealSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isRealSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const LS_ROOMS_KEY = "lancy_local_rooms";
const LS_HKS_KEY = "lancy_local_housekeepers";
const LS_MSGS_KEY = "lancy_local_messages";
const LS_NUDGES_KEY = "lancy_local_nudges";
const LS_SHIFT_KEY = "lancy_local_shift";
const LS_SUPERVISOR_CARDS_KEY = "lancy_local_supervisor_cards";
const LS_MAINTENANCE_TICKETS_KEY = "lancy_local_maintenance_tickets";
const LS_INCIDENTS_KEY = "lancy_local_incidents";

export interface MockShift {
  id: string;
  time: string;
  speed: number;
  status: "active" | "paused";
  started: boolean;
}

const defaultShift: MockShift = {
  id: "demo-shift-id",
  time: "10:00",
  speed: 1,
  status: "active",
  started: false,
};

if (typeof window !== "undefined") {
  if (localStorage.getItem(LS_HKS_KEY)) {
    try {
      const stored = JSON.parse(localStorage.getItem(LS_HKS_KEY) || "[]");
      if (stored.length > 0 && !("current_room" in stored[0])) {
        localStorage.removeItem(LS_ROOMS_KEY);
        localStorage.removeItem(LS_HKS_KEY);
        localStorage.removeItem(LS_MSGS_KEY);
        localStorage.removeItem(LS_SHIFT_KEY);
        localStorage.removeItem(LS_SUPERVISOR_CARDS_KEY);
        localStorage.removeItem(LS_MAINTENANCE_TICKETS_KEY);
        localStorage.removeItem(LS_INCIDENTS_KEY);
      }
    } catch (e) {
      // ignore
    }
  }

  if (!localStorage.getItem(LS_ROOMS_KEY)) {
    localStorage.setItem(LS_ROOMS_KEY, JSON.stringify(initialRooms));
  }
  if (!localStorage.getItem(LS_HKS_KEY)) {
    localStorage.setItem(LS_HKS_KEY, JSON.stringify(initialHousekeepers));
  }
  if (!localStorage.getItem(LS_MSGS_KEY)) {
    localStorage.setItem(LS_MSGS_KEY, JSON.stringify([]));
  }
  if (!localStorage.getItem(LS_NUDGES_KEY)) {
    localStorage.setItem(LS_NUDGES_KEY, JSON.stringify([]));
  }
  if (!localStorage.getItem(LS_SHIFT_KEY)) {
    localStorage.setItem(LS_SHIFT_KEY, JSON.stringify(defaultShift));
  }
  if (!localStorage.getItem(LS_SUPERVISOR_CARDS_KEY)) {
    localStorage.setItem(LS_SUPERVISOR_CARDS_KEY, JSON.stringify([]));
  }
  if (!localStorage.getItem(LS_MAINTENANCE_TICKETS_KEY)) {
    localStorage.setItem(LS_MAINTENANCE_TICKETS_KEY, JSON.stringify([]));
  }
  if (!localStorage.getItem(LS_INCIDENTS_KEY)) {
    localStorage.setItem(LS_INCIDENTS_KEY, JSON.stringify([]));
  }
}

const dispatchMockDbUpdate = (tableName: string) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("lancy-mock-db-update", { detail: { table: tableName } }));
  }
};

export const mockDb = {
  getRooms(): Room[] {
    if (typeof window === "undefined") return initialRooms;
    const stored = localStorage.getItem(LS_ROOMS_KEY);
    if (!stored || stored === "[]") {
      localStorage.setItem(LS_ROOMS_KEY, JSON.stringify(initialRooms));
      return initialRooms;
    }
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        localStorage.setItem(LS_ROOMS_KEY, JSON.stringify(initialRooms));
        return initialRooms;
      }
      return parsed;
    } catch (e) {
      localStorage.setItem(LS_ROOMS_KEY, JSON.stringify(initialRooms));
      return initialRooms;
    }
  },

  updateRoom(number: string, updates: Partial<Room>): Room {
    const rooms = this.getRooms();
    const index = rooms.findIndex((r) => r.number === number);
    if (index === -1) {
      const fallbackRoom: Room = {
        number,
        floor: parseInt(number.charAt(0), 10),
        type: number === "205" || number === "305" || number === "505" ? "STE" : (number.endsWith("3") || number.endsWith("4") ? "DLX" : "STD"),
        status: "dirty",
        label: "Dirty",
        ...updates
      };
      rooms.push(fallbackRoom);
      localStorage.setItem(LS_ROOMS_KEY, JSON.stringify(rooms));
      dispatchMockDbUpdate("rooms");
      return fallbackRoom;
    }
    
    rooms[index] = { ...rooms[index], ...updates };
    localStorage.setItem(LS_ROOMS_KEY, JSON.stringify(rooms));
    dispatchMockDbUpdate("rooms");
    return rooms[index];
  },

  getHousekeepers(): Housekeeper[] {
    if (typeof window === "undefined") return initialHousekeepers;
    const stored = localStorage.getItem(LS_HKS_KEY);
    if (!stored || stored === "[]") {
      localStorage.setItem(LS_HKS_KEY, JSON.stringify(initialHousekeepers));
      return initialHousekeepers;
    }
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        localStorage.setItem(LS_HKS_KEY, JSON.stringify(initialHousekeepers));
        return initialHousekeepers;
      }
      return parsed;
    } catch (e) {
      localStorage.setItem(LS_HKS_KEY, JSON.stringify(initialHousekeepers));
      return initialHousekeepers;
    }
  },

  updateHousekeeper(name: string, updates: Partial<Housekeeper>): Housekeeper {
    const hks = this.getHousekeepers();
    const index = hks.findIndex((h) => h.name === name);
    if (index === -1) {
      const fallbackHk: Housekeeper = {
        name,
        rooms: [],
        status: "available",
        active: true,
        rooms_completed: 0,
        ...updates
      };
      hks.push(fallbackHk);
      localStorage.setItem(LS_HKS_KEY, JSON.stringify(hks));
      dispatchMockDbUpdate("housekeepers");
      return fallbackHk;
    }

    hks[index] = { ...hks[index], ...updates };
    localStorage.setItem(LS_HKS_KEY, JSON.stringify(hks));
    dispatchMockDbUpdate("housekeepers");
    return hks[index];
  },

  getShift(): MockShift {
    if (typeof window === "undefined") return defaultShift;
    return JSON.parse(localStorage.getItem(LS_SHIFT_KEY) || JSON.stringify(defaultShift));
  },

  updateShift(updates: Partial<MockShift>): MockShift {
    const shift = this.getShift();
    const updated = { ...shift, ...updates };
    localStorage.setItem(LS_SHIFT_KEY, JSON.stringify(updated));
    dispatchMockDbUpdate("shift");
    return updated;
  },

  getMessages(): any[] {
    if (typeof window === "undefined") return [];
    return JSON.parse(localStorage.getItem(LS_MSGS_KEY) || "[]");
  },

  addMessage(msg: { role: "lancy" | "supervisor" | "hk"; sender: string; content: string; type?: string; actionData?: any }): any {
    const msgs = this.getMessages();
    const newMsg = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...msg,
    };
    msgs.push(newMsg);
    localStorage.setItem(LS_MSGS_KEY, JSON.stringify(msgs));
    dispatchMockDbUpdate("messages");
    return newMsg;
  },

  getSupervisorCards(): any[] {
    if (typeof window === "undefined") return [];
    return JSON.parse(localStorage.getItem(LS_SUPERVISOR_CARDS_KEY) || "[]");
  },

  addSupervisorCard(card: any): any {
    const cards = this.getSupervisorCards();
    const newCard = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      resolved: false,
      ...card
    };
    cards.push(newCard);
    localStorage.setItem(LS_SUPERVISOR_CARDS_KEY, JSON.stringify(cards));
    dispatchMockDbUpdate("supervisor_cards");
    return newCard;
  },

  getMaintenanceTickets(): any[] {
    if (typeof window === "undefined") return [];
    return JSON.parse(localStorage.getItem(LS_MAINTENANCE_TICKETS_KEY) || "[]");
  },

  addMaintenanceTicket(ticket: any): any {
    const tickets = this.getMaintenanceTickets();
    const newTicket = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...ticket
    };
    tickets.push(newTicket);
    localStorage.setItem(LS_MAINTENANCE_TICKETS_KEY, JSON.stringify(tickets));
    dispatchMockDbUpdate("maintenance_tickets");
    return newTicket;
  },

  getIncidents(): any[] {
    if (typeof window === "undefined") return [];
    return JSON.parse(localStorage.getItem(LS_INCIDENTS_KEY) || "[]");
  },

  addIncident(incident: any): any {
    const incidents = this.getIncidents();
    const newIncident = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...incident
    };
    incidents.push(newIncident);
    localStorage.setItem(LS_INCIDENTS_KEY, JSON.stringify(incidents));
    dispatchMockDbUpdate("incidents");
    return newIncident;
  },

  resetAll() {
    localStorage.setItem(LS_ROOMS_KEY, JSON.stringify(initialRooms));
    localStorage.setItem(LS_HKS_KEY, JSON.stringify(initialHousekeepers));
    localStorage.setItem(LS_MSGS_KEY, JSON.stringify([]));
    localStorage.setItem(LS_NUDGES_KEY, JSON.stringify([]));
    localStorage.setItem(LS_SHIFT_KEY, JSON.stringify(defaultShift));
    localStorage.setItem(LS_SUPERVISOR_CARDS_KEY, JSON.stringify([]));
    localStorage.setItem(LS_MAINTENANCE_TICKETS_KEY, JSON.stringify([]));
    localStorage.setItem(LS_INCIDENTS_KEY, JSON.stringify([]));
    dispatchMockDbUpdate("all");
  }
};
