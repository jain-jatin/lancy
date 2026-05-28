import { supabase, isRealSupabaseConfigured, mockDb, MockShift } from "../../db/supabase";
import { Room, Housekeeper } from "@/simulation/data";
import { continuingRooms } from "@/simulation/engine";

export const dbOperations = {
  hkArrivals: {
    James: "07:12",
    Ana: "07:30",
    Priya: "07:45",
    Rosa: "07:53",
    Sofia: "08:15",
  } as Record<string, string>,

  timeToMins(t: string): number {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  },

  async getShift(): Promise<MockShift> {
    if (!isRealSupabaseConfigured) {
      return mockDb.getShift();
    }
    const { data, error } = await supabase!
      .from("shifts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) return mockDb.getShift();
    return {
      id: data.id,
      time: data.simulation_time ? new Date(data.simulation_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "10:00",
      speed: data.simulation_speed || 1,
      status: data.status === "active" ? "active" : "paused",
      started: data.status !== "pending",
    };
  },

  async updateShift(updates: Partial<MockShift>): Promise<MockShift> {
    if (!isRealSupabaseConfigured) {
      return mockDb.updateShift(updates);
    }
    const { data: current } = await supabase!.from("shifts").select("id").limit(1).single();
    if (current) {
      const dbUpdates: any = {};
      if (updates.status) dbUpdates.status = updates.status;
      if (updates.speed) dbUpdates.simulation_speed = updates.speed;
      await supabase!.from("shifts").update(dbUpdates).eq("id", current.id);
    }
    return mockDb.updateShift(updates);
  },

  async getRooms(): Promise<Room[]> {
    if (!isRealSupabaseConfigured) {
      return mockDb.getRooms();
    }
    const { data, error } = await supabase!
      .from("rooms")
      .select("*")
      .order("number", { ascending: true });
    if (error || !data) return mockDb.getRooms();
    return data.map((r: any) => ({
      number: r.number,
      floor: r.floor,
      type: r.type,
      status: r.status,
      label: r.label || "Occupied",
      attendant: r.attendant,
      startedAt: r.started_at,
      elapsed: r.elapsed,
      note: r.note,
      flagged: r.flagged,
      priority: r.priority,
    }));
  },

  async updateRoomStatus(number: string, status: Room["status"], updates?: Partial<Room>): Promise<Room> {
    if (!isRealSupabaseConfigured) {
      return mockDb.updateRoom(number, { status, ...updates });
    }
    const dbUpdates: any = { status };
    if (updates) {
      if (updates.attendant !== undefined) dbUpdates.attendant = updates.attendant;
      if (updates.startedAt !== undefined) dbUpdates.started_at = updates.startedAt;
      if (updates.elapsed !== undefined) dbUpdates.elapsed = updates.elapsed;
      if (updates.note !== undefined) dbUpdates.note = updates.note;
      if (updates.flagged !== undefined) dbUpdates.flagged = updates.flagged;
      if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
    }
    const { data, error } = await supabase!
      .from("rooms")
      .update(dbUpdates)
      .eq("number", number)
      .select()
      .single();
    if (error || !data) return mockDb.updateRoom(number, { status, ...updates });
    return mockDb.updateRoom(number, { status, ...updates });
  },

  async getHousekeepers(): Promise<Housekeeper[]> {
    if (!isRealSupabaseConfigured) {
      return mockDb.getHousekeepers();
    }
    const { data, error } = await supabase!
      .from("housekeepers")
      .select("*");
    if (error || !data) return mockDb.getHousekeepers();
    return data.map((h: any) => ({
      name: h.name,
      initials: h.initials,
      color: h.color,
      language: h.language,
      rooms: h.rooms || [],
      active: h.active,
      status: h.status,
      current_room: h.current_room,
      current_activity: h.current_activity,
      rooms_completed: h.rooms_completed,
      next_room: h.next_room,
    }));
  },

  async updateHousekeeper(name: string, updates: Partial<Housekeeper>): Promise<Housekeeper> {
    if (!isRealSupabaseConfigured) {
      return mockDb.updateHousekeeper(name, updates);
    }
    const dbUpdates: any = {};
    if (updates.active !== undefined) dbUpdates.active = updates.active;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.current_room !== undefined) dbUpdates.current_room = updates.current_room;
    if (updates.current_activity !== undefined) dbUpdates.current_activity = updates.current_activity;
    if (updates.rooms_completed !== undefined) dbUpdates.rooms_completed = updates.rooms_completed;
    if (updates.next_room !== undefined) dbUpdates.next_room = updates.next_room;
    
    await supabase!
      .from("housekeepers")
      .update(dbUpdates)
      .eq("name", name);
    return mockDb.updateHousekeeper(name, updates);
  },

  async getMessages(): Promise<any[]> {
    if (!isRealSupabaseConfigured) {
      return mockDb.getMessages();
    }
    const { data, error } = await supabase!
      .from("messages")
      .select("*")
      .order("created_at", { ascending: true });
    if (error || !data) return mockDb.getMessages();
    return data;
  },

  async addMessage(
    role: "lancy" | "supervisor" | "hk",
    sender: string,
    content: string,
    type?: string,
    actionData?: any
  ): Promise<any> {
    if (!isRealSupabaseConfigured) {
      return mockDb.addMessage({ role, sender, content, type, actionData });
    }
    const { data } = await supabase!
      .from("messages")
      .insert({
        role,
        sender,
        content,
        type,
        action_data: actionData,
      })
      .select()
      .single();
    return data || mockDb.addMessage({ role, sender, content, type, actionData });
  },

  resetAll() {
    mockDb.resetAll();
  },

  /**
   * Build a fresh system prompt with LIVE database data on every call.
   * Never cache this. Call it before every single Gemini API invocation.
   */
  async buildLiveSystemPrompt(simTime: string, context?: { role: 'supervisor' | 'housekeeper'; hkName?: string }): Promise<string> {
    const rooms = await this.getRooms();
    const housekeepers = await this.getHousekeepers();
    const currentMins = this.timeToMins(simTime);

    const roomLines = rooms.map(r => {
      const hk = r.attendant || 'unassigned';
      const isContinuing = continuingRooms.includes(r.number);
      const stayType = isContinuing ? 'continuing stay' : 'checkout';
      return `Room ${r.number} | Floor ${r.floor} | ${r.type} | ${stayType} | ${r.status} | ${hk}`;
    }).join('\n');

    const hkLines = housekeepers.map(h => {
      if (h.status === 'ABSENT') return `${h.name}: ABSENT`;
      if (!h.current_room) return `${h.name}: IDLE (available)`;
      return `${h.name}: CLEANING Room ${h.current_room}`;
    }).join('\n');

    const counts = {
      dirty: rooms.filter(r => r.status === 'dirty').length,
      cleaning: rooms.filter(r => r.status === 'cleaning').length,
      ready: rooms.filter(r => r.status === 'ready').length,
      occupied: rooms.filter(r => r.status === 'occupied').length,
    };

    const basePrompt = `
You are Lancy, AI operations partner for Marcus at Maplewood Suites.
Current simulation time: ${simTime}.

LIVE ROOM DATA (read this before every response):
${roomLines}

COUNTS: ${counts.dirty} dirty, ${counts.cleaning} cleaning, ${counts.ready} ready, ${counts.occupied} occupied

LIVE HOUSEKEEPER DATA:
${hkLines}

TASK DURATIONS:
- Standard (STD): 25 minutes
- Deluxe (DLX): 35 minutes
- Suite (STE): 45 minutes

RULES:
- When Marcus asks for room status, read the LIVE ROOM DATA above and report it directly.
- Never use em dashes or double hyphens. Use commas, colons, or parentheses instead.
- Respond concisely: 2 sentences max.
- Stay focused on housekeeping operations only.
`;

    if (context?.role === 'housekeeper' && context.hkName) {
      const hk = housekeepers.find(h => h.name === context.hkName);
      if (hk) {
        return basePrompt + `
HOUSEKEEPER CONTEXT (you are speaking with ${hk.name}):
Current room: ${hk.current_room || 'none'}
Remaining queue: ${(hk.rooms || []).filter(r => !(hk.rooms_completed || []).includes(r)).join(', ') || 'all done'}
`;
      }
    }

    return basePrompt;
  }
};
