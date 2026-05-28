# Lancy Housekeeping Simulator: Feature Tab breakdown

This document outlines the detailed functional capabilities, constraints, and operational design of the three primary tabs within the Lancy Housekeeping Simulator interface: **Lancy (Chat)**, **Rooms**, and **Housekeepers (Cleaner)**. 

Following a major design optimization, we pruned non-essential, redundant features (such as static top banner banners, repetitive guided tours, voice nudges, and static dashboard tiles) to create a lean, single-stream conversational UI that centers around realistic hotel scenarios.

---

## Tab Overview & Matrix

| Tab Name | Main Focus | Input Mechanism | Primary Actions |
| :--- | :--- | :--- | :--- |
| **Lancy (Chat)** | AI Operations Center & Interactive Workflows | Voice & Text Input + Dynamic Quick Reply Buttons | Run shift check-in summaries, assign prioritize rooms, read incident cards, dispatch maintenance, manage reviews. |
| **Rooms** | Visual Hotel Floor & Status Map | Room Grid Grid click/tap | Inspect room details, review physical checklist, manually update status, view assignment timelines. |
| **Housekeepers** | Attendant Schedules & Device Simulation | Attendant Selector Dropdown | View specific housekeeper schedules, track current room elapsed times, simulate housekeeper chats. |

---

## 1. Lancy (Chat) Tab

The core nerve center of the application, simulating a conversational interface between Marcus (Supervisor) and Lancy (Housekeeping Coordinator).

### What CAN Be Done
*   **Run Shift Greeting & Initial Summary**: Start the morning shift, triggering a summary block of today's check-ins and check-outs matching the master inventory.
*   **Step-by-Step Assignment Workflows**: Click intuitive suggested option pills (such as `[Yes, assign rooms]` for instant morning distribution, and housekeeper nudges `[Ana]`, `[Rosa]`, `[James]`, `[Priya]`, `[Sofia]` to inspect, reorder, or reassign tasks step-by-step) to progress dynamically.
*   **Interactive Attendant Reassignments**: Query Lancy about housekeeper availability (e.g., *"who is in?"*, *"who is here?"*) to receive an instant, temporally-aware headcount. Reassign high-priority rooms (like Room 412) to housekeepers via tap options.
*   **Receive Real-Time Incidents**: View dynamic scenario notifications injected into the feed depending on the simulation time (e.g., Guest damage in Room 204, TV issue in Room 303, major water leak in Room 402).
*   **Direct Incident Response**: React directly to incident cards (e.g., select whether to block Room 402 and redirect Priya to Room 405, or pause Room 303 cleaning).
*   **Dynamic Button Cleanup**: Interaction buttons are instantly pruned upon click, preventing double-clicks or outdated interactions.

### What CANNOT Be Done (Pruned Features)
*   ❌ **No Static Dashboard Widgets**: The static "Glance Table" has been removed since Lancy reports stats conversationally.
*   ❌ **No Guided Tours**: Redundant visual overlay guides (like the duplicate bottom tab helper and outside-screen popups) have been completely removed.
*   ❌ **No Non-Conversational Top Banner Toasts**: Annoying simulation timing changes and system toasts have been pruned for a cleaner chat feed.
*   ❌ **No LLM Hallucinated Routing**: Critical command matching (arrivals, shift startups, card actions) bypasses the LLM via deterministic local matches for absolute predictability.

---

## 2. Rooms Tab

A visual floor-by-floor layout displaying the active cleaning state of all 20 rooms in the hotel.

### What CAN Be Done
*   **Visual Status Tracking**: Review status tags (Ready, Occupied, Dirty, Cleaning, Review Pending, Blocked) color-coded to identify progress instantly.
*   **Review Attendant Assignments**: Spot at a glance which room is assigned to which housekeeper (e.g., Room 204 is marked "Rosa" when she is assigned).
*   **Detailed Inspection Mode**: Click any room to open the **Room Detail Sheet**.
*   **Run Supervisor Reviews**: Within the detail sheet of a room marked "Review Pending" (e.g., Room 201 at 10:40 AM), read the housekeeper's notes, review completed tasks, and click **"Mark Ready"** to clear it for reception.

### What CANNOT Be Done
*   ❌ **No Unassigned Actions**: You cannot inspect checklist items for rooms that are unassigned or empty/ready.
*   ❌ **No Arbitrary Status Overrides**: You cannot set a room's status to illegal transitions (e.g., clean a room that is currently unassigned/ready) outside the standard supervisor checklist approval.

---

## 3. Housekeepers (Cleaner) Tab

Simulates the mobile terminal of each individual housekeeper on the floor. This allows the supervisor to view the shift from the eyes of their team.

### What CAN Be Done
*   **Housekeeper Selector Dropdown**: Toggle between individual housekeeper views: **Ana**, **Rosa**, **James**, **Priya**, and **Sofia**.
*   **Personal Attendant Schedule**: See the exact room queue assigned to the selected attendant (e.g., Ana: `201 -> 202 -> 203 -> 502`).
*   **Current Room Progress Meter**: See the room currently being cleaned, how many minutes have elapsed, and the estimated remaining time before completion.
*   **Attendant Device Chat Simulation**: Chat directly with Lancy using the simulated device of that housekeeper. Lancy automatically responds in the housekeeper's configured language (e.g., English, Spanish for Rosa, Hindi for Priya) with ultra-concise localized messages.

### What CANNOT Be Done
*   ❌ **No Multi-Attendant View**: Housekeeper terminals are viewed one at a time via the header dropdown to replicate realistic singular devices.
*   ❌ **No Manual Attendance Overrides**: Housekeeper arrival times are locked to their realistic contract schedules. If an attendant hasn't arrived (e.g., Sofia before 08:15 AM), her terminal is marked "Not Arrived" and cannot be interacted with until the simulation time reaches her arrival threshold.
