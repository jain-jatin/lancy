import { supabase, isRealSupabaseConfigured, mockDb, MockShift } from "../../db/supabase";
import { Room, Housekeeper } from "@/simulation/data";

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
      guestArrival: r.guest_arrival,
      earlyCheckIn: r.early_check_in,
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
    // Fresh queries — never cached
    const rooms = await this.getRooms();
    const housekeepers = await this.getHousekeepers();
    const currentMins = this.timeToMins(simTime);

    // Build room lines with full state
    const roomLines = rooms.map(r => {
      const hk = r.attendant || 'unassigned';
      const flags: string[] = [];
      if (r.earlyCheckIn) flags.push('EARLY CHECK-IN');
      if (r.damageReported) flags.push('DAMAGE REPORTED');
      if (r.note) flags.push(`MAINTENANCE: ${r.note}`);
      if (r.status === 'blocked') flags.push('BLOCKED');
      if (r.flagged) flags.push('FLAGGED');
      const flagStr = flags.length > 0 ? ` [${flags.join(' | ')}]` : '';
      return `Room ${r.number} | Floor ${r.floor} | ${r.type} | ${r.status} | ${hk}${flagStr}`;
    }).join('\n');

    // Build housekeeper lines with arrival awareness
    const hkLines = housekeepers.map(h => {
      const arrTime = this.hkArrivals[h.name] || '08:00';
      const arrived = currentMins >= this.timeToMins(arrTime);
      if (h.status === 'ABSENT') return `${h.name}: ABSENT`;
      if (!arrived) return `${h.name}: NOT YET ARRIVED (arrives ${arrTime})`;
      if (!h.current_room) return `${h.name}: IDLE (available)`;
      return `${h.name}: ${h.current_activity} in Room ${h.current_room}`;
    }).join('\n');

    // Build review queue
    const reviewRooms = rooms.filter(r => r.status === 'review');
    const reviewLines = reviewRooms.length > 0
      ? reviewRooms.map(r => `Room ${r.number} (${r.type}, Floor ${r.floor}), attendant: ${r.attendant || 'unknown'}`).join('\n')
      : 'None';

    // Counts for quick reference
    const counts = {
      dirty: rooms.filter(r => r.status === 'dirty').length,
      inspection: rooms.filter(r => r.status === 'inspection').length,
      cleaning: rooms.filter(r => r.status === 'cleaning').length,
      review: reviewRooms.length,
      blocked: rooms.filter(r => r.status === 'blocked').length,
      ready: rooms.filter(r => r.status === 'ready').length,
      occupied: rooms.filter(r => r.status === 'occupied').length,
    };

    // Proactive context: derive overdue, maintenance, incidents from live data
    const expectedDurations: Record<string, Record<string, number>> = {
      inspection: { STD: 15, DLX: 15, STE: 15 },
      cleaning: { STD: 25, DLX: 35, STE: 45 },
    };

    const overdueRooms = rooms.filter(r => {
      if (r.status !== 'inspection' && r.status !== 'cleaning') return false;
      if (!r.startedAt) return false;
      const startMins = this.timeToMins(r.startedAt);
      const elapsed = currentMins - startMins;
      const expected = expectedDurations[r.status]?.[r.type] || 25;
      return elapsed > expected;
    }).map(r => {
      const startMins = this.timeToMins(r.startedAt!);
      const elapsed = currentMins - startMins;
      const expected = expectedDurations[r.status]?.[r.type] || 25;
      return `Room ${r.number} has been in ${r.status} for ${elapsed}m (expected ${expected}m) OVERDUE`;
    });

    const maintenanceTickets = rooms.filter(r => r.status === 'blocked' || r.note).map(r => {
      const desc = r.note || 'Blocked, reason unknown';
      const severity = r.status === 'blocked' ? 'MAJOR' : 'MINOR';
      return `Room ${r.number}: ${desc} (${severity})`;
    });

    const incidents = rooms.filter(r => r.damageReported || r.flagged).map(r => {
      const desc = r.damageReported ? 'Damage reported' : 'Flagged for attention';
      return `Room ${r.number}: ${desc}`;
    });

    const proactiveContext = `
THINGS THAT NEED ATTENTION RIGHT NOW:
${maintenanceTickets.length > 0
  ? maintenanceTickets.map(t => `Maintenance ticket open: ${t}`).join('\n')
  : 'No open maintenance tickets'}

${overdueRooms.length > 0
  ? 'OVERDUE:\n' + overdueRooms.join('\n')
  : 'All rooms on track'}

${incidents.length > 0
  ? incidents.map(i => `Incident logged: ${i}`).join('\n')
  : 'No incidents logged this shift'}
`;

    const basePrompt = `
You are Lancy, AI operations partner for Marcus at Maplewood Suites.
Current simulation time: ${simTime}.

LIVE ROOM DATA (read this before every response):
${roomLines}

COUNTS: ${counts.dirty} dirty, ${counts.inspection} inspecting, ${counts.cleaning} cleaning, ${counts.review} pending review, ${counts.blocked} blocked, ${counts.ready} ready, ${counts.occupied} occupied

LIVE HOUSEKEEPER DATA:
${hkLines}

PENDING REVIEWS:
${reviewLines}

TASK DURATIONS (from database):
- Inspection: 15 minutes (all room types)
- Cleaning STD: 25 minutes
- Cleaning DLX: 35 minutes
- Cleaning STE: 45 minutes
${proactiveContext}
RULES:
- When Marcus asks for room status, read the LIVE ROOM DATA above and report it directly. Do not say you are monitoring. Do not say let me know if you need anything. Show the actual data.
- When the data above shows too many rooms to list cleanly, group them by status.
- Never fabricate a room status. Never deflect with a generic response when you have real data in front of you.
- If a question requires data not shown above, say exactly what you do not know. Do not guess.
- Never use em dashes or double hyphens. Use commas, colons, or parentheses instead.
- Respond concisely: 2 sentences max unless building a full status report or plan.
- Never mark a room READY without Marcus confirming.
- Never assign a housekeeper without Marcus confirming.
- If a room is overdue, flag it with the word OVERDUE.
- Stay focused on housekeeping operations only.
- Language: English only.
`;

    if (context?.role === 'housekeeper' && context.hkName) {
      const hk = housekeepers.find(h => h.name === context.hkName);
      if (hk) {
        return basePrompt + `
HOUSEKEEPER CONTEXT (you are speaking with ${hk.name}):
Current room: ${hk.current_room || 'none'}
Current activity: ${hk.current_activity || 'idle'}
Rooms completed: ${(hk.rooms_completed || []).join(', ') || 'none yet'}
Remaining queue: ${(hk.rooms || []).filter(r => !(hk.rooms_completed || []).includes(r)).join(', ') || 'all done'}

You already know which room ${hk.name} is in and what they are doing. Never ask them.
Reference their room and activity naturally in your responses.
`;
      }
    }

    return basePrompt;
  }
};
