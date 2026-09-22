/**
 * AG-9000 Anti-Gravity LED Lighting Controller
 * Hardware Interface Driver & Telemetry Engine
 * Strict Industrial Hardware Specification
 */

(function () {
    'use strict';

    // --- System State ---
    const state = {
        masterPower: true,
        zHeight: 18.5,
        targetZHeight: 18.5,
        driveFreq: 142.8,
        dampingGain: 0.84,
        mode: 'lock', // 'lock', 'harmonic', 'kinetic', 'manual'
        strobeFreq: 0,
        luminosity: 100,
        pwmDuty: 92,
        activeDiodes: new Set([...Array(16).keys()]),
        coreTemp: 41.8,
        currentDraw: 2.84,
        fluxDensity: 1428.6,
        startTime: Date.now(),
        harmonicTime: 0,
        strobeSyncWithLevitation: false,
        bulbConnected: false
    };

    // --- DOM Elements ---
    const btnMasterPower = document.getElementById('btn-master-power');
    const labelMasterPower = document.getElementById('label-master-power');
    const relayStatus = document.getElementById('relay-status');
    const diodeMainStatus = document.getElementById('diode-main-status');
    const textBusStatus = document.getElementById('text-bus-status');

    const levitatingOrb = document.getElementById('levitating-orb');
    const visualZHeight = document.getElementById('visual-z-height');
    const sliderZHeight = document.getElementById('slider-z-height');
    const valZHeight = document.getElementById('val-z-height');

    const sliderDriveFreq = document.getElementById('slider-drive-freq');
    const valDriveFreq = document.getElementById('val-drive-freq');
    const sliderDampingGain = document.getElementById('slider-damping-gain');
    const valDampingGain = document.getElementById('val-damping-gain');

    const sliderStrobeFreq = document.getElementById('slider-strobe-freq');
    const valStrobeFreq = document.getElementById('val-strobe-freq');
    const sliderMatrixLumen = document.getElementById('slider-matrix-lumen');
    const valMatrixLumen = document.getElementById('val-matrix-lumen');
    const sliderPwmDuty = document.getElementById('slider-pwm-duty');
    const valPwmDuty = document.getElementById('val-pwm-duty');

    const matrixContainer = document.getElementById('matrix-ring-container');
    const activeDiodeCount = document.getElementById('active-diode-count');
    const btnAllDiodesOn = document.getElementById('btn-all-diodes-on');
    const btnAllDiodesOff = document.getElementById('btn-all-diodes-off');
    const btnStrobeSync = document.getElementById('btn-strobe-sync');

    const teleFluxDensity = document.getElementById('tele-flux-density');
    const teleGapHeight = document.getElementById('tele-gap-height');
    const teleCurrentDraw = document.getElementById('tele-current-draw');
    const teleCoilTemp = document.getElementById('tele-coil-temp');
    const teleFluxRms = document.getElementById('tele-flux-rms');
    const diagCoreTemp = document.getElementById('diag-core-temp');
    const systemUptime = document.getElementById('system-uptime');
    const logStream = document.getElementById('log-stream');
    const canvas = document.getElementById('oscilloscope-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;

    // --- Initialize Lucide Icons ---
    function initIcons() {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    // --- Logging Helper ---
    function logEvent(message, isAlert = false) {
        if (!logStream) return;
        const now = new Date();
        const timeStr = `[${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}]`;
        const entry = document.createElement('div');
        entry.className = `log-entry${isAlert ? ' alert' : ''}`;
        entry.innerHTML = `<span class="log-time">${timeStr}</span><span class="log-msg">${message}</span>`;
        logStream.appendChild(entry);
        logStream.scrollTop = logStream.scrollHeight;

        // Keep maximum 40 log lines
        while (logStream.children.length > 40) {
            logStream.removeChild(logStream.firstChild);
        }
    }

    // --- 16-Diode RGB Matrix Array Ring ---
    function setupMatrixRing() {
        if (!matrixContainer) return;

        // Center: 110px, 110px; Radius: 82px
        const centerX = 110;
        const centerY = 110;
        const radius = 80;
        const totalDiodes = 16;

        for (let i = 0; i < totalDiodes; i++) {
            const angle = (2 * Math.PI * i) / totalDiodes - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle) - 6; // 12px width/2 = 6
            const y = centerY + radius * Math.sin(angle) - 6;

            const diode = document.createElement('div');
            diode.className = 'diode-node lit';
            diode.id = `diode-${i}`;
            diode.style.left = `${x}px`;
            diode.style.top = `${y}px`;
            diode.title = `Diode Channel ${i + 1} [Addr 0x${(0x50 + i).toString(16).toUpperCase()}]`;

            diode.addEventListener('click', () => {
                if (state.activeDiodes.has(i)) {
                    state.activeDiodes.delete(i);
                    diode.classList.remove('lit');
                    logEvent(`OPTICAL CH ${i + 1} DISABLED`);
                } else {
                    state.activeDiodes.add(i);
                    diode.classList.add('lit');
                    logEvent(`OPTICAL CH ${i + 1} ENABLED`);
                }
                updateDiodeMetrics();
            });

            matrixContainer.appendChild(diode);
        }

        updateDiodeMetrics();
    }

    function updateDiodeMetrics() {
        if (activeDiodeCount) {
            activeDiodeCount.textContent = `${state.activeDiodes.size} / 16`;
        }
    }

    // --- Master Power Isolation Switch ---
    function setupMasterPower() {
        if (!btnMasterPower) return;

        btnMasterPower.addEventListener('click', () => {
            state.masterPower = !state.masterPower;

            if (state.masterPower) {
                btnMasterPower.classList.add('powered-on');
                labelMasterPower.textContent = 'EMITTER BUS ONLINE';
                relayStatus.textContent = 'ENGAGED';
                relayStatus.className = 'diag-value highlight';
                diodeMainStatus.className = 'diode active';
                textBusStatus.textContent = 'BUS ACTIVE';
                logEvent('MASTER POWER ISOLATION RELAY CLOSED - 48V APPLIED', true);
            } else {
                btnMasterPower.classList.remove('powered-on');
                labelMasterPower.textContent = 'EMITTER BUS ISOLATED';
                relayStatus.textContent = 'OPEN (SAFE)';
                relayStatus.className = 'diag-value';
                diodeMainStatus.className = 'diode';
                textBusStatus.textContent = 'BUS ISOLATED';
                logEvent('SAFETY INTERLOCK: EMITTER BUS CUT OFF', true);
            }
        });
    }

    // --- Levitation Chamber Height Updates ---
    function updateLevitationDisplay() {
        if (!levitatingOrb) return;

        let displayHeight = state.zHeight;

        if (!state.masterPower) {
            displayHeight = 0; // collapsed to coil base
        }

        // Visual mapping: 0 mm = 8%, 35 mm = 80% bottom position
        const bottomPercent = state.masterPower 
            ? Math.max(12, Math.min(80, 12 + ((displayHeight - 5) / 30) * 68))
            : 6;

        levitatingOrb.style.bottom = `${bottomPercent}%`;

        if (visualZHeight) {
            visualZHeight.textContent = state.masterPower ? `+${displayHeight.toFixed(1)}` : '0.0';
        }
        if (teleGapHeight) {
            teleGapHeight.innerHTML = `${displayHeight.toFixed(2)}<span class="metric-box-unit">mm</span>`;
        }
    }

    // --- Spatial Controls Setup ---
    function setupSpatialControls() {
        if (sliderZHeight) {
            sliderZHeight.addEventListener('input', (e) => {
                state.targetZHeight = parseFloat(e.target.value);
                state.zHeight = state.targetZHeight;
                valZHeight.textContent = `${state.zHeight.toFixed(1)} mm`;
                updateLevitationDisplay();
            });
        }

        if (sliderDriveFreq) {
            sliderDriveFreq.addEventListener('input', (e) => {
                state.driveFreq = parseFloat(e.target.value);
                valDriveFreq.textContent = `${state.driveFreq.toFixed(1)} Hz`;
                const clockHeader = document.getElementById('header-clock-display');
                if (clockHeader) clockHeader.textContent = `${state.driveFreq.toFixed(2)} HZ`;
            });
        }

        if (sliderDampingGain) {
            sliderDampingGain.addEventListener('input', (e) => {
                state.dampingGain = parseFloat(e.target.value);
                valDampingGain.textContent = state.dampingGain.toFixed(2);
            });
        }

        // Operating Mode Buttons
        const modeButtons = document.querySelectorAll('.mode-btn');
        modeButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                modeButtons.forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                state.mode = btn.getAttribute('data-mode');
                logEvent(`LEVITATION OPERATING MODE SET TO: ${state.mode.toUpperCase()}`);
            });
        });
    }

    // --- RGB Matrix Controls Setup ---
    function setupMatrixControls() {
        if (sliderStrobeFreq) {
            sliderStrobeFreq.addEventListener('input', (e) => {
                state.strobeFreq = parseInt(e.target.value, 10);
                valStrobeFreq.textContent = state.strobeFreq === 0 ? '0.0 Hz (Solid)' : `${state.strobeFreq} Hz`;
            });
        }

        if (sliderMatrixLumen) {
            sliderMatrixLumen.addEventListener('input', (e) => {
                state.luminosity = parseInt(e.target.value, 10);
                valMatrixLumen.textContent = `${state.luminosity}%`;
                matrixContainer.style.filter = `brightness(${0.2 + (state.luminosity / 100) * 0.8})`;
            });
        }

        if (sliderPwmDuty) {
            sliderPwmDuty.addEventListener('input', (e) => {
                state.pwmDuty = parseInt(e.target.value, 10);
                valPwmDuty.textContent = `${state.pwmDuty}%`;
            });
        }

        if (btnAllDiodesOn) {
            btnAllDiodesOn.addEventListener('click', () => {
                for (let i = 0; i < 16; i++) {
                    state.activeDiodes.add(i);
                    const el = document.getElementById(`diode-${i}`);
                    if (el) el.classList.add('lit');
                }
                updateDiodeMetrics();
                logEvent('ALL 16 OPTICAL DIODES ENERGIZED');
            });
        }

        if (btnAllDiodesOff) {
            btnAllDiodesOff.addEventListener('click', () => {
                state.activeDiodes.clear();
                for (let i = 0; i < 16; i++) {
                    const el = document.getElementById(`diode-${i}`);
                    if (el) el.classList.remove('lit');
                }
                updateDiodeMetrics();
                logEvent('OPTICAL ARRAY BLACKOUT ENGAGED');
            });
        }

        if (btnStrobeSync) {
            btnStrobeSync.addEventListener('click', () => {
                state.strobeSyncWithLevitation = !state.strobeSyncWithLevitation;
                if (state.strobeSyncWithLevitation) {
                    btnStrobeSync.classList.add('primary');
                    logEvent('STROBE FREQ PHASE-LOCKED TO COIL RESONANCE');
                } else {
                    btnStrobeSync.classList.remove('primary');
                    logEvent('STROBE INDEPENDENT CLOCK RESUMED');
                }
            });
        }
    }

    // --- Calibration Procedures ---
    function setupCalibrationProcedures() {
        const btnCalLev = document.getElementById('btn-cal-lev');
        const btnZeroBias = document.getElementById('btn-zero-bias');
        const btnFluxPurge = document.getElementById('btn-flux-purge');

        if (btnCalLev) {
            btnCalLev.addEventListener('click', () => {
                btnCalLev.disabled = true;
                logEvent('INITIATING Z-AXIS SERVO CALIBRATION SWEEP...', true);
                let step = 0;
                const calInterval = setInterval(() => {
                    step++;
                    if (step === 1) {
                        state.zHeight = 8.0;
                        updateLevitationDisplay();
                    } else if (step === 2) {
                        state.zHeight = 28.0;
                        updateLevitationDisplay();
                    } else if (step === 3) {
                        state.zHeight = state.targetZHeight;
                        updateLevitationDisplay();
                    } else {
                        clearInterval(calInterval);
                        btnCalLev.disabled = false;
                        logEvent('CALIBRATION COMPLETED: PID LOOP CONVERGED AT 142.8 HZ');
                    }
                }, 350);
            });
        }

        if (btnZeroBias) {
            btnZeroBias.addEventListener('click', () => {
                logEvent('HALL SENSOR DC BIAS ZEROED: OFFSET = -0.0002 G');
            });
        }

        if (btnFluxPurge) {
            btnFluxPurge.addEventListener('click', () => {
                logEvent('DISCHARGING DEGAUSSING CYCLE TO CORE...');
                setTimeout(() => {
                    logEvent('RESIDUAL FLUX PURGE COMPLETE: CORE HYSTERESIS NORMALIZED');
                }, 600);
            });
        }
    }

    // --- Oscilloscope Waveform Renderer ---
    let phase = 0;
    function renderOscilloscope() {
        if (!ctx || !canvas) return;

        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = '#0f0f0f';
        ctx.fillRect(0, 0, w, h);

        // Draw sub-grid lines
        ctx.strokeStyle = '#1e1e1e';
        ctx.lineWidth = 1;

        for (let x = 0; x < w; x += 30) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += 30) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Center line
        ctx.strokeStyle = '#2a2a2a';
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        if (state.masterPower) {
            ctx.strokeStyle = '#ff9e00'; // Strict Harsh Amber trace
            ctx.lineWidth = 1.75;
            ctx.beginPath();

            phase += 0.08;
            const noise = (Math.random() - 0.5) * 4;

            for (let x = 0; x < w; x++) {
                const normalizedX = x / w;
                let y = h / 2;

                if (state.mode === 'harmonic') {
                    y += Math.sin(normalizedX * 16 + phase) * 28 + Math.cos(normalizedX * 6 + phase * 0.5) * 8 + noise;
                } else if (state.mode === 'kinetic') {
                    y += Math.sin(normalizedX * 24 + phase * 2) * (Math.sin(phase * 0.4) * 32) + noise;
                } else {
                    // Standard Zero-G Lock
                    y += Math.sin(normalizedX * 20 + phase) * 16 + Math.sin(normalizedX * 40 - phase * 1.5) * 4 + noise;
                }

                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        } else {
            // Flatline when unpowered
            ctx.strokeStyle = '#383838';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, h / 2);
            ctx.lineTo(w, h / 2);
            ctx.stroke();
        }

        requestAnimationFrame(renderOscilloscope);
    }

    // --- Dynamic Real-Time Hardware Engine Loop ---
    function startTelemetryEngine() {
        setInterval(() => {
            // Calculate uptime
            const elapsed = Date.now() - state.startTime;
            const hours = String(Math.floor(elapsed / 3600000)).padStart(2, '0');
            const mins = String(Math.floor((elapsed % 3600000) / 60000)).padStart(2, '0');
            const secs = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
            const tenths = Math.floor((elapsed % 1000) / 100);
            if (systemUptime) systemUptime.textContent = `${hours}:${mins}:${secs}.${tenths}`;

            if (state.masterPower) {
                // Harmonic motion mode handling
                if (state.mode === 'harmonic') {
                    state.harmonicTime += 0.05;
                    state.zHeight = state.targetZHeight + Math.sin(state.harmonicTime) * 3.5;
                    updateLevitationDisplay();
                } else if (state.mode === 'kinetic') {
                    state.harmonicTime += 0.12;
                    state.zHeight = state.targetZHeight + (Math.random() - 0.5) * 1.2;
                    updateLevitationDisplay();
                }

                // Realistic small telemetry variations
                const jitter = (Math.random() - 0.5) * 0.8;
                state.fluxDensity = 1420 + (state.zHeight * 0.5) + jitter * 4;
                state.currentDraw = 2.80 + (state.zHeight * 0.003) + (Math.random() - 0.5) * 0.04;
                state.coreTemp = 41.6 + (Math.random() - 0.5) * 0.3;

                if (teleFluxDensity) teleFluxDensity.innerHTML = `${state.fluxDensity.toFixed(1)}<span class="metric-box-unit">G</span>`;
                if (teleCurrentDraw) teleCurrentDraw.innerHTML = `${state.currentDraw.toFixed(2)}<span class="metric-box-unit">A</span>`;
                if (teleCoilTemp) teleCoilTemp.innerHTML = `${state.coreTemp.toFixed(1)}<span class="metric-box-unit">°C</span>`;
                if (diagCoreTemp) diagCoreTemp.textContent = `${state.coreTemp.toFixed(1)} °C`;
                if (teleFluxRms) teleFluxRms.textContent = `RMS ${(0.0030 + Math.random() * 0.0008).toFixed(4)}`;
            } else {
                if (teleFluxDensity) teleFluxDensity.innerHTML = `0.0<span class="metric-box-unit">G</span>`;
                if (teleCurrentDraw) teleCurrentDraw.innerHTML = `0.04<span class="metric-box-unit">A</span>`;
                if (teleFluxRms) teleFluxRms.textContent = `RMS 0.0000`;
            }
        }, 100);
    }

    // --- Device Selection Interaction ---
    function setupDeviceSelection() {
        const deviceItems = document.querySelectorAll('.device-item');
        deviceItems.forEach((item) => {
            item.addEventListener('click', () => {
                deviceItems.forEach((d) => d.classList.remove('active'));
                item.classList.add('active');
                const devName = item.querySelector('.device-name').textContent;
                logEvent(`ACTIVE TELEMETRY BUS SWITCHED TO: ${devName.toUpperCase()}`);
            });
        });
    }

    // --- Connect to Backend Bridge (if Server is Running) ---
    function initBackendBridge() {
        try {
            const host = window.location.host || '127.0.0.1:8090';
            const ws = new WebSocket(`ws://${host}/ws`);

            ws.onopen = () => {
                logEvent('TCP/WS HARDWARE DAEMON CONNECTED (PORT 8090)', true);
                const diodeBulb = document.getElementById('diode-bulb-bridge');
                if (diodeBulb) diodeBulb.classList.add('active');
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'bulb_status') {
                        state.bulbConnected = data.connected;
                        const diodeBulb = document.getElementById('diode-bulb-bridge');
                        if (diodeBulb) {
                            if (data.connected) diodeBulb.classList.add('active');
                            else diodeBulb.classList.remove('active');
                        }
                    }
                } catch (e) {
                    // non-json ws frame
                }
            };

            ws.onerror = () => {
                // Standalone mode - operating with local hardware telemetry simulation
            };
        } catch (e) {
            // Running without backend server
        }
    }

    // --- Main Initializer ---
    window.addEventListener('DOMContentLoaded', () => {
        initIcons();
        setupMatrixRing();
        setupMasterPower();
        setupSpatialControls();
        setupMatrixControls();
        setupCalibrationProcedures();
        setupDeviceSelection();
        updateLevitationDisplay();
        renderOscilloscope();
        startTelemetryEngine();
        initBackendBridge();
        logEvent('AG-9000 SYSTEM OPERATING IN NORMAL SPECIFICATION');
    });

})();
