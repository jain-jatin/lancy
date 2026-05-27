import { Room, Housekeeper } from "@/simulation/data";
import { apiClient } from "./api-client";
import { dbOperations } from "./db-operations";
import { workflowEngine } from "./workflow-engine";
import { LANCY_TOOLS, executeTool } from "./tools";

export const housekeeperAgent = {
  async housekeeperChat(name: string, text: string): Promise<string> {
    return housekeeperAgent.processHousekeeperMessage(name, text);
  },

  async processHousekeeperMessage(hkName: string, text: string): Promise<string> {
    console.log(`[processHousekeeperMessage] Housekeeper ${hkName} sent: "${text}"`);
    const cleanMsg = text.trim().toLowerCase();
    const hks = await dbOperations.getHousekeepers();
    const hk = hks.find(h => h.name.toLowerCase() === hkName.toLowerCase());
    if (!hk) return "Housekeeper not found.";

    const rooms = await dbOperations.getRooms();

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
  }
};
