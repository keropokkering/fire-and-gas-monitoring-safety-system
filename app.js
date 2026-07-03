// FGS-PRO 3000 Fire & Gas Safety System Controller

// ==========================================
// 1. STATE MANAGEMENT
// ==========================================
const state = {
    mode: 'simulation', // 'simulation' or 'mqtt'
    mqttConnected: false,
    mqttClient: null,
    audioEnabled: false,
    acknowledged: false,
    
    // Limits / Thresholds
    thresholds: {
        smoke: 1.5,     // % obs/m
        tempWarning: 45, // °C
        tempAlarm: 57,   // °C
        tempDeluge: 75,  // °C (Sprinkler activation)
        gasWarning: 100, // ppm
        gasAlarm: 200    // ppm
    },
    
    // Live sensor values per zone (Level 1–5 + Rooftop)
    zones: {
        level1: {
            name: "Level 1",
            smoke_level: 0.05,
            temperature: 22.0,
            manual_call_point: false,
            alarm_bell: false,
            mos_mode: false
        },
        level2: {
            name: "Level 2",
            smoke_level: 0.07,
            temperature: 24.0,
            manual_call_point: false,
            alarm_bell: false,
            mos_mode: false
        },
        level3: {
            name: "Level 3",
            smoke_level: 0.06,
            temperature: 23.5,
            manual_call_point: false,
            alarm_bell: false,
            mos_mode: false
        },
        level4: {
            name: "Level 4",
            smoke_level: 0.04,
            temperature: 25.0,
            manual_call_point: false,
            alarm_bell: false,
            mos_mode: false
        },
        level5: {
            name: "Level 5",
            smoke_level: 0.08,
            temperature: 23.0,
            manual_call_point: false,
            alarm_bell: false,
            mos_mode: false
        },
        rooftop: {
            name: "Rooftop",
            smoke_level: 0.03,
            temperature: 28.0,
            gas_level: 12.0,
            manual_call_point: false,
            alarm_bell: false,
            mos_mode: false
        }
    },
    
    // Actuator status
    hvac_damper: "OPEN",   // "OPEN" or "ISOLATED"
    sprinklers: "STANDBY", // "STANDBY" or "ACTIVE"
    system_status: "NORMAL", // "NORMAL", "WARNING", "ALARM"
    interlocks: {
        smokeActive: false,
        smokeZones: [],
        heatActive: false,
        heatZones: [],
        confirmedFire: false,
        mcpActive: false,
        mcpZones: []
    } // "NORMAL", "WARNING", "ALARM"
};

// Colors mapping matching CSS design
const COLORS = {
    safe: '#10b981',
    warning: '#f59e0b',
    alarm: '#ef4444',
    gas: '#00f5ff',
    bg: '#0c101c',
    blueprint: '#1e293b',
    blueprintGrid: '#111827',
    text: '#94a3b8'
};

// Device tag mapping for industrial identification
const zoneTags = {
    level1: { smoke: 'SD 080101', heat: 'HD 080101', mcp: 'MAC 080101', bell: 'FAB 080101' },
    level2: { smoke: 'SD 080201', heat: 'HD 080201', mcp: 'MAC 080201', bell: 'FAB 080201' },
    level3: { smoke: 'SD 080301', heat: 'HD 080301', mcp: 'MAC 080301', bell: 'FAB 080301' },
    level4: { smoke: 'SD 080401', heat: 'HD 080401', mcp: 'MAC 080401', bell: 'FAB 080401' },
    level5: { smoke: 'SD 080501', heat: 'HD 080501', mcp: 'MAC 080501', bell: 'FAB 080501' },
    rooftop: { smoke: 'SD 080601', heat: 'HD 080601', gas: 'GD 080601', mcp: 'MAC 080601', bell: 'FAB 080601' }
};

// ==========================================
// 2. AUDIO SYNTHESISER (Web Audio API)
// ==========================================
class SafetyAudioEngine {
    constructor() {
        this.ctx = null;
        this.sirenOsc1 = null;
        this.sirenOsc2 = null;
        this.bellOsc = null;
        this.sirenGain = null;
        this.bellGain = null;
        this.isPlaying = false;
        this.bellInterval = null;
    }

    init() {
        if (this.ctx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        
        // Setup siren channels
        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.sirenGain.connect(this.ctx.destination);
        
        // Setup bell channels
        this.bellGain = this.ctx.createGain();
        this.bellGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.bellGain.connect(this.ctx.destination);
    }

    startAlarms() {
        if (!state.audioEnabled) return;
        this.init();
        if (this.isPlaying) return;
        
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        
        this.isPlaying = true;
        
        // 1. Dual-tone Siren
        this.sirenOsc1 = this.ctx.createOscillator();
        this.sirenOsc1.type = 'sawtooth';
        this.sirenOsc1.frequency.setValueAtTime(660, this.ctx.currentTime); // Hz
        this.sirenOsc1.connect(this.sirenGain);
        this.sirenOsc1.start();
        
        // Modulator for sweeping tone
        this.sirenOsc2 = this.ctx.createOscillator();
        this.sirenOsc2.type = 'sine';
        this.sirenOsc2.frequency.setValueAtTime(1.5, this.ctx.currentTime); // LFO Speed
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(150, this.ctx.currentTime); // Depth
        
        this.sirenOsc2.connect(lfoGain);
        lfoGain.connect(this.sirenOsc1.frequency);
        this.sirenOsc2.start();
        
        this.sirenGain.gain.setValueAtTime(0.08, this.ctx.currentTime); // Low volume for comfort

        // 2. Bell Alarm (Simulated striking sound)
        this.triggerBellStrike();
        this.bellInterval = setInterval(() => {
            this.triggerBellStrike();
        }, 220); // Strike rate (bell clapper)
    }

    triggerBellStrike() {
        if (!this.ctx || !state.audioEnabled || !this.isPlaying) return;
        
        // Combine multiple metallic frequencies
        const freqs = [850, 1075, 2200, 3100];
        const gainNode = this.ctx.createGain();
        gainNode.connect(this.bellGain);
        
        this.bellGain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        
        freqs.forEach(freq => {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            
            // Fast exponential decay to simulate striker bell ring
            gainNode.gain.setValueAtTime(0.3, this.ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
            
            osc.connect(gainNode);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.35);
        });
    }

    stopAlarms() {
        this.isPlaying = false;
        if (this.bellInterval) {
            clearInterval(this.bellInterval);
            this.bellInterval = null;
        }
        
        if (this.sirenGain) {
            this.sirenGain.gain.setValueAtTime(0, this.ctx.currentTime);
        }
        if (this.bellGain) {
            this.bellGain.gain.setValueAtTime(0, this.ctx.currentTime);
        }
        
        try {
            if (this.sirenOsc1) { this.sirenOsc1.stop(); this.sirenOsc1.disconnect(); }
            if (this.sirenOsc2) { this.sirenOsc2.stop(); this.sirenOsc2.disconnect(); }
        } catch (e) {}
    }
}

const audioEngine = new SafetyAudioEngine();

// ==========================================
// 3. EVENT LOGGER IMPLEMENTATION
// ==========================================
const eventLog = [];

function logEvent(category, zone, message, severity = 'info') {
    const timestamp = new Date();
    const event = {
        timestamp,
        category,
        zone,
        message,
        severity
    };
    eventLog.unshift(event);
    
    // Limit log length in browser memory
    if (eventLog.length > 200) {
        eventLog.pop();
    }
    
    renderEventLog();
}

function renderEventLog(filter = 'all') {
    const tbody = document.getElementById('event-log-body');
    tbody.innerHTML = '';
    
    const filteredLog = eventLog.filter(event => {
        if (filter === 'all') return true;
        if (filter === 'alarm') return event.severity === 'alarm' || event.severity === 'warning';
        if (filter === 'system') return event.category === 'SYSTEM';
        return true;
    });
    
    filteredLog.forEach(evt => {
        const tr = document.createElement('tr');
        
        // Timestamp format HH:MM:SS.mmm
        const tsString = evt.timestamp.toLocaleTimeString() + '.' + String(evt.timestamp.getMilliseconds()).padStart(3, '0');
        
        // Severity Badge Class
        let badgeClass = 'info';
        if (evt.severity === 'alarm') badgeClass = 'alarm';
        else if (evt.severity === 'warning') badgeClass = 'warning';
        else if (evt.severity === 'safe') badgeClass = 'safe';
        
        tr.innerHTML = `
            <td class="log-timestamp">${evt.timestamp.toLocaleDateString()} ${tsString}</td>
            <td><span class="badge ${badgeClass}">${evt.category}</span></td>
            <td style="font-weight: 500;">${evt.zone}</td>
            <td>${evt.message}</td>
            <td><span class="badge ${badgeClass}">${evt.severity.toUpperCase()}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// Clear and Export CSV
document.getElementById('clear-logs-btn').addEventListener('click', () => {
    eventLog.length = 0;
    logEvent("SYSTEM", "Dashboard", "Event log database cleared by operator.", "info");
});

document.getElementById('export-logs-btn').addEventListener('click', () => {
    if (eventLog.length === 0) return;
    let csvContent = "data:text/csv;charset=utf-8,Timestamp,Category,Zone,Message,Severity\n";
    eventLog.forEach(e => {
        csvContent += `"${e.timestamp.toISOString()}","${e.category}","${e.zone}","${e.message.replace(/"/g, '""')}","${e.severity}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `fgs_event_log_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// Category log buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        renderEventLog(e.target.dataset.filter);
    });
});

// Seed Initial System Logs
logEvent("SYSTEM", "Dashboard", "FGS Monitoring Dashboard client booted.", "info");
logEvent("SYSTEM", "PLC Gateway", "Modbus polling task sequence initialized.", "safe");

// ==========================================
// 4. CHARTS CONFIGURATION (Chart.js)
// ==========================================
const maxDataPoints = 30;
const chartTimeLabels = Array.from({length: maxDataPoints}, (_, i) => '');

// Temperature Chart setup
const tempCtx = document.getElementById('temp-line-chart').getContext('2d');
const tempChart = new Chart(tempCtx, {
    type: 'line',
    data: {
        labels: chartTimeLabels,
        datasets: [
            {
                label: 'Level 1 Temp (°C)',
                data: Array(maxDataPoints).fill(22.0),
                borderColor: '#60a5fa',
                backgroundColor: 'rgba(96, 165, 250, 0.05)',
                borderWidth: 2, pointRadius: 0, tension: 0.3
            },
            {
                label: 'Level 2 Temp (°C)',
                data: Array(maxDataPoints).fill(24.0),
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.05)',
                borderWidth: 2, pointRadius: 0, tension: 0.3
            },
            {
                label: 'Level 3 Temp (°C)',
                data: Array(maxDataPoints).fill(23.5),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                borderWidth: 2, pointRadius: 0, tension: 0.3
            },
            {
                label: 'Level 4 Temp (°C)',
                data: Array(maxDataPoints).fill(25.0),
                borderColor: '#a78bfa',
                backgroundColor: 'rgba(167, 139, 250, 0.05)',
                borderWidth: 2, pointRadius: 0, tension: 0.3
            },
            {
                label: 'Level 5 Temp (°C)',
                data: Array(maxDataPoints).fill(23.0),
                borderColor: '#f97316',
                backgroundColor: 'rgba(249, 115, 22, 0.05)',
                borderWidth: 2, pointRadius: 0, tension: 0.3
            },
            {
                label: 'Rooftop Temp (°C)',
                data: Array(maxDataPoints).fill(28.0),
                borderColor: '#ec4899',
                backgroundColor: 'rgba(236, 72, 153, 0.05)',
                borderWidth: 2, pointRadius: 0, tension: 0.3
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                labels: { color: '#94a3b8', font: { size: 8, family: 'Outfit' }, boxWidth: 10, padding: 6 }
            }
        },
        scales: {
            x: { display: false },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.04)' },
                ticks: { color: '#64748b', font: { size: 9, family: 'Space Grotesk' } },
                min: 0,
                max: 100
            }
        }
    }
});

// Smoke Occlusion Chart Setup
const smokeCtx = document.getElementById('smoke-line-chart').getContext('2d');
const smokeChart = new Chart(smokeCtx, {
    type: 'line',
    data: {
        labels: chartTimeLabels,
        datasets: [
            {
                label: 'Level 1 Smoke (% obs/m)',
                data: Array(maxDataPoints).fill(0.05),
                borderColor: '#bae6fd',
                backgroundColor: 'rgba(186, 230, 253, 0.03)',
                borderWidth: 1.5, pointRadius: 0, tension: 0.3
            },
            {
                label: 'Level 2 Smoke (% obs/m)',
                data: Array(maxDataPoints).fill(0.07),
                borderColor: '#fde68a',
                backgroundColor: 'rgba(253, 230, 138, 0.03)',
                borderWidth: 1.5, pointRadius: 0, tension: 0.3
            },
            {
                label: 'Level 3 Smoke (% obs/m)',
                data: Array(maxDataPoints).fill(0.06),
                borderColor: '#a7f3d0',
                backgroundColor: 'rgba(167, 243, 208, 0.03)',
                borderWidth: 1.5, pointRadius: 0, tension: 0.3
            },
            {
                label: 'Level 4 Smoke (% obs/m)',
                data: Array(maxDataPoints).fill(0.04),
                borderColor: '#ddd6fe',
                backgroundColor: 'rgba(221, 214, 254, 0.03)',
                borderWidth: 1.5, pointRadius: 0, tension: 0.3
            },
            {
                label: 'Level 5 Smoke (% obs/m)',
                data: Array(maxDataPoints).fill(0.08),
                borderColor: '#fed7aa',
                backgroundColor: 'rgba(254, 215, 170, 0.03)',
                borderWidth: 1.5, pointRadius: 0, tension: 0.3
            },
            {
                label: 'Rooftop Smoke (% obs/m)',
                data: Array(maxDataPoints).fill(0.03),
                borderColor: '#fbcfe8',
                backgroundColor: 'rgba(251, 207, 232, 0.03)',
                borderWidth: 1.5, pointRadius: 0, tension: 0.3
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                labels: { color: '#94a3b8', font: { size: 8, family: 'Outfit' }, boxWidth: 10, padding: 6 }
            }
        },
        scales: {
            x: { display: false },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.04)' },
                ticks: { color: '#64748b', font: { size: 9, family: 'Space Grotesk' } },
                min: 0.0,
                max: 4.5
            }
        }
    }
});

// ==========================================
// 5. INTERACTIVE CANVAS FLOOR PLAN RENDERER
// ==========================================
const LEVEL_PAGES = ['level1', 'level2', 'level3', 'level4', 'level5', 'rooftop'];
const levelCanvasMap = {};

function buildLevelPages() {
    const registryPage = document.getElementById('page-registry');
    if (!registryPage) return;

    LEVEL_PAGES.forEach(zoneId => {
        const zone = state.zones[zoneId];
        const tags = zoneTags[zoneId];
        const page = document.createElement('div');
        page.id = `page-${zoneId}`;
        page.className = 'page-view level-page-view';

        const tagItems = [
            { type: 'Smoke Detector', id: tags.smoke, key: 'smoke' },
            { type: 'Heat Detector', id: tags.heat, key: 'heat' },
            { type: 'Manual Call Point', id: tags.mcp, key: 'mcp' },
            { type: 'Alarm Bell', id: tags.bell, key: 'bell' }
        ];

        if (zoneId === 'rooftop' && tags.gas) {
            tagItems.splice(2, 0, { type: 'Gas Detector', id: tags.gas, key: 'gas' });
        }

        const tagListHtml = tagItems.map(item => `
            <div class="level-tag-item" id="level-tag-${zoneId}-${item.key}">
                <span class="tag-label">${item.type}</span>
                <span class="tag-id">${item.id}</span>
            </div>
        `).join('');

        const gasReading = zoneId === 'rooftop'
            ? `<div class="level-reading-row">
                    <span>Gas (${tags.gas})</span>
                    <span id="level-page-gas-${zoneId}">0 ppm</span>
               </div>`
            : '';

        page.innerHTML = `
            <main class="level-page-grid">
                <section class="grid-panel">
                    <div class="panel-header">
                        <i data-lucide="map"></i>
                        <h2>${zone.name} — Device Tag Map</h2>
                    </div>
                    <div class="level-floor-plan-wrapper">
                        <canvas class="level-floor-canvas" id="level-canvas-${zoneId}" data-zone="${zoneId}"></canvas>
                    </div>
                </section>
                <section class="grid-panel">
                    <div class="panel-header">
                        <i data-lucide="activity"></i>
                        <h2>${zone.name} Live Status</h2>
                    </div>
                    <div class="level-status-badge normal" id="level-status-${zoneId}">NORMAL</div>
                    <div class="level-tag-list">${tagListHtml}</div>
                    <div class="level-readings">
                        <div class="level-reading-row">
                            <span>Smoke (${tags.smoke})</span>
                            <span id="level-page-smoke-${zoneId}">0.00%</span>
                        </div>
                        <div class="level-reading-row">
                            <span>Temperature (${tags.heat})</span>
                            <span id="level-page-temp-${zoneId}">0.0°C</span>
                        </div>
                        ${gasReading}
                    </div>
                </section>
            </main>
        `;

        registryPage.parentNode.insertBefore(page, registryPage);
    });
}

buildLevelPages();

const canvas = document.getElementById('floor-plan-canvas');
const ctx = canvas.getContext('2d');

// Resizing Canvas relative to container size
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

document.querySelectorAll('.level-floor-canvas').forEach(levelCanvas => {
    const zoneId = levelCanvas.dataset.zone;
    levelCanvasMap[zoneId] = {
        canvas: levelCanvas,
        ctx: levelCanvas.getContext('2d')
    };
});

function resizeLevelCanvas(zoneId) {
    const entry = levelCanvasMap[zoneId];
    if (!entry) return;

    const { canvas: levelCanvas, ctx: levelCtx } = entry;
    const dpr = window.devicePixelRatio || 1;
    const rect = levelCanvas.getBoundingClientRect();
    levelCanvas.width = rect.width * dpr;
    levelCanvas.height = rect.height * dpr;
    levelCtx.setTransform(1, 0, 0, 1, 0, 0);
    levelCtx.scale(dpr, dpr);
}

function resizeAllLevelCanvases() {
    LEVEL_PAGES.forEach(resizeLevelCanvas);
}

window.addEventListener('resize', resizeAllLevelCanvases);
resizeAllLevelCanvases();

// Zone Coordinates for Layout — 2-column × 3-row building cross-section
// Row order (top → bottom): Level 5 | Rooftop  →  Level 3 | Level 4  →  Level 1 | Level 2
const zoneLayouts = {
    level5: {
        x: 10, y: 15, w: 365, h: 130,
        name: "LEVEL 5",
        smokePos: {x: 80, y: 80},
        tempPos:  {x: 195, y: 80},
        mcpPos:   {x: 25, y: 125},
        bellPos:  {x: 350, y: 30}
    },
    rooftop: {
        x: 385, y: 15, w: 365, h: 130,
        name: "ROOFTOP",
        smokePos: {x: 455, y: 80},
        tempPos:  {x: 545, y: 80},
        gasPos:   {x: 640, y: 80},
        mcpPos:   {x: 400, y: 125},
        bellPos:  {x: 725, y: 30}
    },
    level3: {
        x: 10, y: 155, w: 365, h: 130,
        name: "LEVEL 3",
        smokePos: {x: 80, y: 220},
        tempPos:  {x: 195, y: 220},
        mcpPos:   {x: 25, y: 265},
        bellPos:  {x: 350, y: 170}
    },
    level4: {
        x: 385, y: 155, w: 365, h: 130,
        name: "LEVEL 4",
        smokePos: {x: 455, y: 220},
        tempPos:  {x: 570, y: 220},
        mcpPos:   {x: 400, y: 265},
        bellPos:  {x: 725, y: 170}
    },
    level1: {
        x: 10, y: 295, w: 365, h: 130,
        name: "LEVEL 1",
        smokePos: {x: 80, y: 360},
        tempPos:  {x: 195, y: 360},
        mcpPos:   {x: 25, y: 405},
        bellPos:  {x: 350, y: 310}
    },
    level2: {
        x: 385, y: 295, w: 365, h: 130,
        name: "LEVEL 2",
        smokePos: {x: 455, y: 360},
        tempPos:  {x: 570, y: 360},
        mcpPos:   {x: 400, y: 405},
        bellPos:  {x: 725, y: 310}
    }
};

// Canvas drawing loop
function drawBlueprintGrid(targetCtx, width, height) {
    targetCtx.strokeStyle = COLORS.blueprintGrid;
    targetCtx.lineWidth = 1;
    const gridSize = 20;
    for (let x = 0; x < width; x += gridSize) {
        targetCtx.beginPath();
        targetCtx.moveTo(x, 0);
        targetCtx.lineTo(x, height);
        targetCtx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
        targetCtx.beginPath();
        targetCtx.moveTo(0, y);
        targetCtx.lineTo(width, y);
        targetCtx.stroke();
    }
}

function drawZoneFrame(targetCtx, layout, zoneData, status) {
    if (zoneData.smoke_level > 0.05) {
        const density = Math.min(zoneData.smoke_level / 4.0, 0.85);
        targetCtx.fillStyle = `rgba(148, 163, 184, ${density})`;
        targetCtx.fillRect(layout.x, layout.y, layout.w, layout.h);
    }

    if (zoneData.gas_level !== undefined && zoneData.gas_level > 10) {
        const gasDensity = Math.min(zoneData.gas_level / 800, 0.7);
        targetCtx.fillStyle = `rgba(0, 245, 255, ${gasDensity * 0.45})`;
        targetCtx.fillRect(layout.x, layout.y, layout.w, layout.h);
    }

    targetCtx.strokeStyle = COLORS.blueprint;
    targetCtx.lineWidth = 3;
    targetCtx.strokeRect(layout.x, layout.y, layout.w, layout.h);

    if (zoneData.mos_mode) {
        targetCtx.fillStyle = 'rgba(245, 158, 11, 0.04)';
        targetCtx.fillRect(layout.x, layout.y, layout.w, layout.h);
        targetCtx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
        targetCtx.lineWidth = 2;
        targetCtx.setLineDash([4, 4]);
        targetCtx.strokeRect(layout.x + 2, layout.y + 2, layout.w - 4, layout.h - 4);
        targetCtx.setLineDash([]);
    } else if (status === 'ALARM') {
        targetCtx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
        targetCtx.shadowColor = 'rgba(239, 68, 68, 0.5)';
        targetCtx.shadowBlur = 8;
        targetCtx.lineWidth = 2.5;
        targetCtx.strokeRect(layout.x + 2, layout.y + 2, layout.w - 4, layout.h - 4);
        targetCtx.shadowBlur = 0;
    } else if (status === 'WARNING') {
        targetCtx.strokeStyle = 'rgba(245, 158, 11, 0.8)';
        targetCtx.strokeRect(layout.x + 2, layout.y + 2, layout.w - 4, layout.h - 4);
    }
}

function drawFloorPlan() {
    if (!ctx) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);
    drawBlueprintGrid(ctx, width, height);

    Object.entries(zoneLayouts).forEach(([zoneId, layout]) => {
        const zoneData = state.zones[zoneId];
        const status = getZoneStatus(zoneId);
        drawZoneFrame(ctx, layout, zoneData, status);
        drawZoneTagList(ctx, zoneId, layout, zoneData, false);
    });

    Object.entries(levelCanvasMap).forEach(([zoneId, entry]) => {
        drawSingleLevelCanvas(entry.canvas, entry.ctx, zoneId);
    });

    requestAnimationFrame(drawFloorPlan);
}

function drawSingleLevelCanvas(targetCanvas, targetCtx, zoneId) {
    if (!targetCtx || !targetCanvas) return;

    const width = targetCanvas.clientWidth;
    const height = targetCanvas.clientHeight;
    const zoneData = state.zones[zoneId];
    const status = getZoneStatus(zoneId);
    const padding = 36;
    const layout = {
        x: padding,
        y: padding,
        w: width - padding * 2,
        h: height - padding * 2
    };

    targetCtx.fillStyle = COLORS.bg;
    targetCtx.fillRect(0, 0, width, height);
    drawBlueprintGrid(targetCtx, width, height);
    drawZoneFrame(targetCtx, layout, zoneData, status);
    drawZoneTagList(targetCtx, zoneId, layout, zoneData, true);

    targetCtx.fillStyle = COLORS.text;
    targetCtx.font = 'bold 13px "Space Grotesk"';
    targetCtx.textAlign = 'left';
    targetCtx.fillText(state.zones[zoneId].name.toUpperCase(), layout.x + 8, layout.y + 22);
}

function drawZoneTagList(targetCtx, zoneId, layout, zoneData, large = false) {
    const tags = zoneTags[zoneId];
    if (!tags) return;

    const tagEntries = [
        { label: tags.smoke, alarm: zoneData.smoke_level >= state.thresholds.smoke },
        { label: tags.heat, alarm: zoneData.temperature >= state.thresholds.tempAlarm, warning: zoneData.temperature >= state.thresholds.tempWarning && zoneData.temperature < state.thresholds.tempAlarm }
    ];

    if (zoneId === 'rooftop' && tags.gas) {
        tagEntries.push({
            label: tags.gas,
            alarm: zoneData.gas_level >= state.thresholds.gasAlarm,
            warning: zoneData.gas_level >= state.thresholds.gasWarning && zoneData.gas_level < state.thresholds.gasAlarm
        });
    }

    tagEntries.push(
        { label: tags.mcp, alarm: zoneData.manual_call_point },
        { label: tags.bell, alarm: zoneData.alarm_bell }
    );

    const startX = layout.x + (large ? 24 : 14);
    const startY = layout.y + (large ? 48 : 24);
    const lineHeight = large ? 28 : 18;
    const fontSize = large ? 16 : 11;

    targetCtx.textAlign = 'left';
    tagEntries.forEach((entry, index) => {
        let color = COLORS.text;
        if (entry.alarm) color = COLORS.alarm;
        else if (entry.warning) color = COLORS.warning;

        targetCtx.fillStyle = color;
        targetCtx.font = `bold ${fontSize}px "Space Grotesk"`;
        targetCtx.fillText(entry.label, startX, startY + index * lineHeight);
    });

    if (zoneData.mos_mode) {
        targetCtx.fillStyle = '#f59e0b';
        targetCtx.font = `bold ${large ? 11 : 9}px "Space Grotesk"`;
        targetCtx.fillText('MOS ACTIVE', layout.x + layout.w - (large ? 92 : 72), layout.y + (large ? 22 : 16));
    }
}

// Click Canvas to Select Simulation Zone
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    Object.entries(zoneLayouts).forEach(([zoneId, layout]) => {
        if (x >= layout.x && x <= layout.x + layout.w && y >= layout.y && y <= layout.y + layout.h) {
            navigateToPage(zoneId, false);
        }
    });
});

// Start drawing floor plan loop
drawFloorPlan();

// ==========================================
// 6. SIMULATION ENGINE & ALARM TRIGGERS
// ==========================================
let simulationInterval = null;

function runSimulationLoop() {
    if (state.mode !== 'simulation') return;
    
    // Feed telemetry charts with current state
    updateTelemetryCharts();
    
    // Perform safety loop evaluation (evaluate thresholds and trigger bells/alarms)
    evaluateSafetySystem();
}

function updateTelemetryCharts() {
    // Dynamically update all 6 zone datasets
    const zoneKeys = Object.keys(state.zones);
    zoneKeys.forEach((zoneId, i) => {
        if (tempChart.data.datasets[i]) {
            tempChart.data.datasets[i].data.shift();
            tempChart.data.datasets[i].data.push(state.zones[zoneId].temperature);
        }
        if (smokeChart.data.datasets[i]) {
            smokeChart.data.datasets[i].data.shift();
            smokeChart.data.datasets[i].data.push(state.zones[zoneId].smoke_level);
        }
    });
    tempChart.update('none');
    smokeChart.update('none');
}

function getZoneStatus(zoneId) {
    const z = state.zones[zoneId];
    if (z.mos_mode) return 'MOS';
    
    if (z.manual_call_point) return 'ALARM';
    if (z.smoke_level >= state.thresholds.smoke) return 'ALARM';
    if (z.temperature >= state.thresholds.tempAlarm) return 'ALARM';
    if (zoneId === 'rooftop' && z.gas_level >= state.thresholds.gasAlarm) return 'ALARM';

    if (z.temperature >= state.thresholds.tempWarning) return 'WARNING';
    if (zoneId === 'rooftop' && z.gas_level >= state.thresholds.gasWarning) return 'WARNING';

    return 'NORMAL';
}

function evaluateSafetySystem() {
    // 1. Gather active triggers across non-MOS zones
    const activeSmokeZones = [];
    const activeHeatZones = [];
    const activeMcpZones = [];
    let rooftopGasAlarm = false;
    let rooftopGasWarning = false;
    let isDelugeTriggered = false;

    Object.entries(state.zones).forEach(([zoneId, z]) => {
        if (z.mos_mode) {
            z.alarm_bell = false; // Never ring in MOS mode
            return;
        }

        if (z.smoke_level >= state.thresholds.smoke) {
            activeSmokeZones.push(z.name);
        }
        if (z.temperature >= state.thresholds.tempAlarm) {
            activeHeatZones.push(z.name);
        }
        if (z.manual_call_point) {
            activeMcpZones.push(z.name);
        }
        if (z.temperature >= state.thresholds.tempDeluge) {
            isDelugeTriggered = true;
        }
        if (zoneId === 'rooftop') {
            if (z.gas_level >= state.thresholds.gasAlarm) {
                rooftopGasAlarm = true;
            } else if (z.gas_level >= state.thresholds.gasWarning) {
                rooftopGasWarning = true;
            }
        }
    });

    // 2. Evaluate Safety Interlocks
    const isSmokeDetected = activeSmokeZones.length > 0;
    const isHeatDetected = activeHeatZones.length > 0;
    const isConfirmedFire = activeSmokeZones.length >= 2;
    const isMcpTriggered = activeMcpZones.length > 0;

    state.interlocks = {
        smokeActive: isSmokeDetected,
        smokeZones: activeSmokeZones,
        heatActive: isHeatDetected,
        heatZones: activeHeatZones,
        confirmedFire: isConfirmedFire,
        mcpActive: isMcpTriggered,
        mcpZones: activeMcpZones
    };

    // 3. Determine Global State
    // ALARM is triggered by heat, confirmed fire (2oo2 smoke), manual call point, or rooftop gas
    const isGlobalAlarm = isHeatDetected || isConfirmedFire || isMcpTriggered || rooftopGasAlarm;

    let globalState = "NORMAL";
    if (isGlobalAlarm) {
        globalState = "ALARM";
    } else {
        // Warning is active if smoke is detected (but not confirmed fire),
        // warning-level temperature is present, or rooftop gas warning is raised
        const hasTempWarning = Object.values(state.zones).some(z => !z.mos_mode && z.temperature >= state.thresholds.tempWarning);
        if (isSmokeDetected || hasTempWarning || rooftopGasWarning) {
            globalState = "WARNING";
        }
    }

    // 4. Update Alarm Bells
    Object.keys(state.zones).forEach(zoneId => {
        const z = state.zones[zoneId];
        if (z.mos_mode) {
            z.alarm_bell = false;
        } else {
            // Bells ring on any local/global alarm
            const status = getZoneStatus(zoneId);
            z.alarm_bell = (globalState === 'ALARM' || status === 'ALARM');
        }
    });

    // Alarm transition log events
    if (globalState === 'ALARM' && state.system_status !== 'ALARM') {
        logEvent("ALARM", "Safety System", "CRITICAL STATUS TRIGGERED! Fire alarm active. HVAC isolated.", "alarm");
        state.hvac_damper = "ISOLATED";
    } else if (globalState === 'WARNING' && state.system_status === 'NORMAL') {
        logEvent("WARNING", "Safety System", "Ambient environment telemetry warnings raised.", "warning");
    }

    state.system_status = globalState;
    state.sprinklers = isDelugeTriggered ? "ACTIVE" : "STANDBY";

    // Manage audible alarms mute state
    if (state.system_status === 'ALARM' && !state.acknowledged) {
        audioEngine.startAlarms();
    } else {
        audioEngine.stopAlarms();
    }
    
    updateUIActuators();
}

function updateUIActuators() {
    // Health badge details
    const healthBadge = document.getElementById('system-health-badge');
    const healthText = document.getElementById('system-health-text');
    
    if (state.system_status === 'ALARM') {
        healthBadge.className = "status-badge disconnect";
        healthText.innerText = "SYSTEM CRITICAL: FIRE/GAS ALARM";
    } else if (state.system_status === 'WARNING') {
        healthBadge.className = "status-badge connecting";
        healthText.innerText = "SYSTEM ALERT: WARNING STATE";
    } else {
        healthBadge.className = "status-badge";
        healthText.innerText = "SYSTEM HEALTH: SECURE";
    }

    // HVAC display status
    const hvacIcon = document.getElementById('hvac-status-icon');
    const hvacText = document.getElementById('hvac-status-text');
    if (state.hvac_damper === "OPEN") {
        hvacText.innerText = "HVAC OPEN";
        hvacIcon.className = "indicator-icon";
    } else {
        hvacText.innerText = "HVAC ISOLATED";
        hvacIcon.className = "indicator-icon red";
    }

    // Sprinkler display status
    const sprinklerIcon = document.getElementById('sprinkler-status-icon');
    const sprinklerText = document.getElementById('sprinkler-status-text');
    if (state.sprinklers === "ACTIVE") {
        sprinklerText.innerText = "DELUGE ACTIVE";
        sprinklerIcon.className = "indicator-icon red";
        document.getElementById('sprinkler-icon').classList.add('spinning');
    } else {
        sprinklerText.innerText = "STANDBY";
        sprinklerIcon.className = "indicator-icon";
        document.getElementById('sprinkler-icon').classList.remove('spinning');
    }

    // Update FGS Safety Interlocks status
    if (state.interlocks) {
        const indSmoke = document.getElementById('ind-smoke');
        const valSmokeInterlock = document.getElementById('val-interlock-smoke');
        if (state.interlocks.smokeActive) {
            indSmoke.className = "interlock-indicator warning";
            valSmokeInterlock.innerText = `ACTIVE (${state.interlocks.smokeZones.join(', ')})`;
            valSmokeInterlock.style.color = 'var(--color-warning)';
        } else {
            indSmoke.className = "interlock-indicator normal";
            valSmokeInterlock.innerText = "NORMAL";
            valSmokeInterlock.style.color = 'var(--color-safe)';
        }

        const indHeat = document.getElementById('ind-heat');
        const valHeatInterlock = document.getElementById('val-interlock-heat');
        if (state.interlocks.heatActive) {
            indHeat.className = "interlock-indicator alarm";
            valHeatInterlock.innerText = `ACTIVE (${state.interlocks.heatZones.join(', ')})`;
            valHeatInterlock.style.color = 'var(--color-alarm)';
        } else {
            indHeat.className = "interlock-indicator normal";
            valHeatInterlock.innerText = "NORMAL";
            valHeatInterlock.style.color = 'var(--color-safe)';
        }

        const indCoincidence = document.getElementById('ind-coincidence');
        const valCoincidenceInterlock = document.getElementById('val-interlock-coincidence');
        if (state.interlocks.confirmedFire) {
            indCoincidence.className = "interlock-indicator alarm";
            valCoincidenceInterlock.innerText = `ACTIVE (${state.interlocks.smokeZones.join(', ')})`;
            valCoincidenceInterlock.style.color = 'var(--color-alarm)';
        } else {
            indCoincidence.className = "interlock-indicator normal";
            valCoincidenceInterlock.innerText = "INACTIVE";
            valCoincidenceInterlock.style.color = 'var(--text-muted)';
        }

        const indMcp = document.getElementById('ind-mcp');
        const valMcpInterlock = document.getElementById('val-interlock-mcp');
        if (state.interlocks.mcpActive) {
            indMcp.className = "interlock-indicator alarm";
            valMcpInterlock.innerText = `ACTIVE (${state.interlocks.mcpZones.join(', ')})`;
            valMcpInterlock.style.color = 'var(--color-alarm)';
        } else {
            indMcp.className = "interlock-indicator normal";
            valMcpInterlock.innerText = "INACTIVE";
            valMcpInterlock.style.color = 'var(--text-muted)';
        }
    }

    // Telemetry Card elements
    Object.keys(state.zones).forEach(zoneId => {
        const card = document.getElementById(`card-${zoneId}`);
        const dot = document.getElementById(`dot-${zoneId}`);
        const valSmoke = document.getElementById(`val-smoke-${zoneId}`);
        const valTemp = document.getElementById(`val-temp-${zoneId}`);
        const mcpIcon = document.getElementById(`mcp-${zoneId}`);
        const bellIcon = document.getElementById(`bell-${zoneId}`);
        const mosCheckbox = document.getElementById(`mos-toggle-${zoneId}`);
        
        const z = state.zones[zoneId];
        const status = getZoneStatus(zoneId);
        
        // Updates readings text
        valSmoke.innerText = `${z.smoke_level.toFixed(2)} %`;
        valTemp.innerText = `${z.temperature.toFixed(1)}\u00b0C`;
        if (zoneId === 'rooftop') {
            document.getElementById('val-gas-rooftop').innerText = `${Math.round(z.gas_level)} ppm`;
        }

        // Keep checkbox checked state in sync with state in memory
        if (mosCheckbox) {
            mosCheckbox.checked = z.mos_mode;
        }

        // Apply status colors to card border
        if (z.mos_mode) {
            card.className = "telemetry-card mos";
            dot.className = "status-dot orange";
        } else if (status === 'ALARM') {
            card.className = "telemetry-card alarm";
            dot.className = "status-dot red";
        } else if (status === 'WARNING') {
            card.className = "telemetry-card warning";
            dot.className = "status-dot orange";
        } else {
            card.className = "telemetry-card";
            dot.className = "status-dot green";
        }

        // Check active hardware components
        if (z.manual_call_point) {
            mcpIcon.className = "mcp-icon active";
            mcpIcon.setAttribute("data-lucide", "check-square");
        } else {
            mcpIcon.className = "mcp-icon";
            mcpIcon.setAttribute("data-lucide", "square");
        }
        
        if (z.alarm_bell) {
            bellIcon.className = "bell-icon active";
        } else {
            bellIcon.className = "bell-icon";
        }
    });

    updateLevelPageUI();

    // Sidebar status health sync
    const sidebarDot = document.getElementById('sidebar-health-dot');
    const sidebarText = document.getElementById('sidebar-health-text');
    if (sidebarDot && sidebarText) {
        if (state.system_status === 'ALARM') {
            sidebarDot.className = "status-dot red";
            sidebarText.innerText = "HEALTH: ALARM";
            sidebarText.style.color = 'var(--color-alarm)';
        } else if (state.system_status === 'WARNING') {
            sidebarDot.className = "status-dot orange";
            sidebarText.innerText = "HEALTH: WARNING";
            sidebarText.style.color = 'var(--color-warning)';
        } else {
            sidebarDot.className = "status-dot green";
            sidebarText.innerText = "HEALTH: SECURE";
            sidebarText.style.color = 'var(--color-safe)';
        }
    }

    // Update Modbus Registry live statuses if it's active
    const registryPage = document.getElementById('page-registry');
    if (registryPage && registryPage.classList.contains('active')) {
        renderRegistryTable();
    }

    lucide.createIcons(); // refresh icons
}

function updateLevelPageUI() {
    LEVEL_PAGES.forEach(zoneId => {
        const z = state.zones[zoneId];
        const status = getZoneStatus(zoneId);

        const statusBadge = document.getElementById(`level-status-${zoneId}`);
        if (statusBadge) {
            if (z.mos_mode) {
                statusBadge.className = 'level-status-badge warning';
                statusBadge.textContent = 'MOS ACTIVE';
            } else if (status === 'ALARM') {
                statusBadge.className = 'level-status-badge alarm';
                statusBadge.textContent = 'ALARM';
            } else if (status === 'WARNING') {
                statusBadge.className = 'level-status-badge warning';
                statusBadge.textContent = 'WARNING';
            } else {
                statusBadge.className = 'level-status-badge normal';
                statusBadge.textContent = 'NORMAL';
            }
        }

        const smokeEl = document.getElementById(`level-page-smoke-${zoneId}`);
        const tempEl = document.getElementById(`level-page-temp-${zoneId}`);
        if (smokeEl) smokeEl.textContent = `${z.smoke_level.toFixed(2)}%`;
        if (tempEl) tempEl.textContent = `${z.temperature.toFixed(1)}°C`;

        const gasEl = document.getElementById(`level-page-gas-${zoneId}`);
        if (gasEl) gasEl.textContent = `${Math.round(z.gas_level)} ppm`;

        const tagStates = [
            { key: 'smoke', alarm: z.smoke_level >= state.thresholds.smoke },
            { key: 'heat', alarm: z.temperature >= state.thresholds.tempAlarm, warning: z.temperature >= state.thresholds.tempWarning && z.temperature < state.thresholds.tempAlarm },
            { key: 'mcp', alarm: z.manual_call_point },
            { key: 'bell', alarm: z.alarm_bell }
        ];

        if (zoneId === 'rooftop') {
            tagStates.splice(2, 0, {
                key: 'gas',
                alarm: z.gas_level >= state.thresholds.gasAlarm,
                warning: z.gas_level >= state.thresholds.gasWarning && z.gas_level < state.thresholds.gasAlarm
            });
        }

        tagStates.forEach(item => {
            const el = document.getElementById(`level-tag-${zoneId}-${item.key}`);
            if (!el) return;
            el.className = 'level-tag-item';
            if (item.alarm) el.classList.add('alarm');
            else if (item.warning) el.classList.add('warning');
        });
    });
}

// Sliders and Actions Bindings for Simulation panel
const zoneSelect = document.getElementById('sim-zone-select');
const smokeSlider = document.getElementById('slider-smoke');
const tempSlider = document.getElementById('slider-temp');
const gasSlider = document.getElementById('slider-gas');

function updateSlidersFromState(zoneId) {
    const z = state.zones[zoneId];
    smokeSlider.value = z.smoke_level * 100;
    document.getElementById('val-smoke').innerText = `${z.smoke_level.toFixed(2)}%`;
    
    tempSlider.value = z.temperature;
    document.getElementById('val-temp').innerText = `${z.temperature.toFixed(1)}°C`;

    if (zoneId === 'rooftop') {
        document.getElementById('sim-gas-group').classList.remove('hidden');
        gasSlider.value = z.gas_level;
        document.getElementById('val-gas').innerText = `${Math.round(z.gas_level)} ppm`;
    } else {
        document.getElementById('sim-gas-group').classList.add('hidden');
    }
}

zoneSelect.addEventListener('change', (e) => {
    updateSlidersFromState(e.target.value);
});

smokeSlider.addEventListener('input', (e) => {
    if (state.mode !== 'simulation') return;
    const zoneId = zoneSelect.value;
    const val = parseFloat(e.target.value) / 100;
    state.zones[zoneId].smoke_level = val;
    document.getElementById('val-smoke').innerText = `${val.toFixed(2)}%`;
    
    if (val >= state.thresholds.smoke && state.system_status !== 'ALARM') {
        logEvent("ALARM", state.zones[zoneId].name, `Optical smoke chamber threshold exceeded: ${val.toFixed(2)}% obs/m`, "alarm");
    }
});

tempSlider.addEventListener('input', (e) => {
    if (state.mode !== 'simulation') return;
    const zoneId = zoneSelect.value;
    const val = parseFloat(e.target.value);
    state.zones[zoneId].temperature = val;
    document.getElementById('val-temp').innerText = `${val.toFixed(1)}°C`;
    
    if (val >= state.thresholds.tempAlarm && state.system_status !== 'ALARM') {
        logEvent("ALARM", state.zones[zoneId].name, `Thermal sensor temperature threshold tripped: ${val.toFixed(1)}°C`, "alarm");
    } else if (val >= state.thresholds.tempWarning && val < state.thresholds.tempAlarm && state.system_status === 'NORMAL') {
        logEvent("WARNING", state.zones[zoneId].name, `Abnormal heat build-up detected: ${val.toFixed(1)}°C`, "warning");
    }
});

gasSlider.addEventListener('input', (e) => {
    if (state.mode !== 'simulation') return;
    const val = parseFloat(e.target.value);
    state.zones.rooftop.gas_level = val;
    document.getElementById('val-gas').innerText = `${Math.round(val)} ppm`;

    if (val >= state.thresholds.gasAlarm && state.system_status !== 'ALARM') {
        logEvent("ALARM", "Rooftop", `Combustible Gas concentration exceeded limits: ${val} ppm`, "alarm");
    } else if (val >= state.thresholds.gasWarning && val < state.thresholds.gasAlarm && state.system_status === 'NORMAL') {
        logEvent("WARNING", "Rooftop", `Elevated gas level detected on rooftop: ${val} ppm`, "warning");
    }
});

// Manual Call Point button
document.getElementById('sim-mcp-btn').addEventListener('click', () => {
    if (state.mode !== 'simulation') return;
    const zoneId = zoneSelect.value;
    state.zones[zoneId].manual_call_point = true;
    logEvent("ALARM", state.zones[zoneId].name, `Manual Alarm Call Point (MCP) lever pulled down!`, "alarm");
    evaluateSafetySystem();
});

// Clear Hazards (Reset simulator sliders back to normal)
document.getElementById('sim-reset-hazard-btn').addEventListener('click', () => {
    if (state.mode !== 'simulation') return;
    Object.keys(state.zones).forEach(zoneId => {
        state.zones[zoneId].smoke_level = 0.05 + Math.random() * 0.04;
        state.zones[zoneId].temperature = 21.0 + Math.random() * 2.0;
        state.zones[zoneId].manual_call_point = false;
        if (zoneId === 'rooftop') {
            state.zones[zoneId].gas_level = 10 + Math.random() * 5;
        }
    });
    
    updateSlidersFromState(zoneSelect.value);
    logEvent("SYSTEM", "Dashboard", "Simulator hazard values cleared. Monitoring normal.", "safe");
    evaluateSafetySystem();
});

// Acknowledge Alarm Action
document.getElementById('cmd-ack-btn').addEventListener('click', () => {
    state.acknowledged = true;
    logEvent("SYSTEM", "Operator Center", "System alarm buzzer acknowledged and muted.", "info");
    
    // MQTT publish ACK command
    if (state.mode === 'mqtt' && state.mqttConnected) {
        publishCommand("ACKNOWLEDGE");
    }
    
    evaluateSafetySystem();
});

// Reset Safety System Action
document.getElementById('cmd-reset-btn').addEventListener('click', () => {
    // Check if hazards have been cleared first
    let hazardsActive = false;
    Object.keys(state.zones).forEach(zoneId => {
        const status = getZoneStatus(zoneId);
        if (status === 'ALARM') hazardsActive = true;
    });
    
    if (hazardsActive) {
        logEvent("SYSTEM", "Operator Center", "SYSTEM RESET ABORTED: Environmental hazard conditions still active.", "warning");
        return;
    }

    state.acknowledged = false;
    state.hvac_damper = "OPEN";
    state.sprinklers = "STANDBY";
    state.system_status = "NORMAL";
    
    Object.keys(state.zones).forEach(zoneId => {
        state.zones[zoneId].manual_call_point = false;
        state.zones[zoneId].alarm_bell = false;
    });

    logEvent("SYSTEM", "Operator Center", "SYSTEM RESET EXECUTED. Resetting detectors and latching circuits. HVAC Dampers restoring.", "safe");
    
    // MQTT publish RESET command
    if (state.mode === 'mqtt' && state.mqttConnected) {
        publishCommand("RESET");
    }
    
    evaluateSafetySystem();
});

// Auto-Injector Simulator
let injectorInterval = null;
const autoInjectToggle = document.getElementById('auto-inject-toggle');

autoInjectToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
        logEvent("SYSTEM", "Simulation", "Auto Scenario Injector active.", "info");
        runAutoInjector();
    } else {
        logEvent("SYSTEM", "Simulation", "Auto Scenario Injector deactivated.", "info");
        clearInterval(injectorInterval);
        injectorInterval = null;
    }
});

function runAutoInjector() {
    if (injectorInterval) clearInterval(injectorInterval);
    
    injectorInterval = setInterval(() => {
        if (state.mode !== 'simulation') return;
        
        const rand = Math.random();
        if (rand < 0.6) {
            // Normal operations slight fluctuations
            Object.keys(state.zones).forEach(zoneId => {
                const z = state.zones[zoneId];
                if (z.temperature < 40 && z.smoke_level < 1.0) {
                    z.temperature += (Math.random() - 0.5) * 1.5;
                    z.smoke_level = Math.max(0.01, z.smoke_level + (Math.random() - 0.5) * 0.02);
                }
            });
        } else if (rand < 0.72) {
            // Smoke build-up Level 1
            state.zones.level1.smoke_level = 2.45;
            logEvent("SIMULATION", "Level 1", "[AUTO-INJECTED] Smoke build-up detected on floor.", "warning");
        } else if (rand < 0.84) {
            // Overheat Level 3
            state.zones.level3.temperature = 65.4;
            logEvent("SIMULATION", "Level 3", "[AUTO-INJECTED] HVAC cooling failure causing overheating.", "warning");
        } else if (rand < 0.93) {
            // Gas leak Rooftop
            state.zones.rooftop.gas_level = 380;
            logEvent("SIMULATION", "Rooftop", "[AUTO-INJECTED] Gas leak from rooftop plant room equipment.", "warning");
        } else {
            // MCP Lever pull
            const zonesList = Object.keys(state.zones);
            const targetZone = zonesList[Math.floor(Math.random() * zonesList.length)];
            state.zones[targetZone].manual_call_point = true;
            logEvent("SIMULATION", state.zones[targetZone].name, "[AUTO-INJECTED] Panic button call activated.", "warning");
        }
        
        updateSlidersFromState(zoneSelect.value);
        evaluateSafetySystem();
    }, 12000);
}

// Start simulation loop ticker
simulationInterval = setInterval(runSimulationLoop, 1000);

// Initialize slider levels
updateSlidersFromState('level1');

// ==========================================
// 7. MQTT BROKER SERVICE INTEGRATION
// ==========================================
const modeSimBtn = document.getElementById('mode-sim-btn');
const modeMqttBtn = document.getElementById('mode-mqtt-btn');
const mqttConfigSection = document.getElementById('mqtt-config-section');
const simControlSection = document.getElementById('sim-control-section');

// Toggle between Modes
modeSimBtn.addEventListener('click', () => {
    state.mode = 'simulation';
    modeSimBtn.classList.add('active');
    modeMqttBtn.classList.remove('active');
    simControlSection.classList.remove('hidden');
    mqttConfigSection.classList.add('hidden');
    
    // Disconnect MQTT if active
    disconnectMqtt();
    
    logEvent("SYSTEM", "Dashboard", "Switched to local Simulation mode.", "info");
});

modeMqttBtn.addEventListener('click', () => {
    state.mode = 'mqtt';
    modeMqttBtn.classList.add('active');
    modeSimBtn.classList.remove('active');
    simControlSection.classList.add('hidden');
    mqttConfigSection.classList.remove('hidden');
    
    logEvent("SYSTEM", "Dashboard", "Switched to Live MQTT Mode. Awaiting client connection...", "info");
});

// MQTT Connection Handler
const mqttConnectBtn = document.getElementById('mqtt-connect-btn');
const mqttBadge = document.getElementById('mqtt-status-badge');
const mqttBadgeText = document.getElementById('mqtt-status-text');
const mqttBadgeIcon = document.getElementById('mqtt-status-icon');

mqttConnectBtn.addEventListener('click', () => {
    if (state.mqttConnected) {
        disconnectMqtt();
    } else {
        connectMqtt();
    }
});

// ---- Multi-Topic Manager Helpers ----

/**
 * Reads all topic rows from the UI and returns an array of
 * { topic: string, qos: 0|1|2, rowEl: HTMLElement } objects.
 * Empty / whitespace-only entries are skipped.
 */
function getSubscribeTopics() {
    const rows = document.querySelectorAll('#sub-topic-list .topic-row');
    const topics = [];
    rows.forEach(row => {
        const topicVal = row.querySelector('.topic-input')?.value?.trim();
        const qosVal   = parseInt(row.querySelector('.topic-qos')?.value ?? '1', 10);
        if (topicVal) {
            topics.push({ topic: topicVal, qos: qosVal, rowEl: row });
        }
    });
    return topics;
}

/**
 * Sets a visual subscription status badge on a topic row.
 * status: 'subscribed' | 'pending' | 'none'
 */
function setTopicRowStatus(rowEl, status) {
    // Remove any existing badge
    let badge = rowEl.querySelector('.topic-status-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'topic-status-badge';
        rowEl.appendChild(badge);
    }
    if (status === 'subscribed') {
        badge.className = 'topic-status-badge subscribed';
        badge.textContent = 'SUB';
        badge.style.display = 'inline-flex';
    } else if (status === 'pending') {
        badge.className = 'topic-status-badge pending';
        badge.textContent = '...';
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

/**
 * Clears subscription status badges from all topic rows.
 */
function clearAllTopicStatuses() {
    document.querySelectorAll('#sub-topic-list .topic-status-badge').forEach(b => {
        b.style.display = 'none';
    });
}

// ---- MQTT Connect / Subscribe ----

function connectMqtt() {
    const protocol = document.getElementById('mqtt-protocol').value;
    const host     = document.getElementById('mqtt-host').value;
    const port     = document.getElementById('mqtt-port').value;
    const clientId = document.getElementById('mqtt-client-id').value;
    const username = document.getElementById('mqtt-username').value;
    const password = document.getElementById('mqtt-password').value;

    // Collect all configured subscribe topics
    const topicsToSubscribe = getSubscribeTopics();
    if (topicsToSubscribe.length === 0) {
        logEvent("SYSTEM", "MQTT client", "No subscribe topics configured. Add at least one topic before connecting.", "warning");
        return;
    }

    // Build a Set for fast O(1) lookups in the message handler
    const subscribedTopicSet = new Set(topicsToSubscribe.map(t => t.topic));

    // Browser WebSockets translation mapping
    let actualProtocol = protocol;
    let actualPort     = port;

    if (protocol === 'mqtt://') {
        actualProtocol = 'ws://';
        if (port === '1883') actualPort = '8083';
        logEvent("SYSTEM", "MQTT client", `Browser redirected raw TCP (mqtt://1883) → WebSocket (ws://${host}:${actualPort}/mqtt)`, "info");
    } else if (protocol === 'mqtts://') {
        actualProtocol = 'wss://';
        if (port === '8883') actualPort = '8084';
        logEvent("SYSTEM", "MQTT client", `Browser redirected secure TCP (mqtts://8883) → Secure WebSocket (wss://${host}:${actualPort}/mqtt)`, "info");
    }

    const fullUrl = `${actualProtocol}${host}:${actualPort}/mqtt`;
    logEvent("SYSTEM", "MQTT client", `Initiating broker connection to: ${fullUrl}`, "info");

    mqttConnectBtn.innerText = "Connecting...";
    mqttBadge.className = "status-badge connecting";
    mqttBadgeText.innerText = "MQTT: CONNECTING";
    mqttBadgeIcon.setAttribute("data-lucide", "wifi");
    lucide.createIcons();

    // Mark all rows as pending
    topicsToSubscribe.forEach(t => setTopicRowStatus(t.rowEl, 'pending'));

    const options = {
        clientId,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 5000
    };
    if (username) options.username = username;
    if (password) options.password = password;

    try {
        state.mqttClient = mqtt.connect(fullUrl, options);

        state.mqttClient.on('connect', () => {
            state.mqttConnected = true;
            mqttConnectBtn.innerText = "Disconnect Broker";
            mqttConnectBtn.className = "danger-btn";
            mqttBadge.className = "status-badge";
            mqttBadgeText.innerText = "MQTT: CONNECTED";
            mqttBadgeIcon.setAttribute("data-lucide", "wifi");
            lucide.createIcons();

            logEvent("SYSTEM", "MQTT client", `Connected to MQTT Broker. Client ID: ${clientId}`, "safe");

            // Subscribe to EVERY configured topic with its own QoS
            topicsToSubscribe.forEach(({ topic, qos, rowEl }) => {
                state.mqttClient.subscribe(topic, { qos }, (err) => {
                    if (!err) {
                        setTopicRowStatus(rowEl, 'subscribed');
                        logEvent("SYSTEM", "MQTT client", `Subscribed → [QoS ${qos}] ${topic}`, "safe");
                    } else {
                        setTopicRowStatus(rowEl, 'pending');
                        logEvent("SYSTEM", "MQTT client", `Subscription failed for "${topic}": ${err.message}`, "warning");
                    }
                });
            });
        });

        // Message handler — accepts messages from ANY subscribed topic
        state.mqttClient.on('message', (topic, message) => {
            if (!subscribedTopicSet.has(topic)) return; // ignore unknown topics

            const msgStr = message.toString().trim();

            logEvent("MQTT", `[${topic}]`, `Raw message received (${msgStr.length} bytes)`, "info");

            // Handle raw text fallback states gracefully
            if (msgStr === "no detection" || msgStr === "safe" || msgStr === "normal") {
                const normalPayload = {
                    zones: {
                        zone1_server_room: { smoke_level: 0.05, temperature: 22.0, manual_call_point: false, alarm_bell: false },
                        zone2_production:  { smoke_level: 0.08, temperature: 26.5, manual_call_point: false, alarm_bell: false },
                        zone3_battery_room:{ smoke_level: 0.04, temperature: 21.5, gas_level: 12.0, manual_call_point: false, alarm_bell: false }
                    },
                    hvac_damper: "OPEN",
                    sprinklers: "STANDBY"
                };
                onTelemetryReceived(normalPayload);
                logEvent("MQTT", `[${topic}]`, "Status 'no detection' → System Normal", "safe");
                return;
            }

            if (msgStr === "alarm" || msgStr === "fire") {
                state.zones.zone1_server_room.manual_call_point = true;
                evaluateSafetySystem();
                logEvent("MQTT", `[${topic}]`, "Status 'fire'/'alarm' → Critical trigger!", "alarm");
                return;
            }

            try {
                const payload = JSON.parse(msgStr);
                onTelemetryReceived(payload);
            } catch (e) {
                console.warn(`MQTT Non-JSON message on ${topic}: ${msgStr}`);
                logEvent("MQTT", `[${topic}]`, `Non-JSON text: "${msgStr}"`, "info");
            }
        });

        state.mqttClient.on('close', () => {
            if (state.mqttConnected) {
                logEvent("SYSTEM", "MQTT client", "Connection to MQTT broker closed.", "warning");
                handleMqttDisconnectState();
            }
        });

        state.mqttClient.on('error', (err) => {
            logEvent("SYSTEM", "MQTT client", `Broker connection error: ${err.message}`, "alarm");
            handleMqttDisconnectState();
        });

    } catch (err) {
        logEvent("SYSTEM", "MQTT client", `Connection exception: ${err.message}`, "alarm");
        clearAllTopicStatuses();
        handleMqttDisconnectState();
    }
}

function disconnectMqtt() {
    if (state.mqttClient) {
        state.mqttClient.end();
        state.mqttClient = null;
    }
    handleMqttDisconnectState();
}

function handleMqttDisconnectState() {
    state.mqttConnected = false;
    mqttConnectBtn.innerText = "Connect MQTT";
    mqttConnectBtn.className = "primary-btn";
    mqttBadge.className = "status-badge disconnect";
    mqttBadgeText.innerText = "MQTT: DISCONNECTED";
    mqttBadgeIcon.setAttribute("data-lucide", "wifi-off");
    lucide.createIcons();
    clearAllTopicStatuses();
}

// ==========================================
// 7b. DYNAMIC TOPIC ROW MANAGER
// ==========================================

/**
 * Updates the disabled state of every remove button.
 * The last remaining topic row must not be removable.
 */
function updateRemoveBtnStates() {
    const rows = document.querySelectorAll('#sub-topic-list .topic-row');
    rows.forEach(row => {
        const btn = row.querySelector('.remove-topic-btn');
        if (btn) btn.disabled = (rows.length === 1);
    });
    lucide.createIcons();
}

/**
 * Binds the remove-topic button inside a newly added row.
 */
function bindRemoveTopicBtn(row) {
    const btn = row.querySelector('.remove-topic-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        const topicVal = row.querySelector('.topic-input')?.value?.trim();
        row.style.opacity = '0';
        row.style.transform = 'translateY(-6px)';
        row.style.transition = 'opacity 0.18s, transform 0.18s';
        setTimeout(() => {
            row.remove();
            updateRemoveBtnStates();
            if (topicVal) {
                logEvent("SYSTEM", "Dashboard", `Removed subscribe topic: ${topicVal}`, "info");
            }
        }, 180);
    });
}

// Wire up 'Add Topic' button
document.getElementById('add-topic-btn').addEventListener('click', () => {
    const list = document.getElementById('sub-topic-list');
    const existingRows = list.querySelectorAll('.topic-row');
    const newIndex = existingRows.length;

    const row = document.createElement('div');
    row.className = 'topic-row';
    row.dataset.topicIndex = newIndex;
    row.innerHTML = `
        <div class="topic-row-inputs">
            <input type="text" class="topic-input" placeholder="e.g. sensor/zone${newIndex + 1}/data">
            <select class="topic-qos" title="QoS Level">
                <option value="0">QoS 0</option>
                <option value="1" selected>QoS 1</option>
                <option value="2">QoS 2</option>
            </select>
        </div>
        <button type="button" class="remove-topic-btn" title="Remove topic">
            <i data-lucide="x"></i>
        </button>
    `;
    list.appendChild(row);
    bindRemoveTopicBtn(row);
    updateRemoveBtnStates();

    // Focus the new input
    row.querySelector('.topic-input')?.focus();
    logEvent("SYSTEM", "Dashboard", `Added new subscribe topic slot #${newIndex + 1}.`, "info");
});

// Wire up remove buttons on the initial pre-rendered topic rows
document.querySelectorAll('#sub-topic-list .topic-row').forEach(row => {
    bindRemoveTopicBtn(row);
});
updateRemoveBtnStates();

// Receive payload from Node-RED
function onTelemetryReceived(payload) {
    // Expected Node-RED format structure matching our architectural mapping:
    // payload: { zones: { zone1_server_room: { smoke_level, temperature, manual_call_point, alarm_bell, mos_mode }, ... } }
    if (!payload || !payload.zones) return;
    
    // Translation mapping for MQTT keys to dashboard zone keys
    const zoneMapping = {
        'zone1_server_room': 'level1',
        'zone2_production': 'level2',
        'zone3_battery_room': 'rooftop',
        'level1': 'level1',
        'level2': 'level2',
        'level3': 'level3',
        'level4': 'level4',
        'level5': 'level5',
        'rooftop': 'rooftop'
    };

    // Update dashboard state in memory
    Object.entries(payload.zones).forEach(([mqttZoneId, zoneData]) => {
        const zoneId = zoneMapping[mqttZoneId] || mqttZoneId;
        if (state.zones[zoneId]) {
            state.zones[zoneId].smoke_level = zoneData.smoke_level;
            state.zones[zoneId].temperature = zoneData.temperature;
            state.zones[zoneId].manual_call_point = zoneData.manual_call_point;
            state.zones[zoneId].alarm_bell = zoneData.alarm_bell;
            if (zoneData.mos_mode !== undefined) {
                state.zones[zoneId].mos_mode = zoneData.mos_mode;
            }
            if ((zoneId === 'rooftop') && zoneData.gas_level !== undefined) {
                state.zones.rooftop.gas_level = zoneData.gas_level;
            }
        }
    });

    if (payload.hvac_damper) state.hvac_damper = payload.hvac_damper;
    if (payload.sprinklers) state.sprinklers = payload.sprinklers;
    
    // Log active transitions if state is sent from MQTT cloud
    evaluateSafetySystem();
    updateTelemetryCharts();
}

// Publish commands to PLC
function publishCommand(commandName) {
    if (!state.mqttClient || !state.mqttConnected) return;
    const pubTopic = document.getElementById('mqtt-pub-topic').value;
    const payload = JSON.stringify({
        command: commandName,
        timestamp: Date.now()
    });
    
    state.mqttClient.publish(pubTopic, payload, { qos: 1 }, (err) => {
        if (err) {
            logEvent("SYSTEM", "MQTT client", `Failed to publish command ${commandName}: ${err.message}`, "warning");
        } else {
            logEvent("SYSTEM", "MQTT client", `Published command: ${commandName} to ${pubTopic}`, "info");
        }
    });
}

// ==========================================
// 8. HEADER AUDIO CONTROLS
// ==========================================
const muteBtn = document.getElementById('audio-mute-btn');
const muteIcon = document.getElementById('mute-icon');

muteBtn.addEventListener('click', () => {
    state.audioEnabled = !state.audioEnabled;
    
    if (state.audioEnabled) {
        muteIcon.setAttribute("data-lucide", "volume-2");
        muteBtn.style.background = "rgba(16, 185, 129, 0.15)";
        muteBtn.style.color = COLORS.safe;
        
        // Start siren immediately if alarm state active
        audioEngine.init();
        if (state.system_status === 'ALARM') {
            audioEngine.startAlarms();
        }
        logEvent("SYSTEM", "Dashboard", "Dashboard audible alarms enabled.", "info");
    } else {
        muteIcon.setAttribute("data-lucide", "volume-x");
        muteBtn.style.background = "rgba(255, 255, 255, 0.05)";
        muteBtn.style.color = "var(--text-primary)";
        audioEngine.stopAlarms();
        logEvent("SYSTEM", "Dashboard", "Dashboard audible alarms silenced by operator.", "warning");
    }
    lucide.createIcons();
});

// Initialize icons on page load
lucide.createIcons();

// Wire up MOS checkbox event listeners
document.querySelectorAll('.mos-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
        const zoneId = e.target.dataset.zone;
        const active = e.target.checked;
        state.zones[zoneId].mos_mode = active;
        
        if (active) {
            logEvent("SYSTEM", state.zones[zoneId].name, "Maintenance Override System (MOS) enabled.", "warning");
        } else {
            logEvent("SYSTEM", state.zones[zoneId].name, "Maintenance Override System (MOS) disabled.", "safe");
        }
        
        evaluateSafetySystem();
    });
});

// ==========================================
// 9. CLIENT ID GENERATOR & INTERFACE EVENTS
// ==========================================
function generateRandomClientId() {
    return 'mqttx_' + Math.random().toString(16).substr(2, 8);
}

// Populate Client ID on startup
document.getElementById('mqtt-client-id').value = generateRandomClientId();

// Regenerate Client ID button click
document.getElementById('mqtt-regenerate-id-btn').addEventListener('click', () => {
    const newId = generateRandomClientId();
    document.getElementById('mqtt-client-id').value = newId;
    logEvent("SYSTEM", "Dashboard", `Regenerated MQTT Client ID: ${newId}`, "info");
});

// SSL Toggle and Protocol/Port auto-switching logic
const sslToggle = document.getElementById('mqtt-ssl-toggle');
const protocolSelect = document.getElementById('mqtt-protocol');
const portInput = document.getElementById('mqtt-port');

sslToggle.addEventListener('change', (e) => {
    const currentProto = protocolSelect.value;
    if (e.target.checked) {
        if (currentProto === "mqtt://" || currentProto === "ws://") {
            protocolSelect.value = (currentProto === "mqtt://") ? "mqtts://" : "wss://";
            portInput.value = (currentProto === "mqtt://") ? 8883 : 8084;
        }
    } else {
        if (currentProto === "mqtts://" || currentProto === "wss://") {
            protocolSelect.value = (currentProto === "mqtts://") ? "mqtt://" : "ws://";
            portInput.value = (currentProto === "mqtts://") ? 1883 : 8083;
        }
    }
});

protocolSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === "mqtts://" || val === "wss://") {
        sslToggle.checked = true;
        portInput.value = (val === "mqtts://") ? 8883 : 8084;
    } else {
        sslToggle.checked = false;
        portInput.value = (val === "mqtt://") ? 1883 : 8083;
    }
});

// ==========================================
// 10. OPERATOR SESSION & AUTH INTEGRATION
// ==========================================

// Populate header user badge from session
(function populateUserBadge() {
    const user = FGSAuth.getCurrentUser();
    if (!user) return;

    const nameEl = document.getElementById('user-badge-name');
    const roleEl = document.getElementById('user-badge-role');

    if (nameEl) nameEl.textContent = user.username.toUpperCase();
    if (roleEl) roleEl.textContent = user.role;

    // Log session start into event log
    const loginTime = user.loginTime
        ? new Date(user.loginTime).toLocaleTimeString()
        : 'N/A';
    logEvent("SYSTEM", "Access Control",
        `Operator "${user.username}" (${user.role}) authenticated and logged in at ${loginTime}.`,
        "safe"
    );
})();

// Logout Button
document.getElementById('logout-btn').addEventListener('click', () => {
    // Stop any active alarm sounds before leaving
    audioEngine.stopAlarms();

    // Disconnect active MQTT connection cleanly
    if (state.mqttConnected && state.mqttClient) {
        state.mqttClient.end();
    }

    const user = FGSAuth.getCurrentUser();
    if (user) {
        // Brief log before redirect
        console.info(`Operator "${user.username}" logged out of FGS-PRO 3000.`);
    }

    FGSAuth.logout();
});

// ==========================================
// 11. MODBUS ADDRESS REGISTRY DATABASE
// ==========================================
const modbusRegistry = [
    // Register 40010 (Indices 3-16)
    { panel: "CLQM-AFA-7202", tag: "SD_070912", alarmTag: "SDAHH_070912", description: "L3 FDZ09 2P CAB ALARM", channel: 3, register: 40010 },
    { panel: "CLQM-AFA-7202", tag: "SD_070913", alarmTag: "SDAHH_070913", description: "L3 FDZ09 CORD ALARM", channel: 4, register: 40010 },
    { panel: "CLQM-AFA-7202", tag: "SD_070914", alarmTag: "SDAHH_070914", description: "CLQM L3 FDZ09 SD ALARM", channel: 5, register: 40010 },
    { panel: "CLQM-AFA-7202", tag: "SD_070915", alarmTag: "SDAHH_070915", description: "L3 FDZ09 2P CAB ALARM", channel: 6, register: 40010 },
    { panel: "CLQM-AFA-7202", tag: "SD_070919", alarmTag: "SDAHH_070919", description: "L3 FDZ09 2P CAB ALARM", channel: 7, register: 40010 },
    { panel: "CLQM-AFA-7202", tag: "SD_070916", alarmTag: "SDAHH_070916", description: "L3 FDZ09 S CORD ALARM", channel: 8, register: 40010 },
    { panel: "CLQM-AFA-7202", tag: "SD_070956", alarmTag: "SDAHH_070956", description: "CLQM L3 FDZ09 SD HI HI ALARM", channel: 9, register: 40010 },
    { panel: "CLQM-AFA-7202", tag: "SD_070917", alarmTag: "SDAHH_070917", description: "L3 FDZ09 2P CAB ALARM", channel: 10, register: 40010 },
    { panel: "CLQM-AFA-7202", tag: "SD_070918", alarmTag: "SDAHH_070918", description: "L3 FDZ09 4P CAB ALARM", channel: 11, register: 40010 },
    { panel: "CLQM-AFA-7202", tag: "SD_070957", alarmTag: "SDAHH_070957", description: "CLQM L3 FDZ09 SD HI HI ALARM", channel: 12, register: 40010 },
    { panel: "CLQM-AFA-7202", tag: "SD_070921", alarmTag: "SDAHH_070921", description: "L3 FDZ09 S CORD ALARM", channel: 13, register: 40010 },
    { panel: "CLQM-AFA-7202", tag: "SD_070922", alarmTag: "SDAHH_070922", description: "L3 FDZ09 S CORD ALARM", channel: 14, register: 40010 },
    { panel: "CLQM-AFA-7202", tag: "SD_070923", alarmTag: "SDAHH_070923", description: "L3 FDZ09 2P CAB ALARM", channel: 15, register: 40010 },
    { panel: "CLQM-AFA-7202", tag: "SD_070920", alarmTag: "SDAHH_070920", description: "L3 FDZ09 4P CAB ALARM", channel: 16, register: 40010 },

    // Register 40012 (Indices 1-16)
    { panel: "CLQM-AFA-7202", tag: "SD_070934", alarmTag: "SDAHH_070934", description: "L3 FDZ09 N CORD ALARM", channel: 1, register: 40012 },
    { panel: "CLQM-AFA-7202", tag: "SD_070939", alarmTag: "SDAHH_070939", description: "L3 FDZ09 N CORD ALARM", channel: 2, register: 40012 },
    { panel: "CLQM-AFA-7202", tag: "SD_070935", alarmTag: "SDAHH_070935", description: "L3 FDZ09 4P CAB ALARM", channel: 3, register: 40012 },
    { panel: "CLQM-AFA-7202", tag: "SD_070936", alarmTag: "SDAHH_070936", description: "L3 FDZ09 2P CAB ALARM", channel: 4, register: 40012 },
    { panel: "CLQM-AFA-7202", tag: "SD_070941", alarmTag: "SDAHH_070941", description: "L3 FDZ09 2P CAB ALARM", channel: 5, register: 40012 },
    { panel: "CLQM-AFA-7202", tag: "SD_070942", alarmTag: "SDAHH_070942", description: "L3 FDZ09 2P CAB ALARM", channel: 6, register: 40012 },
    { panel: "CLQM-AFA-7202", tag: "SD_070937", alarmTag: "SDAHH_070937", description: "L3 FDZ09 2P CAB ALARM", channel: 7, register: 40012 },
    { panel: "CLQM-AFA-7202", tag: "SD_070938", alarmTag: "SDAHH_070938", description: "L3 FDZ09 2P CAB ALARM", channel: 8, register: 40012 },
    { panel: "CLQM-AFA-7202", tag: "SD_070943", alarmTag: "SDAHH_070943", description: "L3 FDZ09 2P CAB ALARM", channel: 9, register: 40012 },
    { panel: "CLQM-AFA-7202", tag: "SD_070944", alarmTag: "SDAHH_070944", description: "L3 FDZ09 2P CAB ALARM", channel: 10, register: 40012 },
    { panel: "CLQM-AFA-7202", tag: "SD_070940", alarmTag: "SDAHH_070940", description: "L3 FDZ09 N CORD ALARM", channel: 11, register: 40012 },
    { panel: "CLQM-AFA-7202", tag: "SD_070952", alarmTag: "SDAHH_070952", description: "CLQM L3 FDZ09 SD HI HI ALARM", channel: 12, register: 40012 },
    { panel: "CLQM-AFA-7202", tag: "SD_070945", alarmTag: "SDAHH_070945", description: "L3 FDZ09 N CORD ALARM", channel: 13, register: 40012 },
    { panel: "CLQM-AFA-7202", tag: "SD_070946", alarmTag: "SDAHH_070946", description: "L3 FDZ09 N CORD ALARM", channel: 14, register: 40012 },
    { panel: "CLQM-AFA-7202", tag: "SD_070953", alarmTag: "SDAHH_070953", description: "CLQM L3 FDZ09 SD HI HI ALARM", channel: 15, register: 40012 },
    { panel: "CLQM-AFA-7202", tag: "SD_070947", alarmTag: "SDAHH_070947", description: "L3 FDZ09 1P CAB (OIM) ALARM", channel: 16, register: 40012 },

    // Register 40013 (Indices 1-16)
    { panel: "CLQM-AFA-7202", tag: "SD_070948", alarmTag: "SDAHH_070948", description: "L3 FDZ09 4P CAB ALARM", channel: 1, register: 40013 },
    { panel: "CLQM-AFA-7202", tag: "SD_070949", alarmTag: "SDAHH_070949", description: "L3 FDZ09 4P CAB ALARM", channel: 2, register: 40013 },
    { panel: "CLQM-AFA-7202", tag: "SD_070104", alarmTag: "SDAHH_070104", description: "L3 FDZ01 NE PIPE CHASE ALARM", channel: 3, register: 40013 },
    { panel: "CLQM-AFA-7202", tag: "SD_070103", alarmTag: "SDAHH_070103", description: "L3 FDZ01 E STAIRW ALARM", channel: 4, register: 40013 },
    { panel: "CLQM-AFA-7202", tag: "SD_070101", alarmTag: "SDAHH_070101", description: "L3 FDZ01 E STAIRW ALARM", channel: 5, register: 40013 },
    { panel: "CLQM-AFA-7202", tag: "SD_070102", alarmTag: "SDAHH_070102", description: "L3 FDZ01 E STAIRW ALARM", channel: 6, register: 40013 },
    { panel: "CLQM-AFA-7202", tag: "MAC_070901", alarmTag: "MACAHH_070901", description: "L3 FDZ09 S CORD ALARM", channel: 7, register: 40013 },
    { panel: "CLQM-AFA-7202", tag: "MAC_070902", alarmTag: "MACAHH_070902", description: "L3 FDZ09 S CORD ALARM", channel: 8, register: 40013 },
    { panel: "CLQM-AFA-7202", tag: "MAC_070903", alarmTag: "MACAHH_070903", description: "L3 FDZ09 N CORD ALARM", channel: 9, register: 40013 },
    { panel: "CLQM-AFA-7202", tag: "MAC_070904", alarmTag: "MACAHH_070904", description: "L3 FDZ09 N CORD ALARM", channel: 10, register: 40013 },
    { panel: "CLQM-AFA-7202", tag: "SD_080801", alarmTag: "SDAHH_080801", description: "L4 FDZ08 CHASE ELEC DB ALARM", channel: 11, register: 40013 },
    { panel: "CLQM-AFA-7202", tag: "SD_080802", alarmTag: "SDAHH_080802", description: "L4 FDZ08 CHASE ELEC DB ALARM", channel: 12, register: 40013 },
    { panel: "CLQM-AFA-7202", tag: "SD_080806", alarmTag: "SDAHH_080806", description: "L4 FDZ08 4P CAB ALARM", channel: 13, register: 40013 },
    { panel: "CLQM-AFA-7202", tag: "SD_080854", alarmTag: "SDAHH_080854", description: "CLQM L3 FDZ08 SD HI HI ALARM", channel: 14, register: 40013 },
    { panel: "CLQM-AFA-7202", tag: "SD_080804", alarmTag: "SDAHH_080804", description: "L4 FDZ08 S CORD ALARM", channel: 15, register: 40013 },
    { panel: "CLQM-AFA-7202", tag: "SD_080805", alarmTag: "SDAHH_080805", description: "L4 FDZ08 2P DR CAB ALARM", channel: 16, register: 40013 }
];

// Helper to determine if a floor/zone is in an alarm state
function isFloorInAlarm(floorKey) {
    const z = state.zones[floorKey];
    if (!z) return false;
    if (z.mos_mode) return false; // bypass alarms if in maintenance override mode
    
    const isSmokeTripped = z.smoke_level >= state.thresholds.smoke;
    const isTempTripped = z.temperature >= state.thresholds.tempAlarm;
    const isMcpTripped = z.manual_call_point;
    const isGasTripped = (floorKey === 'rooftop' && z.gas_level >= state.thresholds.gasAlarm);
    
    return isSmokeTripped || isTempTripped || isMcpTripped || isGasTripped;
}

// Function to render the Modbus Mapping Registry table based on filters and search queries
function renderRegistryTable() {
    const tbody = document.getElementById('registry-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    
    const searchQuery = document.getElementById('registry-search-input').value.toLowerCase().trim();
    const filterRegister = document.getElementById('registry-filter-register').value;
    const filterType = document.getElementById('registry-filter-type').value;

    const filteredData = modbusRegistry.filter(row => {
        // Register filter
        if (filterRegister !== 'all' && row.register.toString() !== filterRegister) {
            return false;
        }

        // Type filter (Smoke Detector SD vs Manual Call Point MAC)
        if (filterType !== 'all') {
            const isSD = row.tag.startsWith('SD_');
            const isMAC = row.tag.startsWith('MAC_');
            if (filterType === 'SD' && !isSD) return false;
            if (filterType === 'MAC' && !isMAC) return false;
        }

        // Search query filter
        if (searchQuery) {
            const inTag = row.tag.toLowerCase().includes(searchQuery);
            const inAlarm = row.alarmTag.toLowerCase().includes(searchQuery);
            const inDesc = row.description.toLowerCase().includes(searchQuery);
            const inReg = row.register.toString().includes(searchQuery);
            const inChan = row.channel.toString().includes(searchQuery);
            if (!inTag && !inAlarm && !inDesc && !inReg && !inChan) return false;
        }

        return true;
    });

    // Populate filtered records
    filteredData.forEach(row => {
        const tr = document.createElement('tr');
        
        // Map register description to floor key for live status monitoring
        let floorKey = null;
        if (row.description.includes('L3') || row.alarmTag.includes('_0709') || row.alarmTag.includes('_0701')) {
            floorKey = 'level3'; // Align standard loops
        } else if (row.description.includes('L4') || row.alarmTag.includes('_0808')) {
            floorKey = 'level4';
        } else if (row.description.includes('L1')) {
            floorKey = 'level1';
        } else if (row.description.includes('L2')) {
            floorKey = 'level2';
        } else if (row.description.includes('L5')) {
            floorKey = 'level5';
        } else if (row.description.includes('Rooftop') || row.description.includes('RF')) {
            floorKey = 'rooftop';
        }

        // Check live alarm state
        const isTripped = floorKey ? isFloorInAlarm(floorKey) : false;
        const statusBadge = isTripped
            ? '<span class="badge badge-status-tripped">TRIPPED</span>'
            : '<span class="badge badge-status-normal">NORMAL</span>';

        tr.innerHTML = `
            <td style="font-family: var(--font-space); font-weight: 600;">${row.register}</td>
            <td style="font-family: var(--font-space); text-align: center; font-weight: 500;">${row.channel}</td>
            <td><a href="#" class="link-tag" onclick="focusOnFloor('${floorKey}'); return false;" title="Click to view sensor zone">${row.tag}</a></td>
            <td style="font-family: var(--font-space); color: var(--text-secondary);">${row.alarmTag}</td>
            <td style="font-weight: 500;">${row.description}</td>
            <td style="text-align: center;">${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Global click-to-navigation helper for tags
window.focusOnFloor = function(floorKey) {
    navigateToPage(floorKey, true);
};

function navigateToPage(pageId, shouldLog = false) {
    if (!pageId) return;

    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageId);
    });

    document.querySelectorAll('.page-view').forEach(view => {
        view.classList.toggle('active', view.id === `page-${pageId}`);
    });

    if (LEVEL_PAGES.includes(pageId)) {
        document.getElementById('current-page-title').textContent = `${state.zones[pageId].name.toUpperCase()} — SITE LEVEL`;

        const select = document.getElementById('sim-zone-select');
        if (select) {
            select.value = pageId;
            updateSlidersFromState(pageId);
        }

        resizeLevelCanvas(pageId);

        if (shouldLog) {
            logEvent('SYSTEM', state.zones[pageId].name, `Opened dedicated level page for ${state.zones[pageId].name}.`, 'info');
        }
    } else if (pageId === 'dashboard') {
        document.getElementById('current-page-title').textContent = 'SAFETY CONTROL CENTER';
    } else if (pageId === 'registry') {
        document.getElementById('current-page-title').textContent = 'MODBUS REGISTER REGISTRY';
        renderRegistryTable();
    }
}

// Sidebar page switching event listeners
document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => {
        navigateToPage(item.dataset.page, LEVEL_PAGES.includes(item.dataset.page));
    });
});

// Event Listeners for Registry Search & Filters
document.getElementById('registry-search-input').addEventListener('input', renderRegistryTable);
document.getElementById('registry-filter-register').addEventListener('change', renderRegistryTable);
document.getElementById('registry-filter-type').addEventListener('change', renderRegistryTable);


