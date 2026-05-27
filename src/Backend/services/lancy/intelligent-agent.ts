import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { supabase, isRealSupabaseConfigured, mockDb } from "../../db/supabase";
import { Room, Housekeeper } from "@/simulation/data";
import { apiClient } from "./api-client";
import { dbOperations } from "./db-operations";
import { workflowEngine } from "./workflow-engine";

export const LANCY_TOOLS: any[] = [
  {
    name: "update_room_status",
    description: "Update a room's operational status in the database. Call this when a housekeeper reports a transition (inspection done, cleaning done) or when a room needs to be blocked.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        room_number: { type: SchemaType.STRING, description: "Room number e.g. 303" },
        new_status: { 
          type: SchemaType.STRING, 
          enum: ["INSPECTION","CLEANING","REVIEW","BLOCKED","READY"],
          description: "The new status to set"
        },
        reason: { type: SchemaType.STRING, description: "Brief reason for the change" }
      },
      required: ["room_number", "new_status"]
    }
  },
  {
    name: "notify_supervisor",
    description: "Send an action card to Marcus's feed. Call this whenever something needs his attention or decision.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        card_type: { 
          type: SchemaType.STRING, 
          enum: ["INFO","WARNING","URGENT","DECISION","REVIEW_REQUEST"],
          description: "INFO for updates, WARNING for minor issues, URGENT for major issues, DECISION for choices, REVIEW_REQUEST when a room needs sign-off"
        },
        room_number: { type: SchemaType.STRING },
        title: { type: SchemaType.STRING, description: "Card headline" },
        message: { type: SchemaType.STRING, description: "Card body text" },
        option_a: { type: SchemaType.STRING, description: "First button label if DECISION card" },
        option_b: { type: SchemaType.STRING, description: "Second button label if DECISION card" }
      },
      required: ["card_type", "room_number", "title", "message"]
    }
  },
  {
    name: "create_maintenance_ticket",
    description: "Log a maintenance issue in the database. Call this when a housekeeper reports any physical room issue: broken fixtures, leaks, electrical, AC, TV etc.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        room_number: { type: SchemaType.STRING },
        issue_description: { type: SchemaType.STRING },
        severity: { 
          type: SchemaType.STRING, 
          enum: ["MINOR","MAJOR"],
          description: "MINOR for cosmetic or non-urgent. MAJOR for active leaks, flooding, electrical, anything that makes the room unsafe or unusable."
        },
        reported_by: { type: SchemaType.STRING, description: "Housekeeper name" }
      },
      required: ["room_number", "issue_description", "severity", "reported_by"]
    }
  },
  {
    name: "log_lost_and_found",
    description: "Log a found item or guest damage report. Call this when a housekeeper finds something left by a guest or reports guest-caused damage.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        room_number: { type: SchemaType.STRING },
        description: { type: SchemaType.STRING, description: "What was found or damaged" },
        type: { 
          type: SchemaType.STRING, 
          enum: ["LOST_ITEM","GUEST_DAMAGE"],
        },
        reported_by: { type: SchemaType.STRING }
      },
      required: ["room_number", "description", "type", "reported_by"]
    }
  },
  {
    name: "reassign_housekeeper",
    description: "Move a housekeeper from their current room to a different one. Call this when a room is blocked and the housekeeper needs a new assignment.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        housekeeper_name: { type: SchemaType.STRING },
        from_room: { type: SchemaType.STRING },
        to_room: { type: SchemaType.STRING },
        reason: { type: SchemaType.STRING }
      },
      required: ["housekeeper_name", "from_room", "to_room"]
    }
  },
  {
    name: "get_hotel_snapshot",
    description: "Retrieve full current state of all rooms and housekeepers. Call this when Marcus asks about the team, room status, or overall shift progress.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {}
    }
  }
];

export const executeTool = async (toolName: string, args: any): Promise<any> => {
  console.log(`[executeTool] Executing tool: ${toolName}`, args);
  switch (toolName) {
    case 'update_room_status': {
      const dbStatus = args.new_status === 'INSPECTION' ? 'dirty' : args.new_status === 'REVIEW' ? 'inspection' : args.new_status.toLowerCase();
      
      // Update room in DB
      await dbOperations.updateRoomStatus(args.room_number, dbStatus, { note: args.reason });
      
      // Also update the housekeeper's activity if appropriate
      const hks = await dbOperations.getHousekeepers();
      const attendant = hks.find(h => h.current_room === args.room_number || h.rooms.includes(args.room_number));
      if (attendant) {
        let act: Housekeeper["current_activity"] = null;
        if (args.new_status === 'INSPECTION') act = 'INSPECTION';
        if (args.new_status === 'CLEANING') act = 'CLEANING';
        
        let roomsCompleted = attendant.rooms_completed || [];
        let nextRoom: string | null = attendant.next_room ?? null;
        let currentRoom: string | null = attendant.current_room ?? null;
        
        if (args.new_status === 'READY') {
          currentRoom = null;
          act = null;
          if (!roomsCompleted.includes(args.room_number)) {
            roomsCompleted.push(args.room_number);
          }
          if (attendant.next_room) {
            currentRoom = attendant.next_room;
            act = 'INSPECTION';
            nextRoom = null;
            await dbOperations.updateRoomStatus(currentRoom, "dirty", { attendant: attendant.name });
          }
        }
        
        await dbOperations.updateHousekeeper(attendant.name, {
          current_activity: act,
          current_room: currentRoom,
          next_room: nextRoom,
          rooms_completed: roomsCompleted
        });
      }
      break;
    }

    case 'notify_supervisor': {
      if (isRealSupabaseConfigured) {
        await supabase!
          .from('supervisor_cards')
          .insert({
            card_type: args.card_type,
            room_number: args.room_number,
            title: args.title,
            message: args.message,
            option_a: args.option_a || null,
            option_b: args.option_b || null,
            created_at: new Date()
          });
      } else {
        mockDb.addSupervisorCard({
          card_type: args.card_type,
          room_number: args.room_number,
          title: args.title,
          message: args.message,
          option_a: args.option_a || null,
          option_b: args.option_b || null,
        });
      }
      break;
    }

    case 'create_maintenance_ticket': {
      if (isRealSupabaseConfigured) {
        await supabase!.from('maintenance_tickets').insert({
          room_number: args.room_number,
          description: args.issue_description,
          severity: args.severity,
          reported_by: args.reported_by,
          status: 'OPEN'
        });
      } else {
        mockDb.addMaintenanceTicket({
          room_number: args.room_number,
          description: args.issue_description,
          severity: args.severity,
          reported_by: args.reported_by,
          status: 'OPEN'
        });
      }
      
      // If MAJOR, also call notify_supervisor with URGENT card
      if (args.severity === 'MAJOR') {
        await executeTool('notify_supervisor', {
          card_type: 'URGENT',
          room_number: args.room_number,
          title: `Major Issue: Room ${args.room_number}`,
          message: `${args.reported_by} reports: ${args.issue_description}`,
          option_a: 'Stop + Block Room',
          option_b: 'Continue with Caution'
        });
      } else {
        // For MINOR issues, notify supervisor with DECISION card as described in prompt
        await executeTool('notify_supervisor', {
          card_type: 'DECISION',
          room_number: args.room_number,
          title: `Minor Issue: Room ${args.room_number}`,
          message: `${args.reported_by} reports the TV is not functioning in Room ${args.room_number}. Do you want to continue cleaning or pause for maintenance?`,
          option_a: 'Continue Cleaning',
          option_b: 'Pause'
        });
      }
      break;
    }

    case 'log_lost_and_found': {
      if (isRealSupabaseConfigured) {
        await supabase!.from('incidents').insert({
          room_number: args.room_number,
          description: args.description,
          type: args.type,
          reported_by: args.reported_by
        });
      } else {
        mockDb.addIncident({
          room_number: args.room_number,
          description: args.description,
          type: args.type,
          reported_by: args.reported_by
        });
      }
      break;
    }

    case 'reassign_housekeeper': {
      if (isRealSupabaseConfigured) {
        await supabase!
          .from('housekeepers')
          .update({ 
            current_room: args.to_room, 
            current_activity: 'INSPECTION' 
          })
          .eq('name', args.housekeeper_name);
      }
      
      await dbOperations.updateHousekeeper(args.housekeeper_name, {
        current_room: args.to_room,
        current_activity: 'INSPECTION'
      });
      
      if (args.from_room) {
        await dbOperations.updateRoomStatus(args.from_room, "dirty", { attendant: undefined });
      }
      await dbOperations.updateRoomStatus(args.to_room, "dirty", { attendant: args.housekeeper_name });
      break;
    }

    case 'get_hotel_snapshot': {
      const snapshot = await buildHotelSnapshot();
      return snapshot;
    }
  }
};

async function buildHotelSnapshot(): Promise<string> {
  const rooms = await dbOperations.getRooms();
  const housekeepers = await dbOperations.getHousekeepers();
  
  const roomsStr = rooms.map(r => {
    const hk = r.attendant || 'Unassigned';
    return `Room ${r.number} (${r.type}): ${r.status}, Attendant: ${hk}`;
  }).join('\n');

  const hksStr = housekeepers.map(hk => {
    const status = hk.current_room ? `${hk.current_activity} in Room ${hk.current_room}` : 'IDLE';
    return `${hk.name}: ${status}`;
  }).join('\n');

  return `Current state:\n\nROOMS:\n${roomsStr}\n\nHOUSEKEEPERS:\n${hksStr}`;
}

export const intelligentAgent = {
  async buildAutoRecommendation(simulationTime: string): Promise<{ msg: string; recommendations: Array<{ roomNumber: string; hkName: string }> }> {
    const rooms = await dbOperations.getRooms();
    const housekeepers = await dbOperations.getHousekeepers();

    // Find unassigned dirty rooms
    const unassigned = rooms
      .filter(r => r.status === "dirty" && !r.attendant)
      .sort((a, b) => {
        const typeOrder = { STE: 0, DLX: 1, STD: 2 };
        const earlyA = a.earlyCheckIn ? 1 : 0;
        const earlyB = b.earlyCheckIn ? 1 : 0;
        if (earlyA !== earlyB) return earlyB - earlyA;
        return typeOrder[a.type] - typeOrder[b.type];
      });

    // Find available housekeepers (arrived + idle)
    const currentMins = dbOperations.timeToMins(simulationTime);
    const available = housekeepers.filter(hk => {
      const arrTime = dbOperations.hkArrivals[hk.name] || "08:00";
      return currentMins >= dbOperations.timeToMins(arrTime) && !hk.current_room;
    });

    // Find pending reviews
    const reviews = rooms.filter(r => r.status === "review");

    if (simulationTime === "08:00") {
      return {
        msg: `Good morning, Marcus! Shift starting.\n\nHere is today's overview. We have 15 checkouts to handle and 5 housekeepers scheduled today.\n\nWould you like to see today's shift summary or review assignments?`,
        recommendations: []
      };
    }

    if (simulationTime === "10:00") {
      let msg = `Hi Marcus! We are mid-shift at 10:00.\n\n`;
      if (reviews.length > 0) {
        msg += `• REVIEWS: ${reviews.length} rooms are cleaned and waiting for your inspection sign-off.\n`;
      }
      const dirtyCount = rooms.filter(r => r.status === "dirty").length;
      msg += `• STATUS: We have ${dirtyCount} remaining dirty rooms currently in queue.\n`;
      msg += `• ATTENDANTS: Housekeepers are actively working on their designated floors.\n\n`;
      msg += `Would you like to view the live housekeeper map, check room turnaround priorities, or review pending tasks?`;

      return {
        msg,
        recommendations: []
      };
    }

    let msg = `Lancy Auto-Recommendation for ${simulationTime}:\n\n`;
    const recommendations: Array<{ roomNumber: string; hkName: string }> = [];

    if (unassigned.length > 0 && available.length > 0) {
      msg += `ASSIGNMENTS READY: I have ${unassigned.length} room${unassigned.length > 1 ? "s" : ""} to assign.\n\n`;
      unassigned.slice(0, available.length).forEach((room, i) => {
        const hk = available[i];
        let recLine = `Room ${room.number} (${room.type}, Floor ${room.floor})`;
        if (room.earlyCheckIn) recLine += `, EARLY CHECK-IN`;
        recLine += `\nRecommended: ${hk.name}\n\n`;
        msg += recLine;
        recommendations.push({ roomNumber: room.number, hkName: hk.name });
      });
    } else if (unassigned.length > 0 && available.length === 0) {
      msg += `${unassigned.length} rooms still dirty but no housekeepers are free right now. I will notify you as soon as one finishes.`;
    }

    return { msg, recommendations };
  },

  async housekeeperChat(name: string, text: string): Promise<string> {
    return intelligentAgent.processHousekeeperMessage(name, text);
  },

  async processHousekeeperMessage(hkName: string, text: string): Promise<string> {
    console.log(`[processHousekeeperMessage] Housekeeper ${hkName} sent: "${text}"`);
    const cleanMsg = text.trim().toLowerCase();
    const hks = await dbOperations.getHousekeepers();
    const hk = hks.find(h => h.name.toLowerCase() === hkName.toLowerCase());
    if (!hk) return "Housekeeper not found.";

    const rooms = await dbOperations.getRooms();
    const currentRoom = rooms.find(r => r.number === hk.current_room);

    // 1. Add housekeeper message to message history so supervisor and cleaner views can see it
    await dbOperations.addMessage("hk", hkName, text);

    // TRACK 1 - Deterministic Housekeeper Intent Matching Fallback
    const fallbackHandler = async () => {
      if (cleanMsg.includes("sick") || cleanMsg.includes("cannot come") || cleanMsg.includes("not feeling well") || cleanMsg.includes("cannot make it") || cleanMsg.includes("won't be able") || cleanMsg.includes("can't make")) {
        await dbOperations.updateHousekeeper(hk.name, { status: "ABSENT" });
        return "I am sorry to hear that. I hope you feel better soon. I have let Marcus know and will sort out your rooms.";
      }

      if (cleanMsg.includes("late") || cleanMsg.includes("running late")) {
        return `I will let Marcus know you are running late. Your rooms will wait for your arrival, and I'll help you check in.`;
      }

      if (cleanMsg.includes("all good") || cleanMsg.includes("items ok") || cleanMsg.includes("nothing missing") || cleanMsg.includes("checked everything") || cleanMsg.includes("room is clear")) {
        if (hk.current_room) {
          await dbOperations.updateHousekeeper(hk.name, { current_activity: "INSPECTION" });
          await dbOperations.updateRoomStatus(hk.current_room, "dirty", { attendant: hk.name });
        }
        return "Got it. I have noted the room is clear and notified reception. You can start inspection now.";
      }

      if (cleanMsg.includes("inspection done") || cleanMsg.includes("checked the room") || cleanMsg.includes("ready to clean")) {
        if (hk.current_room) {
          await dbOperations.updateHousekeeper(hk.name, { current_activity: "CLEANING" });
          await dbOperations.updateRoomStatus(hk.current_room, "cleaning", { attendant: hk.name });
        }
        return `Inspection recorded. Starting cleaning mode for Room ${hk.current_room}. Let me know when done.`;
      }

      if (cleanMsg.includes("done") || cleanMsg.includes("finished") || cleanMsg.includes("room ready") || cleanMsg.includes("cleaning complete")) {
        if (hk.current_room) {
          await workflowEngine.markCleaningDone(hk.name);
        }
        return `Cleaning logged. I have sent Marcus a review request for Room ${hk.current_room}. You are free.`;
      }

      if (cleanMsg.includes("damage") || cleanMsg.includes("broken") || cleanMsg.includes("mirror") || cleanMsg.includes("lost") || cleanMsg.includes("found something") || cleanMsg.includes("left something")) {
        if (hk.current_room) {
          await dbOperations.updateRoomStatus(hk.current_room, "dirty", { damageReported: true });
        }
        return `Got it, logging that for Room ${hk.current_room || 'your room'}. Reception has been notified.`;
      }

      if (cleanMsg.includes("ac") || cleanMsg.includes("leak") || cleanMsg.includes("pipe") || cleanMsg.includes("tv") || cleanMsg.includes("light") || cleanMsg.includes("flood") || cleanMsg.includes("electrical")) {
        return cleanMsg.includes("leak") || cleanMsg.includes("flood") || cleanMsg.includes("electrical") || cleanMsg.includes("pipe")
          ? "This sounds serious. I am alerting Marcus now. Please pause and wait for his response."
          : "Flagged for maintenance. You can keep cleaning.";
      }

      if (cleanMsg.includes("marcus") || cleanMsg.includes("come") || cleanMsg.includes("supervisor")) {
        return "Marcus has been notified. He will be there shortly.";
      }

      return `Hi ${hk.name}, I'm monitoring Room ${hk.current_room || 'your assignment'}. Let me know if you need help!`;
    };

    // TRACK 2 - Gemini Housekeeper LLM Chat
    const buildFullHousekeeperContext = (housekeeper: Housekeeper, allRooms: Room[], simTime: string) => `
  You are Lancy. You are speaking with ${housekeeper.name}.
  
  WHAT YOU KNOW ABOUT ${housekeeper.name.toUpperCase()}:
  Status: ${housekeeper.status || 'PRESENT'} (PRESENT / ABSENT / IDLE / INSPECTION / CLEANING)
  Current room: ${housekeeper.current_room || 'none'}
  Current activity: ${housekeeper.current_activity || 'idle'}
  Rooms completed today: ${(housekeeper.rooms_completed || []).join(', ') || 'none yet'}
  Remaining queue: ${(housekeeper.rooms || []).filter(r => !(housekeeper.rooms_completed || []).includes(r)).join(', ') || 'all done'}
  
  FULL HOTEL CONTEXT:
  Simulation time: ${simTime}
  Total rooms ready: ${allRooms.filter(r => r.status === 'ready').length}
  Total rooms remaining: ${allRooms.filter(r => r.status !== 'ready' && r.status !== 'occupied').length}
  
  YOU ALWAYS KNOW:
  - Which room ${housekeeper.name} is currently in (no need for them to tell you)
  - What task they are doing (inspection or cleaning)
  - What their next room is
  - How long they have been in the current room
  - Whether they are running on time or behind
  
  NEVER ask ${housekeeper.name} which room they are in.
  NEVER ask them what they are doing.
  You already know. Reference it naturally in responses.
  
  Example: if James says "found something here"
  You say: "Got it, logging that for Room 303." 
  Not: "Which room are you in?"
`;

    const systemPrompt = `
${buildFullHousekeeperContext(hk, rooms, '10:00')}

INTENT DETECTION: use tools based on these instructions:

1. ITEMS CONFIRMED / ALL CLEAR:
   Phrases: "all good", "items ok", "nothing missing", "checked everything", "room is clear"
   Action: Call update_room_status with new_status="INSPECTION".

2. INSPECTION DONE:
   Phrases: "inspection done", "checked the room", "ready to clean"
   Action: Call update_room_status with new_status="CLEANING".

3. CLEANING DONE:
   Phrases: "done", "finished", "room ready", "cleaning complete"
   Action: Call update_room_status with new_status="REVIEW". Send Marcus an action card via notify_supervisor with card_type="REVIEW_REQUEST".

4. DAMAGE OR LOST ITEM:
   Phrases: "found something", "guest left something", "damage", "something broken by guest", "mirror broken", "guest damage"
   Action: Call log_lost_and_found and notify_supervisor with card_type="INFO".

5. MAINTENANCE ISSUE:
   Phrases: "AC not working", "leaking", "pipe", "TV broken", "light not working", "flooding", "electrical"
   Action: Call create_maintenance_ticket with severity MINOR (TV, light, cosmetic) or MAJOR (leak, flood, electrical, active pipe failure).

6. NEED SUPERVISOR IN PERSON:
   Phrases: "need Marcus", "come here", "supervisor please"
   Action: Call notify_supervisor with card_type="URGENT".

7. ABSENCE / SICK / LATE REPORTING:
   Phrases: "I am sick", "I cannot come", "I am not feeling well", "I will be late", "I cannot make it today", "I am running late"
   Action: If they are sick or cannot come, set their status to ABSENT. Respond with "I am sorry to hear that. I hope you feel better soon. I have let Marcus know and will sort out your rooms."

NEVER fabricate room numbers. Always use the room from the database.
Never use em dashes (—) or double hyphens (--) in your replies. Use commas, colons, or parentheses instead.
Respond in 2 sentences maximum.
`;

    const genAI = apiClient.getGeminiClient();
    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({
          model: "gemini-1.5-flash",
          tools: [{ functionDeclarations: LANCY_TOOLS }],
          systemInstruction: systemPrompt,
          generationConfig: { temperature: 0.0 }
        });
        const result = await model.generateContent(text);
        const response = await result.response;
        
        let reply = "";
        const parts = response.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.text) {
            reply += part.text;
          }
          if (part.functionCall) {
            const { name, args } = part.functionCall;
            await executeTool(name, args);
          }
        }
        if (!reply) {
          reply = "I've logged your update.";
        }
        await dbOperations.addMessage("lancy", "Lancy", reply);
        return reply;
      } catch (err) {
        console.error("Gemini AI API Error in processHousekeeperMessage:", err);
      }
    }

    const fallbackReply = await fallbackHandler();
    await dbOperations.addMessage("lancy", "Lancy", fallbackReply);
    return fallbackReply;
  },

  async lancyChat(message: string, housekeeperContext?: string, simTime = "08:00"): Promise<{ reply: string; card?: any; buttons?: Array<{ label: string; textToSend: string }> }> {
    const cleanMsg = message.trim().toLowerCase();
    const rooms = await dbOperations.getRooms();
    const housekeepers = await dbOperations.getHousekeepers();
    const currentMins = dbOperations.timeToMins(simTime);

    // TRACK 1 - Monospace Team Map Query Check
    if (
      cleanMsg.includes("where is everyone") ||
      cleanMsg.includes("housekeeper map") ||
      cleanMsg.includes("what is the team doing") ||
      cleanMsg.includes("who is working on what") ||
      cleanMsg.includes("show me my team")
    ) {
      const hkLines = housekeepers.map((hk) => {
        const arrTime = dbOperations.hkArrivals[hk.name] || "08:00";
        if (hk.status === "ABSENT") {
          return `${hk.name}: ABSENT`;
        }
        if (currentMins < dbOperations.timeToMins(arrTime)) {
          return `${hk.name}: NOT ARRIVED Expected ${arrTime}`;
        }
        if (!hk.current_room) {
          return `${hk.name}: FREE`;
        }
        const activityStr = hk.current_activity === "INSPECTION" ? "Inspecting" : "Cleaning";
        return `${hk.name}: ${activityStr} Room ${hk.current_room}`;
      });
      
      const reply = hkLines.join("\n");
      
      return {
        reply,
        buttons: []
      };
    }

    // TRACK 1 - Deterministic start & workflows
    if (cleanMsg.includes("start shift") || cleanMsg.includes("start")) {
      return {
        reply: "Good morning, Marcus. Would you like to see today's room turnarounds?",
        buttons: [
          { label: "Yes, please", textToSend: "Yes, please" }
        ]
      };
    }

    if (cleanMsg.includes("yes, please") || cleanMsg.includes("yes please")) {
      return {
        reply: "Here is today's room turnarounds:",
        card: { action: "day-summary" },
        buttons: []
      };
    }

    if (cleanMsg.includes("room turnarounds") || cleanMsg.includes("turnarounds") || cleanMsg.includes("go to room turnarounds")) {
      return {
        reply: `Today's Room Turnarounds Schedule:
- **Ana**: Room 201 next (08:00)
- **Rosa**: Room 204 next (08:00)
- **James**: Room 302 next (08:00)
- **Priya**: Room 305 next (08:00)
- **Sofia**: Room 403 next (08:15)`,
        buttons: []
      };
    }

    if (cleanMsg.includes("next priority") || cleanMsg.includes("deluxe") || cleanMsg.includes("priority")) {
      return {
        reply: `Next Deluxe Turnaround Priorities:
- **Room 412** (DLX): Dirty. Priority Early Arrival (11:00 AM).
- **Room 404** (DLX): Dirty. Rosa is assigned (due 10:00 AM).
- Need to prioritize these Deluxe turnarounds for early check-ins.`,
        buttons: []
      };
    }

    if (cleanMsg.includes("someone else")) {
      return {
        reply: "Who would you like to assign to Room 412 instead? Here are the available attendants:",
        buttons: [
          { label: "Rosa", textToSend: "Assign Room 412 to Rosa" },
          { label: "James", textToSend: "Assign Room 412 to James" },
          { label: "Priya", textToSend: "Assign Room 412 to Priya" },
          { label: "Sofia", textToSend: "Assign Room 412 to Sofia" }
        ]
      };
    }

    if (cleanMsg.includes("assign room 412 to")) {
      const nameMatch = message.match(/to\s+(\w+)/i);
      const name = nameMatch ? nameMatch[1] : "Rosa";
      const formattedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
      await workflowEngine.assignHousekeeperRoom(formattedName, "412");
      return {
        reply: `Done. ${formattedName} has been assigned to Room 412 and notified on their device.`,
        buttons: []
      };
    }

    if (cleanMsg.includes("assign ana") || cleanMsg.includes("yes, assign ana")) {
      await workflowEngine.assignHousekeeperRoom("Ana", "412");
      return {
        reply: "Done. Ana has been assigned to Room 412 and notified on her device.",
        buttons: []
      };
    }

    if (cleanMsg.includes("send maintenance") || cleanMsg.includes("send now")) {
      await dbOperations.updateRoomStatus("215", "cleaning", { note: "Shower head work-order logged" });
      return {
        reply: "Sent. Maintenance Ticket #HK-215 is open. James is dispatched.",
        buttons: []
      };
    }

    // TRACK 2 - Gemini Freeform Queries
    const systemPrompt = `
You are Lancy, AI operations partner for Marcus, 
housekeeping supervisor at Maplewood Suites.
Current simulation time: ${simTime}.

ROOM STATES:
${rooms.map(r => {
  const hk = r.attendant || 'Unassigned'
  const flags = [
    r.earlyCheckIn ? 'EARLY CHECK-IN' : null,
    r.damageReported ? 'DAMAGE REPORTED' : null,
    r.note ? `MAINTENANCE: ${r.note}` : null,
    r.status === 'blocked' ? 'BLOCKED' : null
  ].filter(Boolean).join(' | ')
  return `Room ${r.number} (${r.type} Fl${r.floor}): ${r.status}, Attendant: ${hk}${flags ? ' [' + flags + ']' : ''}`
}).join('\n')}

HOUSEKEEPER STATUS:
${housekeepers.map(hk => {
  const arrTime = dbOperations.hkArrivals[hk.name] || '08:00';
  if (arrTime > simTime) return `${hk.name}: NOT YET ARRIVED (arrives ${arrTime})`
  if (!hk.current_room) return `${hk.name}: IDLE (available)`
  return `${hk.name}: ${hk.current_activity} in Room ${hk.current_room} (10m elapsed)`
}).join('\n')}

PENDING REVIEWS:
${rooms.filter(r => r.status === 'review').map(r =>
  `Room ${r.number} (${r.type}), waiting 5m`
).join('\n') || 'None'}

RULES:
- Never use em dashes (—) or double hyphens (--) in your replies. Use commas, colons, or parentheses instead.
- Respond in 2 sentences maximum unless building a full plan.
- Never mark a room READY without Marcus confirming.
- Never assign a housekeeper without Marcus confirming.
- If a room is overdue flag it with the word OVERDUE.
- Stay focused on housekeeping operations only.
- Language: English only.
`;

    const genAI = apiClient.getGeminiClient();
    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({
          model: "gemini-1.5-flash",
          tools: [{ functionDeclarations: LANCY_TOOLS }],
          systemInstruction: systemPrompt,
          generationConfig: { temperature: 0.0 }
        });
        const result = await model.generateContent(message);
        const response = await result.response;
        
        let reply = "";
        const parts = response.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.text) {
            reply += part.text;
          }
          if (part.functionCall) {
            const { name, args } = part.functionCall;
            const res = await executeTool(name, args);
            if (res && typeof res === 'string') {
              reply += "\n" + res;
            }
          }
        }
        if (!reply) {
          reply = "I've handled that operational request.";
        }
        return { reply, buttons: [] };
      } catch (err) {
        console.error("Gemini AI API Error, falling back to offline engine:", err);
      }
    }

    return {
      reply: "I'm monitoring the active shift. Let me know if you'd like me to re-sequence any rooms or alert maintenance.",
      buttons: []
    };
  }
};
