import { Room, Housekeeper, CHECKOUT_ROOMS } from "@/simulation/data";
import { continuingRooms } from "@/simulation/engine";
import { apiClient } from "./api-client";
import { dbOperations } from "./db-operations";
import { workflowEngine } from "./workflow-engine";
import { LANCY_TOOLS, executeTool } from "./tools";
import { supabase, isRealSupabaseConfigured, mockDb } from "../../db/supabase";

// Helper: Convert minutes back to "HH:MM"
function minsToTimeStr(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export const supervisorAgent = {
  async analyzeAndAlert(simTime: string, rooms: Room[]): Promise<string | null> {
    const alerts: string[] = [];
    const simMins = dbOperations.timeToMins(simTime);
    const deadlineMins = 780; // 13:00 in minutes (1:00 PM)

    for (const room of rooms) {
      const attendant = room.attendant || room.housekeeper_name || "";
      const roomNum = room.number || room.room_number || "";
      const roomType = room.type || room.room_type || "";
      const scheduledEnd = room.scheduled_end_time || room.scheduled_end || "10:00";

      if (room.status === 'cleaning' || (room.status as string) === 'CLEANING') {
        const endMins = dbOperations.timeToMins(scheduledEnd);
        const overdueMins = simMins - endMins;
        if (overdueMins > 10) {
          alerts.push(
            `Room ${roomNum} is ${overdueMins} mins overdue. ` +
            `${attendant} has not finished yet.`
          );
        }
      }

      if (room.status === 'dirty' || (room.status as string) === 'DIRTY') {
        const endMins = dbOperations.timeToMins(scheduledEnd);
        const minsToDeadline = deadlineMins - endMins;
        if (minsToDeadline < 30) {
          const formatTimeStr = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            const hour = h % 12 || 12;
            const ampm = h >= 12 ? "PM" : "AM";
            return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
          };
          alerts.push(
            `Room ${roomNum} (${roomType}) may not be ready ` +
            `before the 1:00 PM deadline. ` +
            `${attendant} is scheduled to finish at ` +
            `${formatTimeStr(scheduledEnd)}.`
          );
        }
      }
    }

    if (alerts.length === 0) return null;

    const alertText = alerts.join(' ');
    const genAI = apiClient.getGeminiClient();
    if (genAI) {
      try {
        const systemPrompt = await dbOperations.buildLiveSystemPrompt(simTime);
        const model = genAI.getGenerativeModel({
          model: "gemini-1.5-flash",
          systemInstruction: systemPrompt,
          generationConfig: { temperature: 0.0 }
        });

        const prompt = `
Marcus has not asked anything. You noticed these issues:
${alertText}

Surface the most important one clearly.
Recommend one specific action Marcus can take.
Keep it to 2-3 sentences.
End with a yes/no question so he can act immediately.
`;
        const result = await model.generateContent(prompt);
        const reply = result.response.text();
        if (reply) {
          await dbOperations.addMessage("lancy", "Lancy", reply);
          return reply;
        }
      } catch (err) {
        console.error("Gemini analyzeAndAlert failed, falling back:", err);
      }
    }

    const fallbackText = alerts[0] + " Recommend reassigning to available housekeepers.";
    await dbOperations.addMessage("lancy", "Lancy", fallbackText);
    return fallbackText;
  },

  async buildAutoRecommendation(simulationTime: string): Promise<{ msg: string; recommendations: Array<{ roomNumber: string; hkName: string }> }> {
    const rooms = await dbOperations.getRooms();
    const housekeepers = await dbOperations.getHousekeepers();

    // Find unassigned dirty rooms
    const unassigned = rooms
      .filter(r => r.status === "dirty" && !r.attendant)
      .sort((a, b) => {
        const typeOrder = { STE: 0, DLX: 1, STD: 2 };
        return typeOrder[a.type] - typeOrder[b.type];
      });

    // Find available housekeepers (arrived + idle)
    const currentMins = dbOperations.timeToMins(simulationTime);
    const available = housekeepers.filter(hk => {
      const arrTime = dbOperations.hkArrivals[hk.name] || "08:00";
      return currentMins >= dbOperations.timeToMins(arrTime) && !hk.current_room;
    });

    const reviews = rooms.filter(r => (r.status as string) === "review");

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

    // Persist Marcus user message to chat database
    await dbOperations.addMessage("supervisor", "Marcus", message);

    const getAssignmentsData = async (): Promise<any[]> => {
      const today = new Date().toISOString().split('T')[0];

      if (isRealSupabaseConfigured && supabase) {
        try {
          const { data } = await supabase
            .from('room_state')
            .select('*')
            .eq('shift_date', today);

          if (data && data.length > 0) {
            return data.map(r => ({
              room_number: r.room_number,
              floor: r.floor,
              room_type: r.room_type,
              housekeeper_name: r.housekeeper_name,
              status: (r.status || 'DIRTY').toUpperCase(),
              scheduled_start: r.scheduled_start,
              scheduled_end: r.scheduled_end,
              actual_start: r.actual_start,
              actual_end: r.actual_end,
            }));
          }
        } catch (e) {
          console.warn("Failed to select from room_state:", e);
        }
      }

      const states = (mockDb as any).getRoomState ? (mockDb as any).getRoomState(today) : [];
      return states.map((r: any) => ({
        room_number: r.room_number,
        floor: r.floor,
        room_type: r.room_type,
        housekeeper_name: r.housekeeper_name,
        status: (r.status || 'DIRTY').toUpperCase(),
        scheduled_start: r.scheduled_start,
        scheduled_end: r.scheduled_end,
        actual_start: r.actual_start,
        actual_end: r.actual_end,
      }));
    };

    const formatTime = (timeStr: string | Date | null | undefined): string => {
      if (!timeStr) return "N/A";
      const date = typeof timeStr === 'string' ? new Date(timeStr) : timeStr;
      if (isNaN(date.getTime())) {
        if (typeof timeStr === 'string' && timeStr.includes(':')) {
          const parts = timeStr.split(':');
          const h = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const displayH = h % 12 || 12;
          const ampm = h >= 12 ? 'PM' : 'AM';
          return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
        }
        return String(timeStr);
      }
      const hrs = date.getHours();
      const mins = date.getMinutes();
      const ampm = hrs >= 12 ? 'PM' : 'AM';
      const displayHrs = hrs % 12 || 12;
      const displayMins = mins < 10 ? `0${mins}` : mins;
      return `${displayHrs}:${displayMins} ${ampm}`;
    };

    const todayAt = (timeStr: string): Date => {
      if (timeStr.includes('T')) {
        return new Date(timeStr);
      }
      const date = new Date();
      const cleaned = timeStr.replace(/\s*[AP]M\s*/i, '').trim();
      const [hours, minutes] = cleaned.split(':').map(Number);
      let h = hours;
      if (timeStr.toLowerCase().includes('pm') && h < 12) h += 12;
      if (timeStr.toLowerCase().includes('am') && h === 12) h = 0;
      date.setHours(h, minutes, 0, 0);
      return date;
    };

    // ==========================================
    // 2. DETERMINISTIC INTENT ROUTING (FIX 3)
    // ==========================================
    const assignments = await getAssignmentsData();

    // Intent A: ROOM STATUS ("what is room 204" / "status of 204" / "room 204")
    const roomStatusRegex = /(?:status\s+of\s+room\s+|status\s+of\s+|what\s+is\s+room\s+|room\s+)(\d{3})/i;
    if (roomStatusRegex.test(cleanMsg)) {
      const match = cleanMsg.match(roomStatusRegex);
      const rNum = match ? match[1] : "";
      const row = assignments.find(r => r.room_number === rNum);

      let reply = "";
      if (row) {
        if (row.status === 'CLEANING') {
          reply = `Room ${rNum} (${row.room_type}, Floor ${row.floor}) is being cleaned by ${row.housekeeper_name}. ` +
            `Started at ${formatTime(row.actual_start)}. Done by ${formatTime(row.scheduled_end)}.`;
        } else if (row.status === 'DIRTY') {
          reply = `Room ${rNum} is checked out and waiting. ` +
            `${row.housekeeper_name} picks it up at ${formatTime(row.scheduled_start)}, done by ${formatTime(row.scheduled_end)}.`;
        } else if (row.status === 'READY') {
          reply = `Room ${rNum} is guest ready. ` +
            `Cleaned by ${row.housekeeper_name}, completed at ${formatTime(row.actual_end)}.`;
        } else if (row.status === 'OCCUPIED') {
          reply = `Room ${rNum} is occupied. Not in today's checkout list.`;
        }
      } else {
        // Double check in raw rooms list if it is occupied
        const fullRooms = await dbOperations.getRooms();
        const rawRm = fullRooms.find(r => r.number === rNum);
        if (rawRm && rawRm.status === 'occupied') {
          reply = `Room ${rNum} is occupied. Not in today's checkout list.`;
        } else {
          reply = `I do not have any assignment data for Room ${rNum} today.`;
        }
      }

      await dbOperations.addMessage("lancy", "Lancy", reply);
      return { reply, buttons: [] };
    }

    // Intent B: FLOOR STATUS ("floor 2" / "how is floor 2")
    const floorStatusRegex = /(?:floor\s+|rooms\s+on\s+floor\s+|status\s+of\s+floor\s+|how\s+is\s+floor\s+)(\d)/i;
    if (floorStatusRegex.test(cleanMsg)) {
      const match = cleanMsg.match(floorStatusRegex);
      const fNum = match ? parseInt(match[1], 10) : 2;
      const floorRooms = assignments.filter(r => r.floor === fNum);

      let reply = "";
      if (floorRooms.length === 0) {
        reply = `I do not have any active assignments on Floor ${fNum} today.`;
      } else {
        const ready = floorRooms.filter(r => r.status === 'READY').map(r => r.room_number);
        const cleaning = floorRooms.filter(r => r.status === 'CLEANING').map(r => `${r.room_number} (${r.housekeeper_name}, done ${formatTime(r.scheduled_end)})`);
        const waiting = floorRooms.filter(r => r.status === 'DIRTY').map(r => r.room_number);

        reply = `Floor ${fNum} — ${floorRooms.length} rooms:\n` +
          (ready.length > 0 ? `Ready: ${ready.join(', ')}\n` : '') +
          (cleaning.length > 0 ? `Cleaning: ${cleaning.join(', ')}\n` : '') +
          (waiting.length > 0 ? `Waiting: ${waiting.join(', ')}` : '');
      }

      await dbOperations.addMessage("lancy", "Lancy", reply.trim());
      return { reply: reply.trim(), buttons: [] };
    }

    // Intent C: HOUSEKEEPER STATUS ("where is Ana" / "what is Ana doing")
    const cleanNames = ["Ana", "Rosa", "James", "Priya", "Sofia"];
    const matchedHkName = cleanNames.find(n => cleanMsg.includes(n.toLowerCase()));

    if (matchedHkName) {
      const name = matchedHkName;
      const hkTasks = assignments.filter(r => r.housekeeper_name === name);
      let reply = "";

      if (hkTasks.length === 0) {
        reply = `${name} has no rooms assigned today.`;
      } else {
        const pronounSubject = name === "James" ? "he" : "she";
        const pronounPossessive = name === "James" ? "his" : "her";

        // Read status as single source of truth — never infer from time
        const current = hkTasks.find(r => r.status === 'CLEANING');
        const upcoming = hkTasks.filter(r => r.status === 'DIRTY')
          .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime());
        const past = hkTasks.filter(r => r.status === 'READY');

        if (current) {
          const eta = formatTime(current.scheduled_end);
          reply = `${name} is cleaning Room ${current.room_number} (${current.room_type}, Floor ${current.floor}) right now.\nDone by ${eta}.`;
        } else if (upcoming.length > 0) {
          const next = upcoming[0];
          const start = formatTime(next.scheduled_start);
          reply = `${name} has finished ${pronounPossessive} current room.\nNext: Room ${next.room_number} at ${start}.`;
        } else if (past.length > 0 && upcoming.length === 0) {
          reply = `${name} has completed all ${pronounPossessive} rooms for today.`;
        } else {
          reply = `${name} is ready and waiting. Assignments start at 10:00 AM.`;
        }

        if (upcoming.length > 0) {
          reply += `\n\nUpcoming:\n`;
          reply += upcoming.map((r, i) => {
            const start = formatTime(r.scheduled_start);
            const end = formatTime(r.scheduled_end);
            return `${i + 1}. Room ${r.room_number} (${r.room_type}) — ${start} to ${end}`;
          }).join('\n');
        }

        if (past.length > 0) {
          reply += `\n\nCompleted today: ` + past.map(r => `Room ${r.room_number}`).join(', ');
        }
      }

      await dbOperations.addMessage("lancy", "Lancy", reply.trim());
      return { reply: reply.trim(), buttons: [] };
    }

    // Intent D: ETA ("when will room 203 be ready" / "ETA 203")
    const etaQueryRegex = /(?:when\s+will\s+room\s+|ETA\s+room\s+|ETA\s+)(\d{3})/i;
    if (etaQueryRegex.test(cleanMsg)) {
      const match = cleanMsg.match(etaQueryRegex);
      const rNum = match ? match[1] : "";
      const row = assignments.find(r => r.room_number === rNum);

      let reply = "";
      if (row) {
        if (row.status === 'CLEANING') {
          reply = `Room ${rNum} will be ready by ${formatTime(row.scheduled_end)}.\n` +
            `${row.housekeeper_name} has been cleaning since ${formatTime(row.actual_start)}.`;
        } else if (row.status === 'DIRTY') {
          reply = `Room ${rNum} will be ready by ${formatTime(row.scheduled_end)}.\n` +
            `${row.housekeeper_name} is scheduled to start at ${formatTime(row.scheduled_start)}.`;
        } else if (row.status === 'READY') {
          reply = `Room ${rNum} is already guest ready.\n` +
            `Completed by ${row.housekeeper_name} at ${formatTime(row.actual_end)}.`;
        } else if (row.status === 'OCCUPIED') {
          reply = `Room ${rNum} is occupied. Not in today's checkout list.`;
        }
      } else {
        reply = `I do not have any assignment data for Room ${rNum} today.`;
      }

      await dbOperations.addMessage("lancy", "Lancy", reply);
      return { reply, buttons: [] };
    }

    // Intent E: TEAM OVERVIEW ("where is everyone" / "team status")
    const teamTriggers = ["where is everyone", "team status", "what is everyone doing", "housekeeper map", "who is working on what", "team overview"];
    if (teamTriggers.some(t => cleanMsg.includes(t))) {
      let reply = "";
      const hks = ["Ana", "Rosa", "James", "Priya", "Sofia"];

      const lines = hks.map(name => {
        const tasks = assignments.filter(r => r.housekeeper_name === name);
        const current = tasks.find(r => r.status === 'CLEANING');
        const waiting = tasks.filter(r => r.status === 'DIRTY');

        const paddedName = name.padEnd(8, ' ');
        if (current) {
          return `${paddedName} — Cleaning Room ${current.room_number}, done ${formatTime(current.scheduled_end)}`;
        } else if (waiting.length > 0) {
          const next = waiting.sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime())[0];
          return `${paddedName} — Queue starting with Room ${next.room_number} at ${formatTime(next.scheduled_start)}`;
        } else {
          return `${paddedName} — Available (Queue complete)`;
        }
      });

      reply = lines.join('\n');
      await dbOperations.addMessage("lancy", "Lancy", reply);
      return { reply, buttons: [] };
    }

    // Intent F: OVERDUE CHECK ("anything running late" / "any delays")
    const overdueTriggers = ["anything running late", "any delays", "running late", "any running late", "anything late"];
    if (overdueTriggers.some(t => cleanMsg.includes(t))) {
      const simDateTime = todayAt(simTime);
      const cleaning = assignments.filter(r => r.status === 'CLEANING');
      const overdue = cleaning.filter(r => {
        const end = new Date(r.scheduled_end);
        return simDateTime > end;
      });

      let reply = "";
      if (overdue.length === 0) {
        reply = "Everything is on schedule.";
      } else {
        const lines = overdue.map(r => {
          const end = new Date(r.scheduled_end);
          const overdueMins = Math.floor((simDateTime.getTime() - end.getTime()) / 60000);
          return `Room ${r.room_number} is running late. ${r.housekeeper_name} was due at ${formatTime(r.scheduled_end)}. ` +
            `Now ${overdueMins} mins overdue. Want me to flag it?`;
        });
        reply = lines.join('\n');
      }

      await dbOperations.addMessage("lancy", "Lancy", reply);
      return { reply, buttons: [] };
    }

    // Intent G: WHAT IS LEFT ("how many rooms left" / "progress")
    const progressTriggers = ["how many rooms left", "progress", "remaining tasks", "how many left"];
    if (progressTriggers.some(t => cleanMsg.includes(t))) {
      const ready = assignments.filter(r => r.status === 'READY');
      const cleaning = assignments.filter(r => r.status === 'CLEANING');
      const waiting = assignments.filter(r => r.status === 'DIRTY');

      const maxEnd = assignments.length > 0
        ? new Date(Math.max(...assignments.map(r => new Date(r.scheduled_end).getTime())))
        : new Date();

      const reply = `Progress at ${simTime}:\n` +
        `${ready.length} rooms ready, ${cleaning.length} being cleaned, ${waiting.length} still waiting.\n` +
        `On track to finish by ${formatTime(maxEnd)}.`;

      await dbOperations.addMessage("lancy", "Lancy", reply);
      return { reply, buttons: [] };
    }

    // ==========================================
    // 3. FREEFORM GEMINI FALLBACK (Step 4)
    // ==========================================
    const genAI = apiClient.getGeminiClient();
    if (genAI) {
      try {
        let systemPrompt = await dbOperations.buildLiveSystemPrompt(simTime);

        // Append strict Gemini constraint
        systemPrompt += "\n\nCRITICAL HALLUCINATION SAFETY RULE:\n" +
          "If the user's question requires information or live data that is NOT present in the system prompt above, " +
          "you MUST reply exactly with:\n" +
          "\"I do not have that information right now.\"\n" +
          "Do NOT fabricate, guess, or reference any external knowledge. Stay completely grounded in the database context.";

        const model = genAI.getGenerativeModel({
          model: "gemini-1.5-flash",
          tools: [{ functionDeclarations: LANCY_TOOLS }],
          systemInstruction: systemPrompt,
          generationConfig: { temperature: 0.0 }
        });

        const allMessages = await dbOperations.getMessages();
        const supervisorMessages = allMessages.filter(m =>
          (m.role === 'supervisor') || (m.role === 'lancy' && m.sender === 'Lancy')
        );
        const history = supervisorMessages.slice(-8).map(m => ({
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

        await dbOperations.addMessage("lancy", "Lancy", reply);
        return { reply, buttons: [] };
      } catch (err) {
        console.error("Gemini AI API Error, falling back to offline engine:", err);
      }
    }

    // Offline fallback if Gemini fails
    const dirtyCount = rooms.filter(r => r.status === "dirty").length;
    const cleaningCount = rooms.filter(r => r.status === "cleaning").length;
    const readyCount = rooms.filter(r => r.status === "ready").length;

    let fallback = `At ${simTime}: ${dirtyCount} dirty, ${cleaningCount} cleaning, ${readyCount} ready.`;
    await dbOperations.addMessage("lancy", "Lancy", fallback);
    return {
      reply: fallback,
      buttons: []
    };
  }
};
