import { Room, Housekeeper } from "@/simulation/data";
import { apiClient } from "./api-client";
import { dbOperations } from "./db-operations";
import { workflowEngine } from "./workflow-engine";
import { LANCY_TOOLS, executeTool } from "./tools";

export const supervisorAgent = {
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
      const scheduleLines = housekeepers.map(hk => {
        const firstRoom = hk.rooms && hk.rooms.length > 0 ? hk.rooms[0] : "None";
        const arrTime = dbOperations.hkArrivals[hk.name] || "08:00";
        return `- **${hk.name}**: Room ${firstRoom} (${arrTime})`;
      }).join("\n");
      return {
        reply: `Today's Room Turnarounds Schedule:\n${scheduleLines}`,
        buttons: []
      };
    }

    if (cleanMsg.includes("next priority") || cleanMsg.includes("deluxe") || cleanMsg.includes("priority")) {
      const dlxRooms = rooms.filter(r => (r.type === 'DLX' || r.type === 'STE') && r.status !== 'ready' && r.status !== 'occupied');
      
      // Sort deluxe rooms: early check-in or priority first
      dlxRooms.sort((a, b) => {
        const priorityA = a.earlyCheckIn || a.priority ? 1 : 0;
        const priorityB = b.earlyCheckIn || b.priority ? 1 : 0;
        return priorityB - priorityA;
      });

      const priorityLines = dlxRooms.map(r => {
        const hkStr = r.attendant ? `${r.attendant} is assigned` : 'Unassigned';
        const earlyStr = r.earlyCheckIn ? ' (Priority Early Arrival)' : '';
        const statusLabel = r.status.charAt(0).toUpperCase() + r.status.slice(1);
        return `- **Room ${r.number}** (${r.type}): ${statusLabel}. ${hkStr}${earlyStr}.`;
      }).join("\n");

      return {
        reply: `Next Deluxe Turnaround Priorities:\n${priorityLines || 'All Deluxe rooms are currently clean or occupied.'}\n\nNeed to prioritize these Deluxe turnarounds for early check-ins.`,
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
