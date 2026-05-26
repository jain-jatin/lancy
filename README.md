# Lancy — AI Housekeeping Supervisor Shift Partner

Lancy is a mobile-first, AI-driven shift partner designed for hotel housekeeping supervisors and room attendants. It solves the high-cognitive-load problem of coordinating room turnarounds in a compressed morning shift window (10:00 AM checkout to 1:00 PM check-in), reducing the turn cycle duration by 30% and eliminating missed early check-in SLAs.

---

## 📂 Repository Structure

This repository contains the complete product specs and a high-fidelity, dual-role interactive web prototype:

```
lancy/
├── docs/
│   ├── Lancy_PRD_Final.md        # Complete Product Requirements Document (Markdown)
│   └── Lancy_PRD_Final.pdf        # High-Fidelity Styled PRD (PDF)
├── index.html                     # Dual-Screen Mobile Prototype Interface
├── style.css                      # Vanilla CSS Layout and Glassmorphic Theme
├── app.js                         # Fully Synchronized Interactive Simulator Engine
└── README.md                      # Project documentation (this file)
```

---

## ⚡ The Interactive Prototype

Because Lancy is a **"mobile app on web"** tool, this repository features an interactive web prototype that places two smartphone simulators side-by-side:

1. **Left Screen (Supervisor — Marcus)**:
   - **Lancy Feed**: Surfaces proactive, high-context AI recommendation cards (e.g. sequence swaps, reassignments, delay nudges).
   - **Rooms Board**: A live grid mapping all property rooms, color-coded by real-time status: Occupied 🔴, Checkout Pending 🟠, Cleaning 🔵, Inspection 🟣, Ready 🟢.
   - **Voice Dispatch Mic**: Hold to dictate natural language commands ("Rosa, prioritize Room 302 next") and watch Lancy transcribe, translate, and route instructions.
   
2. **Right Screen (Attendant — Rosa)**:
   - **Checklist Flow**: Simulates the cleaner's workflow. Complete tasks like "No guest belongings remaining" (instantly alerting front desk for PMS billing).
   - **Language Support**: Instant translation toggling between English 🇺🇸, Spanish 🇪🇸, and Hindi 🇮🇳 for all instructions, checklists, and chat threads.
   - **Real-Time AI Chat**: Chat with Lancy, request re-routes, or receive instant feedback.

### 🔄 Fully Synchronized Workflows
Tapping buttons on one mobile screen triggers real-time events on the other:
- Rosa checking *"No guest belongings"* updates the room to **Cleaning** on Marcus's Board and updates the supervisor stats.
- Rosa ticking the checklist and tapping *"Mark Cleaning Done"* automatically generates a beautiful **Inspection Required** AI Card in Marcus's feed.
- Marcus tapping *"Approve Inspection"* on the card turns the room **Ready (Green)** in the PMS and posts a translated confirmation bubble back to Rosa's chat.

---

## 🚀 How to Run the Prototype

No installations, build steps, or backend servers are required! Everything runs completely client-side.

1. **Clone this repository** to your local machine.
2. **Double-click `index.html`** to open it instantly in any modern web browser (Chrome, Safari, Edge, Firefox).
3. Resize the browser window to see the responsive layout adapt perfectly.

---

## 📄 Read the Product Requirements Document (PRD)

To read the underlying product strategy, competitive positioning, success metrics, and technical requirements:
- **Markdown Version**: Open [docs/Lancy_PRD_Final.md](docs/Lancy_PRD_Final.md) directly.
- **Styled PDF Version**: Download [docs/Lancy_PRD_Final.pdf](docs/Lancy_PRD_Final.pdf) for a printable version styled with professional design rules.
