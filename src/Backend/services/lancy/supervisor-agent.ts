import { Room, Housekeeper } from "@/simulation/data";
import { continuingRooms } from "@/simulation/engine";
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

    if (currentMins <= dbOperations.timeToMins("08:00")) {
      return {
        msg: `Good morning, Marcus! Shift starting at ${simulationTime}.\n\nHere is today's overview. We have 15 checkouts to handle and 5 housekeepers scheduled today.\n\nWould you like to see today's shift summary or review assignments?`,
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
      const cleaningDurations: Record<string, number> = { STD: 25, DLX: 35, STE: 45 };
      const inspectionDuration = 15;
      const stayoverWindow = { start: 600, end: 720 }; // 10:00 AM - 12:00 PM in minutes

      const scheduleLines = housekeepers.map(hk => {
        const assignedRooms = (hk.rooms || []);
        if (assignedRooms.length === 0) return `- **${hk.name}**: No rooms assigned`;

        const arrivalTime = dbOperations.hkArrivals[hk.name] || "08:00";
        let cursor = dbOperations.timeToMins(arrivalTime);

        const roomLines = assignedRooms.map(roomNum => {
          const room = rooms.find(r => r.number === roomNum);
          const roomType = room?.type || "STD";
          const status = room?.status || "dirty";
          const isContinuingStay = continuingRooms.includes(roomNum);

          // If room is already done, skip time calculation
          if (status === "ready") {
            return `  Room ${roomNum} (${roomType}): Done`;
          }

          const startH = Math.floor(cursor / 60) % 24;
          const startM = String(cursor % 60).padStart(2, "0");
          const ampm = startH >= 12 ? "PM" : "AM";
          const displayH = startH % 12 || 12;
          const startTimeStr = `${displayH}:${startM} ${ampm}`;

          if (isContinuingStay) {
            // Continuing stay: cleaning only, no inspection
            const cleanDuration = cleaningDurations[roomType] || 25;
            const isEarlyCleaning = cursor < stayoverWindow.start || cursor >= stayoverWindow.end;
            const earlyFlag = isEarlyCleaning ? ", early cleaning requested" : "";
            cursor += cleanDuration;
            return `  Room ${roomNum} (${roomType}, continuing stay): cleaning ${startTimeStr}${earlyFlag}`;
          } else {
            // Checkout room: inspection + cleaning
            const totalDuration = inspectionDuration + (cleaningDurations[roomType] || 25);
            cursor += totalDuration;
            return `  Room ${roomNum} (${roomType}, checkout): starts ${startTimeStr}`;
          }
        });

        return `- **${hk.name}**\n${roomLines.join("\n")}`;
      }).join("\n\n");

      return {
        reply: `Today's Room Turnarounds Schedule:\n\n${scheduleLines}`,
        buttons: []
      };
    }

    // ROOM STATUS - Full room state report
    if (
      cleanMsg.includes("state of all rooms") ||
      cleanMsg.includes("room status") ||
      cleanMsg.includes("all rooms") ||
      cleanMsg.includes("current state") ||
      cleanMsg.includes("room states") ||
      cleanMsg.includes("status of rooms") ||
      cleanMsg.includes("show rooms") ||
      cleanMsg.includes("how are the rooms")
    ) {
      const grouped: Record<string, typeof rooms> = {};
      for (const r of rooms) {
        const key = r.status;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
      }

      // Ordered display: dirty first, then active work, then pending, then done
      const statusOrder = ["dirty", "inspection", "cleaning", "review", "blocked", "ready", "occupied"];
      const statusLabels: Record<string, string> = {
        dirty: "Dirty (Awaiting Turnaround)",
        inspection: "Inspection In Progress",
        cleaning: "Cleaning In Progress",
        review: "Review Pending (Marcus)",
        blocked: "Blocked (Maintenance)",
        ready: "Ready for Check-in",
        occupied: "Occupied"
      };

      let report = `**Room Status at ${simTime}**\n\n`;
      for (const status of statusOrder) {
        const group = grouped[status];
        if (!group || group.length === 0) continue;
        report += `**${statusLabels[status] || status}** (${group.length})\n`;
        for (const r of group) {
          const hkStr = r.attendant ? `, ${r.attendant}` : "";
          report += `- Room ${r.number} (${r.type}, Fl${r.floor})${hkStr}\n`;
        }
        report += "\n";
      }

      return { reply: report.trim(), buttons: [] };
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

    // TRACK 2 - Gemini Freeform Queries (fresh DB data + conversation history on EVERY call)
    const genAI = apiClient.getGeminiClient();
    if (genAI) {
      try {
        const systemPrompt = await dbOperations.buildLiveSystemPrompt(simTime, { role: 'supervisor' });
        const model = genAI.getGenerativeModel({
          model: "gemini-1.5-flash",
          tools: [{ functionDeclarations: LANCY_TOOLS }],
          systemInstruction: systemPrompt,
          generationConfig: { temperature: 0.0 }
        });

        // Build conversation history from message store
        const allMessages = await dbOperations.getMessages();
        const supervisorMessages = allMessages.filter(m =>
          (m.role === 'supervisor') || (m.role === 'lancy' && m.sender === 'Lancy')
        );
        const history = supervisorMessages.slice(-10).map(m => ({
          role: m.role === 'supervisor' ? 'user' as const : 'model' as const,
          parts: [{ text: m.content }]
        }));

        const chat = model.startChat({ history });
        const result = await chat.sendMessage(message);
        const response = result.response;
        
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

    // Offline fallback: build a useful summary instead of a generic message
    const dirtyCount = rooms.filter(r => r.status === "dirty").length;
    const inspectionCount = rooms.filter(r => r.status === "inspection").length;
    const cleaningCount = rooms.filter(r => r.status === "cleaning").length;
    const reviewCount = rooms.filter(r => r.status === "review").length;
    const readyCount = rooms.filter(r => r.status === "ready").length;
    const blockedCount = rooms.filter(r => r.status === "blocked").length;

    let fallback = `At ${simTime}: ${dirtyCount} dirty, ${inspectionCount} inspecting, ${cleaningCount} cleaning, ${reviewCount} pending review, ${readyCount} ready`;
    if (blockedCount > 0) fallback += `, ${blockedCount} blocked`;
    fallback += ".\n\nTry asking: \"current state of all rooms\", \"where is everyone\", \"room turnarounds\", or \"next priority\".";

    return {
      reply: fallback,
      buttons: []
    };
  }
};
