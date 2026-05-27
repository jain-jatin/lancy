# Product Requirements Document (PRD)
## Lancy: Mobile-First Housekeeping Operations AI Partner

### 1. Vision & Hypothesis
We believe that introducing a mobile-first AI shift partner (Lancy) that processes checkout times, arrivals, housekeeper locations, and active room issues to sequence room turns will reduce the morning turn cognitive load for housekeeping supervisors, measured by a 30% reduction in average room turn time while maintaining a 0% missed check-in SLA.

* **Target User**: Housekeeping Supervisor (e.g., Marcus) at mid-size hotels.
* **The Problem**: Coordinating 20 to 35 room turns across 5 housekeepers in a tight 4-hour window (10:00 AM checkout to 1:00 PM check-in) entirely on foot, with no desk time and high communication noise.

---

### 2. User Persona: Marcus (Housekeeping Supervisor)
* **Context**: Marcus walks 15,000 steps per shift, inspecting completed rooms, checking linen closets, and updating staff on room status.
* **Pain Points**:
  1. **Extreme Communication Noise**: Marcus handles over 11 radio and phone calls per hour from the front desk asking for early rooms and from attendants reporting issues.
  2. **High Cognitive Load**: He tracks room priority, checkout delays, and housekeeper schedules entirely in his head or on a paper pad.
  3. **Fragmented Data**: Information is trapped in desktop PMS software, physical logbooks, WhatsApp groups, and verbal hallway updates.

---

### 3. Why Mobile-First is the Right Surface
Supervisors are constantly in motion; they cannot carry laptops or sit at desks. A desktop interface is useless during active turns. Marcus needs a single-thumb, 4-second interaction surface that fits on a standard phone screen. 

---

### 4. Interactive Workflow Scenarios
Lancy enables a simulation-driven timeline from **8:00 AM to 2:00 PM** to help Marcus sequence turns and address operational friction points:

#### Scenario A: VIP Priority Turnaround (Room 412)
* **What Happens**: Lancy alerts Marcus that Room 412 is a VIP Suite with an early guest arrival at 11:00 AM.
* **The Decision**: Marcus is prompted to assign Ana, who is closest to that floor.
* **The Action**: Tapping "Yes, assign Ana" automatically notifies Ana's device and updates the room assignment database.

#### Scenario B: Guest Property Damage Report (Room 204)
* **What Happens**: At 10:10 AM, housekeeper Rosa enters checkout Room 204 and flags a broken mirror in her Spanish chat app interface.
* **The Decision**: Lancy translates Rosa's message, logs the incident, and displays an alert card in English for Marcus.
* **The Action**: The front desk is instantly notified to charge the departing guest's bill before they leave the lobby.

#### Scenario C: Minor Maintenance Issue (Room 303)
* **What Happens**: At 11:15 AM, housekeeper James reports a non-functioning television in Room 303.
* **The Decision**: Lancy presents Marcus with a choice: "Do you want to continue cleaning or pause for maintenance?"
* **The Action**: Marcus confirms to log a minor maintenance ticket and continue turnover, avoiding checking-in guests to a room with a faulty TV.

#### Scenario D: Major Emergency & Room Blocking (Room 402)
* **What Happens**: At 12:17 PM, housekeeper Priya reports an active bathroom plumbing leak in Room 402.
* **The Decision**: Lancy triggers an urgent alert asking Marcus to stop cleaning and block the room from hotel inventory.
* **The Action**: Marcus taps "Stop & Block Room". The room changes to "Blocked", the front desk is notified to reassign arriving guests, and Priya is instantly reassigned to Room 405.

---

### 5. What AI Should & Should Not Do
* **What AI Should Do**:
  * Translate messages bidirectionally between English, Spanish, and Hindi.
  * Extract intent (e.g., classifying a plumbing report as a critical block request).
  * Suggest optimal attendant reassignments based on floor proximity.
  * Auto-draft maintenance work orders from supervisor chat logs.
* **What AI Should NOT Do**:
  * Automatically block rooms or mark rooms guest-ready without human confirmation.
  * Change employee schedules or dispatch physical team members without explicit supervisor authorization.

---

### 6. Critical Success Metrics

| Metric | Baseline | Target | Timeframe |
| :--- | :--- | :--- | :--- |
| **Average Room Turn Duration** | 42 minutes | 28 minutes | 30 Days |
| **SLA Breach Rate** | 8.5% | 0% | 30 Days |
| **AI Action Override Rate** | N/A | < 15% | 14 Days |
| **Supervisor App Engagement** | N/A | 95% | 14 Days |
| **AI Hallucination Rate** | N/A | 0% | Continuous |

---

### 7. Non-Goals
* **Guest Messaging**: Lancy does not message hotel guests directly; communication is strictly staff-to-staff.
* **Scheduling & Payroll**: We do not replace active employee timesheets or digital clocks.
* **Inventory Counts**: We do not track soap, minibar, or linen counts.
