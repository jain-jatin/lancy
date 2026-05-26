/* -------------------------------------------------------------
   Lancy — Interactive Application Script
   Full State Sync: Supervisor App & Attendant Simulator
   ------------------------------------------------------------- */

// Mock Database State
const STATE = {
    rooms: [
        { id: '308', status: 'cleaning', staff: 'Rosa', timer: 12, isVIP: true, desc: 'Early Check-in Priority (VIP Guest: 12:30 PM SLA)' },
        { id: '302', status: 'pending', staff: 'None', timer: 0, isVIP: false, desc: 'Guest checked out. Ready for turn.' },
        { id: '304', status: 'inspection', staff: 'Rosa', timer: 28, isVIP: false, desc: 'Needs supervisor review.' },
        { id: '303', status: 'cleaning', staff: 'Mateo', timer: 18, isVIP: false, desc: 'Standard turnaround.' },
        { id: '301', status: 'occupied', staff: 'None', timer: 0, isVIP: false, desc: 'Checkout scheduled 11:00 AM' },
        { id: '305', status: 'ready', staff: 'Mateo', timer: 22, isVIP: false, desc: 'Ready for check-in.' },
        { id: '306', status: 'occupied', staff: 'None', timer: 0, isVIP: false, desc: 'Checkout scheduled 12:00 PM' },
        { id: '307', status: 'pending', staff: 'None', timer: 0, isVIP: true, desc: 'VIP Early check-in requested.' }
    ],
    attendant: {
        activeRoom: '308',
        language: 'en',
        checklistStep: 1, // 1: items check, 2: cleaning completion
        timerMinutes: 12,
        timerSeconds: 45
    },
    notifications: 2,
    activeFilter: 'all'
};

// Translations Dictionary
const TRANSLATIONS = {
    en: {
        activeTask: "Active Task",
        noBelongings: "No guest belongings remaining",
        linensRefreshed: "Bed linens & towels refreshed",
        sanitized: "Bathroom fully sanitized",
        btnConfirmItems: "Confirm Items Cleared",
        btnMarkDone: "Mark Cleaning Done",
        welcomeMsg: "Hi Rosa, please start cleaning Room 308 first. Guest has checked out. Let me know if any items are left behind!",
        itemsClearedMsg: "I have confirmed Room 308 is clear of belongings. Ready to deep clean!",
        lancyAckMsg: "Thanks Rosa. Front desk notified. Items cleared recorded in PMS. You can proceed with standard room turnover.",
        doneCleaningMsg: "Room 308 cleaning checklist complete. Ready for supervisor inspection!",
        lancyDoneAckMsg: "Excellent work Rosa. I've updated the room status to Inspection and notified Marcus. Stand by for your next room turn."
    },
    es: {
        activeTask: "Tarea Activa",
        noBelongings: "Sin pertenencias de huéspedes",
        linensRefreshed: "Sábanas y toallas renovadas",
        sanitized: "Baño completamente desinfectado",
        btnConfirmItems: "Confirmar Objetos Despejados",
        btnMarkDone: "Marcar Limpieza Terminada",
        welcomeMsg: "Hola Rosa, por favor comienza a limpiar la Habitación 308 primero. El huésped ha salido. ¡Avísame si queda algún objeto!",
        itemsClearedMsg: "He confirmado que la Habitación 308 no tiene pertenencias. ¡Lista para limpieza profunda!",
        lancyAckMsg: "Gracias Rosa. Recepción notificada. Estado registrado en el PMS. Puedes continuar con la limpieza estándar.",
        doneCleaningMsg: "Lista de limpieza de la Habitación 308 completa. ¡Lista para la inspección del supervisor!",
        lancyDoneAckMsg: "Excelente trabajo Rosa. He cambiado el estado a Inspección y notificado a Marcus. Espera la siguiente habitación."
    },
    hi: {
        activeTask: "सक्रिय कार्य",
        noBelongings: "कोई अतिथि सामान नहीं बचा है",
        linensRefreshed: "चादरें और तौलिये बदल दिए गए हैं",
        sanitized: "बाथरूम पूरी तरह से साफ किया गया",
        btnConfirmItems: "सामान खाली होने की पुष्टि करें",
        btnMarkDone: "सफाई पूरी चिह्नित करें",
        welcomeMsg: "नमस्ते रोसा, कृपया पहले कमरा 308 साफ करना शुरू करें। अतिथि चेकआउट कर चुका है। मुझे बताएं कि क्या कोई सामान पीछे छूटा है!",
        itemsClearedMsg: "मैंने पुष्टि कर दी है कि कमरा 308 खाली है। गहरी सफाई के लिए तैयार!",
        lancyAckMsg: "धन्यवाद रोसा। फ्रंट डेस्क को सूचित कर दिया गया है। PMS में सामान खाली दर्ज कर लिया गया है। आप मानक सफाई शुरू कर सकती हैं।",
        doneCleaningMsg: "कमरा 308 सफाई चेकलिस्ट पूरी हो गई है। पर्यवेक्षक निरीक्षण के लिए तैयार!",
        lancyDoneAckMsg: "उत्कृष्ट कार्य रोसा। मैंने कमरे की स्थिति को 'निरीक्षण' में अपडेट कर दिया है और मार्कस को सूचित कर दिया है। अगले कमरे के लिए तैयार रहें।"
    }
};

// Initial AI feed items
let feedCards = [
    {
        id: 'c1',
        type: 'warning',
        title: 'Dynamic Reassignment',
        timestamp: '10:05 AM',
        body: 'Room 302 has just checked out. The guest in lobby is checked in to Room 307 (VIP arrival 12:30 PM SLA). Would you like to swap Rosa\'s assignment from 302 to 308 to speed up VIP entry?',
        actions: [
            { text: 'Confirm Swap', primary: true, actionId: 'confirm-swap' },
            { text: 'Keep Current', primary: false, actionId: 'keep-current' }
        ]
    },
    {
        id: 'c2',
        type: 'alert',
        title: 'Turn Duration Exceeded',
        timestamp: '10:12 AM',
        body: 'Rosa has been cleaning Room 304 for 28 minutes (baseline 25 mins). Send a quick nudge to check for maintenance delays?',
        actions: [
            { text: 'Nudge Rosa', primary: true, actionId: 'nudge-rosa' },
            { text: 'Ignore', primary: false, actionId: 'ignore-nudge' }
        ]
    }
];

// DOM elements
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    renderStats();
    renderFeed();
    renderBoard();
    initTabs();
    initAttendantSimulator();
    initSupervisorActions();
    startAttendantTimer();
}

/* -------------------------------------------------------------
   REPRESENTATIONAL RENDERERS
   ------------------------------------------------------------- */

function renderStats() {
    const pendingCount = STATE.rooms.filter(r => r.status === 'cleaning' || r.status === 'pending' || r.status === 'inspection').length;
    const activeCount = 5; // Fixed mockup
    const readyCount = STATE.rooms.filter(r => r.status === 'ready').length;

    document.getElementById('stats-pending').innerText = pendingCount;
    document.getElementById('stats-active').innerText = activeCount;
    document.getElementById('stats-ready').innerText = readyCount;
}

function renderFeed() {
    const feed = document.getElementById('lancy-feed');
    feed.innerHTML = '';

    if (feedCards.length === 0) {
        feed.innerHTML = `
            <div class="lancy-card card-success" style="border-left-color: var(--primary);">
                <div class="card-body-text" style="text-align:center; padding: 20px 0; color:#A0AEC0;">
                    <i class="fa-solid fa-square-check" style="font-size: 28px; color: var(--primary); margin-bottom: 8px; display:block;"></i>
                    All caught up! Lancy has synced schedules with PMS.
                </div>
            </div>
        `;
        return;
    }

    feedCards.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.className = `lancy-card card-${card.type}`;
        cardEl.id = `card-element-${card.id}`;
        
        let iconName = 'fa-robot';
        if (card.type === 'warning') iconName = 'fa-arrow-right-arrow-left';
        if (card.type === 'alert') iconName = 'fa-circle-exclamation';
        if (card.type === 'success') iconName = 'fa-square-check';

        let actionButtonsHtml = '';
        if (card.actions) {
            actionButtonsHtml = `<div class="card-actions-area">`;
            card.actions.forEach(act => {
                actionButtonsHtml += `
                    <button class="btn btn-xs ${act.primary ? 'btn-primary' : 'btn-secondary'}" data-action="${act.actionId}" data-card-id="${card.id}">
                        ${act.text}
                    </button>
                `;
            });
            actionButtonsHtml += `</div>`;
        }

        cardEl.innerHTML = `
            <div class="card-header-area">
                <div class="card-title-bar">
                    <span class="card-icon"><i class="fa-solid ${iconName}"></i></span>
                    <h4>${card.title}</h4>
                </div>
                <span class="card-timestamp">${card.timestamp}</span>
            </div>
            <div class="card-body-text">
                ${card.body}
            </div>
            ${actionButtonsHtml}
        `;

        feed.appendChild(cardEl);
    });

    // Add event listeners to card action buttons
    feed.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const cardId = btn.getAttribute('data-card-id');
            const actionId = btn.getAttribute('data-action');
            handleCardAction(cardId, actionId);
        });
    });
}

function renderBoard() {
    const grid = document.getElementById('rooms-board-grid');
    grid.innerHTML = '';

    const filteredRooms = STATE.rooms.filter(room => {
        if (STATE.activeFilter === 'all') return true;
        return room.status === STATE.activeFilter;
    });

    filteredRooms.forEach(room => {
        const item = document.createElement('div');
        item.className = `room-grid-item state-${room.status}`;
        
        let typeIcon = 'fa-bed';
        if (room.isVIP) typeIcon = 'fa-crown';

        let staffText = room.staff !== 'None' ? room.staff : 'Unassigned';
        let timerText = room.timer > 0 ? `${room.timer}m elapsed` : '--';

        item.innerHTML = `
            <div class="room-num">
                <span>Room ${room.id}</span>
                <span class="room-type-icon"><i class="fa-solid ${typeIcon}"></i></span>
            </div>
            <div class="room-status-dot-label">${room.status}</div>
            <div class="room-staff"><i class="fa-regular fa-user"></i> ${staffText}</div>
            <div class="room-time-indicator">${timerText}</div>
        `;

        item.addEventListener('click', () => {
            showToast(`Room ${room.id} details: ${room.desc} Status: ${room.status.toUpperCase()}`);
        });

        grid.appendChild(item);
    });
}

/* -------------------------------------------------------------
   INTERACTION HANDLERS
   ------------------------------------------------------------- */

function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });

    // Board filter pills
    const filterPills = document.querySelectorAll('.filter-pill');
    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            STATE.activeFilter = pill.getAttribute('data-filter');
            renderBoard();
        });
    });
}

function handleCardAction(cardId, actionId) {
    if (actionId === 'confirm-swap') {
        // Swap Room 308 into primary spot, change staff
        const r308 = STATE.rooms.find(r => r.id === '308');
        const r302 = STATE.rooms.find(r => r.id === '302');
        
        r308.status = 'cleaning';
        r308.staff = 'Rosa';
        
        showToast('Dynamic schedule re-sequenced. Room 308 prioritized!');
        
        // Remove card from list
        feedCards = feedCards.filter(c => c.id !== cardId);
        renderFeed();
        renderBoard();
        renderStats();
        
        // Send a chat to Rosa in the simulator
        appendChatMessage('ai', 'Lancy', 'Hi Rosa! I have updated your schedule. Marcus has approved re-sequencing Room 308 to the top. Please complete Room 308 check list.');
    } else if (actionId === 'keep-current') {
        feedCards = feedCards.filter(c => c.id !== cardId);
        renderFeed();
        showToast('Assignment re-routing dismissed.');
    } else if (actionId === 'nudge-rosa') {
        showToast('Nudge sent to Rosa!');
        feedCards = feedCards.filter(c => c.id !== cardId);
        renderFeed();
        
        // Update Rosa's simulator chat with an AI nudge
        appendChatMessage('ai', 'Lancy (Nudge)', 'Hi Rosa, Room 304 is currently taking longer than the 25-minute benchmark. Are you facing any issues or maintenance delays?');
    } else if (actionId === 'ignore-nudge') {
        feedCards = feedCards.filter(c => c.id !== cardId);
        renderFeed();
        showToast('Nudge dismissed.');
    } else if (actionId === 'approve-inspection-308') {
        // Change Room 308 status to READY
        const r308 = STATE.rooms.find(r => r.id === '308');
        r308.status = 'ready';
        r308.timer = 0; // Reset active timer since it's ready

        showToast('Inspection approved! PMS updated in real time.');
        
        feedCards = feedCards.filter(c => c.id !== cardId);
        renderFeed();
        renderBoard();
        renderStats();

        // Update Attendant screen task
        document.getElementById('attendant-task-status-lbl').innerText = 'Completed';
        document.getElementById('attendant-task-status-lbl').className = 'badge badge-outline';
        document.getElementById('attendant-action-btn').innerText = 'Turn Done';
        document.getElementById('attendant-action-btn').disabled = true;

        // Message back to Rosa in active language
        const lang = STATE.attendant.language;
        let ackMsg = "Room 308 approved! Thank you Rosa, great work. Move to your next room.";
        if (lang === 'es') ackMsg = "¡Habitación 308 aprobada! Excelente trabajo Rosa. Procede a la siguiente habitación.";
        if (lang === 'hi') ackMsg = "कमरा 308 स्वीकृत! बहुत बढ़िया रोसा। अगले कमरे पर आगे बढ़ें।";

        appendChatMessage('ai', 'Lancy', ackMsg);
    } else if (actionId === 'approve-inspection-304') {
        const r304 = STATE.rooms.find(r => r.id === '304');
        r304.status = 'ready';
        r304.timer = 0;
        showToast('Room 304 approved & marked Guest-Ready.');
        
        feedCards = feedCards.filter(c => c.id !== cardId);
        renderFeed();
        renderBoard();
        renderStats();
    }
}

/* -------------------------------------------------------------
   ATTENDANT SIMULATOR LOGIC (DEVICE 2)
   ------------------------------------------------------------- */

function initAttendantSimulator() {
    const langSelect = document.getElementById('attendant-lang-select');
    langSelect.addEventListener('change', (e) => {
        STATE.attendant.language = e.target.value;
        translateAttendantApp();
    });

    const checkBelongings = document.getElementById('check-belongings');
    const checkBedding = document.getElementById('check-bedding');
    const checkSanitary = document.getElementById('check-sanitary');
    const actionBtn = document.getElementById('attendant-action-btn');

    // Checklist triggers
    const validateChecklist = () => {
        const lang = STATE.attendant.language;
        if (STATE.attendant.checklistStep === 1) {
            // First step only requires items check
            actionBtn.disabled = !checkBelongings.checked;
        } else {
            // Second step requires all 3 checked
            actionBtn.disabled = !(checkBelongings.checked && checkBedding.checked && checkSanitary.checked);
        }
    };

    checkBelongings.addEventListener('change', validateChecklist);
    checkBedding.addEventListener('change', validateChecklist);
    checkSanitary.addEventListener('change', validateChecklist);

    // Main action button click
    actionBtn.addEventListener('click', () => {
        const lang = STATE.attendant.language;
        if (STATE.attendant.checklistStep === 1) {
            // Items confirmed
            appendChatMessage('cleaner', 'Rosa', TRANSLATIONS[lang].itemsClearedMsg);
            
            // Lancy replies
            setTimeout(() => {
                appendChatMessage('ai', 'Lancy', TRANSLATIONS[lang].lancyAckMsg);
                
                // Advance task step
                STATE.attendant.checklistStep = 2;
                actionBtn.innerText = TRANSLATIONS[lang].btnMarkDone;
                actionBtn.className = "btn btn-block btn-primary btn-md";
                actionBtn.disabled = true;

                // Sync supervisor board state
                const r308 = STATE.rooms.find(r => r.id === '308');
                r308.status = 'cleaning';
                renderBoard();
                renderStats();
                showToast("Rosa: Items confirmed cleared. Front desk notified!");
            }, 1000);

        } else {
            // Cleaning complete
            appendChatMessage('cleaner', 'Rosa', TRANSLATIONS[lang].doneCleaningMsg);
            
            setTimeout(() => {
                appendChatMessage('ai', 'Lancy', TRANSLATIONS[lang].lancyDoneAckMsg);
                
                // Shift Room 308 to "Inspection" in model
                const r308 = STATE.rooms.find(r => r.id === '308');
                r308.status = 'inspection';
                renderBoard();
                renderStats();

                // Trigger Supervisor AI card
                const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                feedCards.unshift({
                    id: 'c3',
                    type: 'success',
                    title: 'Inspection Required',
                    timestamp: timestamp,
                    body: `Rosa has marked Room 308 turn complete. Quality Gate Lock: Please perform the physical room turn inspection to release the room to PMS.`,
                    actions: [
                        { text: 'Approve Inspection', primary: true, actionId: 'approve-inspection-308' }
                    ]
                });
                renderFeed();
                showToast("Supervisor notified: Room 308 is ready for physical inspection!");

                // Scroll feed to top
                document.getElementById('lancy-feed').scrollTop = 0;
            }, 1000);
        }
    });

    // Attendant Chat send button
    const chatInput = document.getElementById('attendant-chat-input');
    const chatSendBtn = document.getElementById('attendant-chat-send-btn');

    const sendChatMessage = () => {
        const text = chatInput.value.trim();
        if (!text) return;

        appendChatMessage('cleaner', 'Rosa', text);
        chatInput.value = '';

        // Simple AI auto-responder for demo feel
        setTimeout(() => {
            const lang = STATE.attendant.language;
            let aiText = "I will coordinate that with Marcus and update the room logs.";
            if (lang === 'es') aiText = "Coordinaré eso con Marcus y actualizaré los registros.";
            if (lang === 'hi') aiText = "मैं इसके लिए मार्कस से बात करूँगी और कमरा रिकॉर्ड अपडेट कर दूँगी।";

            appendChatMessage('ai', 'Lancy', aiText);
        }, 1200);
    };

    chatSendBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
}

function translateAttendantApp() {
    const lang = STATE.attendant.language;
    const dict = TRANSLATIONS[lang];

    document.getElementById('attendant-task-status-lbl').innerText = dict.activeTask;
    document.getElementById('lbl-check-belongings').innerText = dict.noBelongings;
    document.getElementById('lbl-check-bedding').innerText = dict.linensRefreshed;
    document.getElementById('lbl-check-sanitary').innerText = dict.sanitized;
    
    // Welcome chat bubble translate
    document.getElementById('chat-welcome-msg').innerText = dict.welcomeMsg;

    const actionBtn = document.getElementById('attendant-action-btn');
    if (STATE.attendant.checklistStep === 1) {
        actionBtn.innerText = dict.btnConfirmItems;
    } else {
        actionBtn.innerText = dict.btnMarkDone;
    }
}

function appendChatMessage(sender, name, text) {
    const log = document.getElementById('attendant-chat-log');
    const msg = document.createElement('div');
    msg.className = `chat-msg ${sender === 'ai' ? 'ai-msg' : 'cleaner-msg'}`;
    
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    msg.innerHTML = `
        <p><strong>${name}:</strong> ${text}</p>
        <span class="chat-time">${timestamp}</span>
    `;

    log.appendChild(msg);
    log.scrollTop = log.scrollHeight;
}

function startAttendantTimer() {
    let min = STATE.attendant.timerMinutes;
    let sec = STATE.attendant.timerSeconds;
    const timerLbl = document.getElementById('attendant-timer');
    const r308 = STATE.rooms.find(r => r.id === '308');

    setInterval(() => {
        // Only count up if still cleaning
        if (r308.status === 'cleaning') {
            sec++;
            if (sec >= 60) {
                min++;
                sec = 0;
            }
            STATE.attendant.timerMinutes = min;
            STATE.attendant.timerSeconds = sec;
            
            const mm = min < 10 ? `0${min}` : min;
            const ss = sec < 10 ? `0${sec}` : sec;
            timerLbl.innerText = `${mm}:${ss}`;
            
            // Sync time elapsed to room in mock db
            r308.timer = min;
        }
    }, 1000);
}

/* -------------------------------------------------------------
   SUPERVISOR UTILITIES
   ------------------------------------------------------------- */

function initSupervisorActions() {
    const micBtn = document.getElementById('voice-dictate-btn');
    const overlay = document.getElementById('voice-overlay-screen');
    const cancelBtn = document.getElementById('voice-cancel-btn');
    const submitBtn = document.getElementById('voice-submit-btn');

    micBtn.addEventListener('click', () => {
        overlay.classList.add('active');
        simulateVoiceType();
    });

    cancelBtn.addEventListener('click', () => {
        overlay.classList.remove('active');
    });

    submitBtn.addEventListener('click', () => {
        overlay.classList.remove('active');
        showToast('Voice dispatch processed. Rosa notified!');

        // Action routing: Rosa gets a chat ping and Room 302 moves to cleaning next!
        const r302 = STATE.rooms.find(r => r.id === '302');
        r302.status = 'cleaning';
        r302.staff = 'Rosa';
        renderBoard();
        renderStats();

        appendChatMessage('ai', 'Lancy', 'Supervisor Marcus: Rosa, please jump to prioritize Room 302 next. I have synced this in your dashboard.');
    });

    document.getElementById('supervisor-notif-btn').addEventListener('click', () => {
        showToast('Shift metrics: Turn duration decreased to 28 mins. SLA SLA: 100% maintained.');
    });
}

function simulateVoiceType() {
    const textEl = document.getElementById('voice-transcript');
    const phrase = "Rosa, when you finish Room 308, please jump to Room 302 next.";
    textEl.innerText = "";
    
    let i = 0;
    const typing = setInterval(() => {
        if (i < phrase.length) {
            textEl.innerText += phrase.charAt(i);
            i++;
        } else {
            clearInterval(typing);
        }
    }, 45);
}

/* -------------------------------------------------------------
   UTILITY TOAST NOTIFICATIONS
   ------------------------------------------------------------- */

function showToast(message, type = 'success') {
    const wrapper = document.getElementById('toast-wrapper');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'fa-circle-check';
    if (type === 'warning') icon = 'fa-triangle-exclamation';
    if (type === 'error') icon = 'fa-circle-xmark';

    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${message}</span>
    `;

    wrapper.appendChild(toast);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s reverse';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}
