# PRD: Lancy — AI housekeeping supervisor shift partner

**Author:** Jatin Jain
**Date:** May 2026
**Status:** Ready for Review

---

## 1. Hypothesis

We believe introducing a mobile-first AI shift partner (Lancy) that processes checkout times, arrivals, housekeeper locations, and historical room issues to sequence room turns and draft proactive communications will reduce the morning turn cognitive load for housekeeping supervisors, measured by a 30% reduction in average room turn time and maintaining a 0% missed check-in SLA.

## 2. Problem

### Who has this problem:
Housekeeping supervisors (e.g., Marcus) at mid-size hotels who must coordinate 20-35 room turns across 5-8 housekeepers in a tight 4-hour window (10:00 AM checkout to 1:00 PM check-in).

### How bad is it:
* **High Frequency & Continuity**: This is a daily, continuous problem. Marcus is constantly walking floors, physically inspecting rooms, and managing staff. He has no desk time during his active shift.
* **Extreme Cognitive Load**: Marcus takes over 11 radio or phone calls per hour. He tracks checkouts, housekeeper speeds, early arrivals, VIP requests, and room status entirely in his head or on a paper notepad.
* **Fragmented Systems**: Information is scattered across PMS desktops, physical paper logbooks, WhatsApp groups, and verbal updates. Marcus has to manually connect these dots while moving.

### What happens if we don't solve it:
* **SLA Violations**: Early arrivals wait in the lobby; VIP rooms are not prioritized, leading directly to negative guest reviews.
* **Operational Inefficiency**: Housekeepers are misallocated (e.g., cleaning a low-priority floor while an early arrival waits on another), adding 60-90 minutes of wasted time per shift.
* **Supervisor Burnout**: High stress levels for supervisors lead to operational mistakes, missed tasks, and high staff turnover.

## 3. Strategic Fit

### Why this problem, why now:
AI is uniquely suited to process multi-source inputs (PMS logs, active chats, housekeeper progress) in real time and synthesize them into simple, actionable choices. Mobile is the only viable surface because supervisors are constantly in motion; they need a single-thumb, 4-second interface.

### Connection to OKRs:
* **O1**: Build the ultimate PM OS.
* **KR2**: Run first sprint fully via AI (by automating shift management tasks and testing operations models).
* **Lance Mission**: Expands hotel messaging from static chat into a dynamic, proactive coordination engine.

### Alternatives considered:
* **Standard Chat App (e.g., WhatsApp)**: Rejected. Recreates communication noise. Task states and text threads quickly fall out of sync, requiring manual double-entry.
* **Desktop PMS Expansion**: Rejected. Housekeeping supervisors are mobile; they cannot use desktop software while inspecting rooms.
* **Static Digital Board**: Rejected. Displays data but does not offer recommendations. Marcus would still have to compute who to assign and what to prioritize.

## 4. Solution

### What we're building:
Lancy is a mobile-first AI shift partner that coordinates the morning room turn. Rather than presenting spreadsheets, Lancy presents one clear choice at a time. The supervisor confirms, overrides, or dictates a voice command, and Lancy handles all downstream routing.

The MVP features a three-tab architecture optimized for mobile web:
* **Tab 1 — Lancy Feed**: An interactive chat feed where Lancy surfaces proactive, high-context cards (e.g., sequencing confirmations, reassignments, delay nudges). Marcus approves or changes options with a tap.
* **Tab 2 — Rooms Board**: A non-AI, color-coded room grid (Occupied, Checkout Pending, Cleaning, Inspection, Ready) showing housekeeper assignments, elapsed times, and manual override controls.
* **Tab 3 — Cleaner Simulator**: A demo tool allowing evaluators to simulate the housekeeper experience in multiple languages (English, Spanish, Hindi), triggering status changes that cascade into the supervisor's feed.

### User flow:
1. **Shift Initialization (7:45 AM)**: Marcus opens Lancy. Lancy presents a summary card: 25 rooms to turn, 2 early arrivals, 5 housekeepers active. She suggests the optimal room sequence. Marcus taps Confirm.
2. **Dynamic Task Dispatch**: Lancy assigns the first room to the closest free housekeeper (e.g., Room 308 to Rosa). Rosa receives the instruction on her phone in her selected language (Spanish).
3. **Checkout Validation**: Rosa enters Room 308 and taps Items Confirmed (confirming no guest belongings remain). Lancy instantly notifies the Front Desk to finalize guest billing. The room status moves to Cleaning.
4. **Time & Progress Monitoring**: Lancy monitors the cleaning duration (baseline: 25 minutes). If a room exceeds this, Lancy surfaces a nudge card in Marcus's feed: "Room 308 has taken 35 minutes. Nudge Rosa?" Marcus taps Nudge, sending a pre-drafted check-in.
5. **Quality Gate (Inspection)**: Rosa finishes and taps Cleaning Done. Room 308 moves to Inspection. Lancy flags Marcus: "Room 308 is ready for inspection."
6. **Physical Sign-Off**: Marcus walks into Room 308, inspects it, and taps Approve Room 308 on his screen.
7. **PMS Sync**: The room turns green, moves to Ready, and Lancy automatically updates the PMS. The room is instantly available for check-in.

### Key interactions:
* **One-Tap Confirmations**: Marcus approves AI-suggested schedules and assignments with a single tap.
* **Voice Routing**: Marcus holds the mic button, dictates a command ("Tell Rosa to prioritize Room 302 next"), and Lancy transcribes, translates, and routes the message.
* **Language-Aware Simulator**: Allows housekeepers to see tasks and chat with Lancy in their native tongue (EN, ES, HI), ensuring high usability.
* **Physical Inspection Lock**: A strict quality gate. AI can suggest, but only the supervisor can mark a room guest-ready after physical inspection.

## 5. Success Metrics

| Metric | Type | Baseline | Target | Timeframe |
| :--- | :--- | :--- | :--- | :--- |
| **Average Room Turn Duration** | Primary | 42 mins | 28 mins | 30 Days |
| **SLA Breach Rate** | Primary | 8.5% | 0% | 30 Days |
| **AI Override Rate** | Secondary | N/A | < 15% | 14 Days |
| **Daily App Engagement** | Secondary | N/A | 95% | 14 Days |
| **Nudge Response Latency** | Secondary | 12 mins | < 3 mins | 30 Days |
| **AI Hallucination Rate** | Guardrail | N/A | 0% | Continuous |

## 6. Non-Goals

### What we're explicitly NOT doing:
* **Guest-Facing Chat**: Lancy will not message hotel guests directly. All communication goes through staff.
* **Payroll & Scheduling**: We are not replacing employee timesheets, scheduling software, or payroll databases.
* **Multi-Property Portals**: The MVP is strictly focused on a single property's shift operations, not regional management reports.
* **Inventory Management**: We are not tracking linens, soaps, or minibar stock counts.

### Features we considered and cut:
* **Direct Attendant-to-Attendant Chat**: Cut to maintain coordination focus. Attendants routing requests directly to each other creates the same communication chaos Lancy aims to resolve.
* **Automated Inspection**: We rejected using camera/AI verification for room readiness. Physical sign-off is essential for brand quality standards.

## 7. Open Questions

| Question | Owner | Due Date |
| :--- | :--- | :--- |
| **How does Lancy sync data in low-connectivity zones?** | Engineering Lead | June 5, 2026 |
| **What is the Web Speech transcription accuracy in noisy settings?** | AI Engineer | June 8, 2026 |
| **How will PMS write-back APIs handle concurrent modifications?** | Technical PM | June 12, 2026 |
