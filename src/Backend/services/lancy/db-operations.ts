import { supabase, isRealSupabaseConfigured, mockDb, MockShift } from "../../db/supabase";
import { Room, Housekeeper, rooms as initialRooms, housekeepers as initialHousekeepers, CHECKOUT_ROOMS } from "@/simulation/data";
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

    // Auto-seed if the database is empty
    if (data.length === 0) {
      try {
        const seedData = initialRooms.map((r) => ({
          number: r.number,
          floor: r.floor,
          type: r.type,
          status: r.status,
          label: r.label,
          attendant: r.attendant || null,
          scheduled_start_time: r.scheduled_start_time || null,
          scheduled_end_time: r.scheduled_end_time || null,
        }));
        await supabase!.from("rooms").insert(seedData);
        return initialRooms;
      } catch (err) {
        console.warn("Auto-seeding Supabase rooms failed:", err);
      }
    }

    return data.map((r: any) => ({
      number: r.room_number || r.number,
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
      scheduled_start_time: r.scheduled_start_time,
      scheduled_end_time: r.scheduled_end_time,
      actual_start_time: r.actual_start_time,
      actual_end_time: r.actual_end_time,
      cleaned_by_name: r.cleaned_by_name,
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
      if (updates.scheduled_start_time !== undefined) dbUpdates.scheduled_start_time = updates.scheduled_start_time;
      if (updates.scheduled_end_time !== undefined) dbUpdates.scheduled_end_time = updates.scheduled_end_time;
      if (updates.actual_start_time !== undefined) dbUpdates.actual_start_time = updates.actual_start_time;
      if (updates.actual_end_time !== undefined) dbUpdates.actual_end_time = updates.actual_end_time;
      if (updates.cleaned_by_name !== undefined) dbUpdates.cleaned_by_name = updates.cleaned_by_name;
    }

    // Sync with room_assignments table in Supabase
    if (supabase) {
      try {
        const today = new Date().toISOString().split('T')[0];

        const toLocalISO = (hours: number, minutes: number) => {
          const d = new Date()
          d.setHours(hours, minutes, 0, 0)
          d.setSeconds(0, 0)
          d.setMilliseconds(0)
          return d.toISOString()
        };

        const parseToLocalISO = (timeStr: string) => {
          if (timeStr.includes('T')) {
            const d = new Date(timeStr);
            return toLocalISO(d.getHours(), d.getMinutes());
          }
          const parts = timeStr.split(':').map(Number);
          if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            return toLocalISO(parts[0], parts[1]);
          }
          return new Date(timeStr).toISOString();
        };

        // Find existing assignment row
        const { data: existing } = await supabase
          .from('room_assignments')
          .select('id')
          .eq('room_number', number)
          .eq('shift_date', today)
          .limit(1);

        const assignmentUpdates: any = {
          status: status.toUpperCase()
        };
        if (updates) {
          if (updates.attendant !== undefined) assignmentUpdates.housekeeper_name = updates.attendant;
          if (updates.scheduled_start_time !== undefined && updates.scheduled_start_time !== null) {
            assignmentUpdates.scheduled_start = parseToLocalISO(updates.scheduled_start_time);
          }
          if (updates.scheduled_end_time !== undefined && updates.scheduled_end_time !== null) {
            assignmentUpdates.scheduled_end = parseToLocalISO(updates.scheduled_end_time);
          }
          if (updates.actual_start_time !== undefined) assignmentUpdates.actual_start = updates.actual_start_time;
          if (updates.actual_end_time !== undefined) assignmentUpdates.actual_end = updates.actual_end_time;
        }

        if (existing && existing.length > 0) {
          await supabase
            .from('room_assignments')
            .update(assignmentUpdates)
            .eq('id', existing[0].id);
        } else {
          // Get metadata if it is a new insert
          const { data: roomObj } = await supabase
            .from('rooms')
            .select('type, floor')
            .eq('number', number)
            .single();

          const rType = roomObj ? roomObj.type : 'STD';
          const rTypeLabel = rType === 'STE' ? 'Suite' : rType === 'DLX' ? 'Deluxe' : 'Standard';
          const rFloor = roomObj ? roomObj.floor : parseInt(number.charAt(0), 10);

          await supabase
            .from('room_assignments')
            .insert({
              room_number: number,
              housekeeper_name: updates?.attendant || 'Ana',
              room_type: rTypeLabel,
              floor: rFloor,
              shift_date: today,
              status: status.toUpperCase(),
              scheduled_start: assignmentUpdates.scheduled_start || toLocalISO(10, 0),
              scheduled_end: assignmentUpdates.scheduled_end || toLocalISO(10, 25),
              ...assignmentUpdates
            });
        }
      } catch (err) {
        console.warn("Syncing updateRoomStatus to room_assignments failed:", err);
      }
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

    // Auto-seed if the database is empty
    if (data.length === 0) {
      try {
        const seedData = initialHousekeepers.map((h) => ({
          name: h.name,
          rooms: h.rooms,
          active: h.active !== undefined ? h.active : true,
          status: h.status || "IDLE",
          current_room: h.current_room || null,
          current_activity: h.current_activity || null,
          rooms_completed: h.rooms_completed || [],
          next_room: h.next_room || null,
        }));
        await supabase!.from("housekeepers").insert(seedData);
        return initialHousekeepers;
      } catch (err) {
        console.warn("Auto-seeding Supabase housekeepers failed:", err);
      }
    }

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
    try {
      const dbUpdates: any = {};
      if (updates.active !== undefined) dbUpdates.active = updates.active;
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.current_room !== undefined) dbUpdates.current_room = updates.current_room;
      if (updates.current_activity !== undefined) dbUpdates.current_activity = updates.current_activity;
      if (updates.rooms_completed !== undefined) dbUpdates.rooms_completed = updates.rooms_completed;
      if (updates.next_room !== undefined) dbUpdates.next_room = updates.next_room;
      if (updates.rooms !== undefined) dbUpdates.rooms = updates.rooms;

      await supabase!
        .from("housekeepers")
        .update(dbUpdates)
        .eq("name", name);
    } catch (err) {
      console.warn("Supabase updateHousekeeper failed, falling back to mockDb:", err);
    }
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

  async getMaintenanceTickets(): Promise<any[]> {
    if (!isRealSupabaseConfigured) {
      return mockDb.getMaintenanceTickets();
    }
    const { data, error } = await supabase!
      .from("maintenance_tickets")
      .select("*")
      .order("created_at", { ascending: true });
    if (error || !data) return mockDb.getMaintenanceTickets();
    return data;
  },

  async addMaintenanceTicket(ticket: { room_number: string; issue: string; ticket_number: string }): Promise<any> {
    if (!isRealSupabaseConfigured) {
      return mockDb.addMaintenanceTicket(ticket);
    }
    const { data } = await supabase!
      .from("maintenance_tickets")
      .insert({
        room_number: ticket.room_number,
        issue: ticket.issue,
        ticket_number: ticket.ticket_number,
        status: "OPEN",
      })
      .select()
      .single();
    return data || mockDb.addMaintenanceTicket(ticket);
  },

  async addReceptionRelay(msg: string): Promise<any> {
    if (!isRealSupabaseConfigured) {
      return (mockDb as any).addReceptionRelay ? (mockDb as any).addReceptionRelay(msg) : { id: crypto.randomUUID(), message: msg };
    }
    const { data } = await supabase!
      .from("reception_relay")
      .insert({ message: msg })
      .select()
      .single();
    return data || ((mockDb as any).addReceptionRelay ? (mockDb as any).addReceptionRelay(msg) : { id: crypto.randomUUID(), message: msg });
  },

  /**
   * Build a fresh system prompt with LIVE database data on every call.
   * Never cache this. Call it before every single Gemini API invocation.
   */
  async buildLiveSystemPrompt(simTime: string, context?: { role: 'supervisor' | 'housekeeper'; hkName?: string }): Promise<string> {
    const tickets = await this.getMaintenanceTickets();
    const openTickets = tickets.filter(t => t.status === "OPEN" || t.status === undefined);

    const formatTimeForPrompt = (timeStr: string | null | undefined): string => {
      if (!timeStr) return '--';
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) {
        if (typeof timeStr === 'string' && timeStr.includes(':')) {
          const parts = timeStr.split(':');
          const h = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const displayH = h % 12 || 12;
          const ampm = h >= 12 ? 'PM' : 'AM';
          return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
        }
        return timeStr;
      }
      const hrs = date.getHours();
      const mins = date.getMinutes();
      const ampm = hrs >= 12 ? 'PM' : 'AM';
      const displayHrs = hrs % 12 || 12;
      return `${displayHrs}:${mins.toString().padStart(2, '0')} ${ampm}`;
    };

    let roomLines = '';

    // Try room_assignments first (FIX 4: status from DB is the single source of truth)
    if (isRealSupabaseConfigured && supabase) {
      try {
        const { data: assignments } = await supabase!
          .from('room_assignments')
          .select('*')
          .order('housekeeper_name')
          .order('queue_position');

        if (assignments && assignments.length > 0) {
          roomLines = assignments.map(r => {
            const rNum = r.room_number || r.number;
            const rType = r.room_type || r.type || 'Standard';
            const floor = rNum ? Math.floor(parseInt(rNum, 10) / 100) : 0;
            return `Room ${rNum} | ${rType} | Floor ${floor} | STATUS:${r.status} | HK:${r.housekeeper_name || 'unassigned'} | start:${formatTimeForPrompt(r.scheduled_start)} | end:${formatTimeForPrompt(r.scheduled_end)}`;
          }).join('\n');
        }
      } catch (e) {
        console.warn('buildLiveSystemPrompt: room_assignments query failed:', e);
      }
    }

    // Fallback to rooms table if room_assignments was empty or unavailable
    if (!roomLines) {
      const rooms = await this.getRooms();
      const checkoutRooms = rooms.filter(r => CHECKOUT_ROOMS.includes(r.number) && r.attendant);
      roomLines = checkoutRooms.map(r => {
        const rNum = r.number;
        const rType = r.type === 'STE' ? 'Suite' : r.type === 'DLX' ? 'Deluxe' : 'Standard';
        const hk = r.attendant || 'unassigned';
        const start = r.scheduled_start_time || '--';
        const end = r.scheduled_end_time || '--';
        return `Room ${rNum} | ${rType} | Floor ${r.floor} | STATUS:${(r.status || 'dirty').toUpperCase()} | HK:${hk} | start:${formatTimeForPrompt(start)} | end:${formatTimeForPrompt(end)}`;
      }).join('\n');
    }

    return `
You are Lancy. Read the STATUS column for every room.
Do not infer status from time comparisons.
STATUS is always one of: DIRTY CLEANING READY OCCUPIED.

DIRTY = waiting to be cleaned, not started yet.
CLEANING = housekeeper is actively in this room right now.
READY = cleaned and available for guest.
OCCUPIED = guest in room, not part of today's turnover.

Current time: ${simTime}.
Checkout: 10:00 AM. Checkin deadline: 1:00 PM.

ROOMS:
${roomLines}

OPEN MAINTENANCE TICKETS:
${openTickets.length > 0
        ? openTickets.map(t => `${t.ticket_number || t.id}: Room ${t.room_number || t.room} - ${t.issue}`).join('\n')
        : 'None'}

When answering about any housekeeper:
- CLEANING room = what they are doing RIGHT NOW
- DIRTY rooms assigned to them = UPCOMING only
- READY rooms = PAST, completed work

Never list a CLEANING room as upcoming.
Never list a DIRTY room as current.
Never fabricate room data. Read only from above.
Be concise. Under 3 sentences unless listing rooms.

CRITICAL TOOL USAGE RULES:
- If the user says anything like "assign room X to Y", "move room X to Y", "give room X to Y", "reassign room X to Y", "put room X with Y" — you MUST call the tool reassign_room_to_housekeeper with the room number and destination housekeeper name. Do NOT describe room status. ACT immediately.
- When you act on something (reassign, relay, ticket) confirm it clearly and state what you did.
English only.
`;
  }
};
