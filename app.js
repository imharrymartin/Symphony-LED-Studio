// Standard Hardware Color Palette (13 default essential colors)
const STANDARD_PALETTE = [
    { name: "Crimson Red", hex: "#ff0000", rgb: { r: 255, g: 0, b: 0 } },
    { name: "Neon Orange", hex: "#ff6600", rgb: { r: 255, g: 102, b: 0 } },
    { name: "Harsh Amber", hex: "#ff9e00", rgb: { r: 255, g: 158, b: 0 } },
    { name: "Laser Yellow", hex: "#ffff00", rgb: { r: 255, g: 255, b: 0 } },
    { name: "Acid Lime", hex: "#88ff00", rgb: { r: 136, g: 255, b: 0 } },
    { name: "Matrix Green", hex: "#00ff44", rgb: { r: 0, g: 255, b: 68 } },
    { name: "High-Vis Cyan", hex: "#00f0ff", rgb: { r: 0, g: 240, b: 255 } },
    { name: "Deep Cobalt", hex: "#0044ff", rgb: { r: 0, g: 68, b: 255 } },
    { name: "Ultraviolet", hex: "#8800ff", rgb: { r: 136, g: 0, b: 255 } },
    { name: "Cyber Magenta", hex: "#ff00bb", rgb: { r: 255, g: 0, b: 187 } },
    { name: "Neon Pink", hex: "#ff3388", rgb: { r: 255, g: 51, b: 136 } },
    { name: "Pure White", hex: "#ffffff", rgb: { r: 255, g: 255, b: 255 } },
    { name: "Warm White", hex: "#ffe4b5", rgb: { r: 255, g: 228, b: 181 } }
];

// Hardware Toast Notification System (Zero default white browser popups)
function showToast(title, message, isAlert = false, duration = 3500) {
    const container = document.getElementById('hw-toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `hw-toast${isAlert ? ' alert' : ''}`;
    toast.innerHTML = `
        <i data-lucide="${isAlert ? 'alert-triangle' : 'info'}" class="hw-toast-icon"></i>
        <div class="hw-toast-body">
            <span class="hw-toast-title">${title}</span>
            <span class="hw-toast-msg">${message}</span>
        </div>
        <button class="hw-toast-close" title="Dismiss"><i data-lucide="x"></i></button>
    `;
    const closeBtn = toast.querySelector('.hw-toast-close');
    const removeToast = () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 200);
    };
    closeBtn.addEventListener('click', removeToast);
    container.appendChild(toast);
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: toast });
    }
    setTimeout(removeToast, duration);
}

function showHardwareModal(title, message, onConfirm = null) {
    const overlay = document.getElementById('hw-modal-overlay');
    const titleEl = document.getElementById('hw-modal-title');
    const msgEl = document.getElementById('hw-modal-message');
    const closeBtn = document.getElementById('hw-modal-close');
    const confirmBtn = document.getElementById('hw-modal-confirm');
    if (!overlay || !titleEl || !msgEl) {
        showToast(title, message, true);
        return;
    }
    titleEl.textContent = title;
    msgEl.textContent = message;
    overlay.style.display = 'flex';
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: overlay });
    }

    const closeModal = () => {
        overlay.style.display = 'none';
        if (onConfirm) onConfirm();
    };
    closeBtn.onclick = closeModal;
    confirmBtn.onclick = closeModal;
}

// Override window.alert so no default white popups ever appear
window.alert = function (message) {
    showToast('Hardware Notice', String(message), true);
};

// State
let config = { colors: [], sequences: [] };

// Elements
const sysStatus = document.getElementById('system-status');
const tabs = document.querySelectorAll('.tab-btn');
const views = document.querySelectorAll('.view');
const quickColor = document.getElementById('quick-color');
const audioDeviceSelect = document.getElementById('audio-device-select');

const BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:8090' : '';

function seedStandardColors(notify = true) {
    let addedCount = 0;
    if (!config.colors) config.colors = [];
    STANDARD_PALETTE.forEach(c => {
        const exists = config.colors.some(existing => existing.hex.toLowerCase() === c.hex.toLowerCase());
        if (!exists) {
            config.colors.push({
                id: 'c_std_' + c.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                name: c.name,
                hex: c.hex,
                rgb: { ...c.rgb },
                hotkey: ''
            });
            addedCount++;
        }
    });
    if (addedCount > 0) {
        saveConfig();
        renderLists();
        if (notify) showToast('Palette Loaded', `Added ${addedCount} standard color presets to registry.`);
    } else if (notify) {
        showToast('Palette Current', 'Standard color palette is already registered.');
    }
}

function initStandardSwatches() {
    const testContainer = document.getElementById('quick-swatches-test');
    const presetContainer = document.getElementById('quick-swatches-preset');

    if (testContainer) {
        testContainer.innerHTML = STANDARD_PALETTE.map(c => `
            <div class="swatch-btn" data-hex="${c.hex}" data-name="${c.name}" style="background-color: ${c.hex};" title="Test ${c.name} (${c.hex})"></div>
        `).join('');

        testContainer.querySelectorAll('.swatch-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                testContainer.querySelectorAll('.swatch-btn').forEach(b => b.classList.remove('active-swatch'));
                btn.classList.add('active-swatch');
                const hex = btn.getAttribute('data-hex');
                const name = btn.getAttribute('data-name');
                if (quickColor) quickColor.value = hex;
                const rgb = hexToRgb(hex);
                testColor(rgb);
                showToast('Hardware Diode Output', `Outputting ${name} (${hex}) to bulb array.`);
            });
        });
    }

    if (presetContainer) {
        presetContainer.innerHTML = STANDARD_PALETTE.map(c => `
            <div class="swatch-btn" data-hex="${c.hex}" data-name="${c.name}" style="background-color: ${c.hex};" title="Select ${c.name}"></div>
        `).join('');

        presetContainer.querySelectorAll('.swatch-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const hex = btn.getAttribute('data-hex');
                const name = btn.getAttribute('data-name');
                const nameInput = document.getElementById('color-name');
                const hexInput = document.getElementById('color-hex');
                if (nameInput) nameInput.value = name;
                if (hexInput) hexInput.value = hex;
            });
        });
    }

    const btnSeed = document.getElementById('btn-seed-standard-colors');
    if (btnSeed) {
        btnSeed.addEventListener('click', () => seedStandardColors(true));
    }
}

async function fetchConfig() {
    try {
        const res = await fetch(`${BASE_URL}/api/config`);
        config = await res.json();

        // Automatically seed standard colors if user has none
        if (!config.colors || config.colors.length === 0) {
            seedStandardColors(false);
        }

        sysStatus.innerText = 'Server: Online';
        sysStatus.style.color = '#00ff88';

        const bStatus = document.getElementById('bulb-status');
        const retryBtn = document.getElementById('btn-bulb-retry');
        if (config.bulb_status === 'Connected') {
            bStatus.innerText = `Bulb: Linked (${config.bulb_ip})`;
            bStatus.style.color = '#00ff88';
            if (retryBtn) retryBtn.style.display = 'none';
        } else {
            bStatus.innerText = 'Bulb: Offline';
            bStatus.style.color = '#ff9900';
            if (retryBtn) retryBtn.style.display = 'inline-block';
        }

        renderLists();
    } catch (e) {
        sysStatus.innerText = 'Server: Offline';
        sysStatus.style.color = '#ff3366';
        document.getElementById('bulb-status').innerText = 'Bulb: Unknown';
    }
}

async function retryBulbConnect() {
    const btn = document.getElementById('btn-bulb-retry');
    const bStatus = document.getElementById('bulb-status');
    if (btn) { btn.disabled = true; btn.innerText = 'Connecting...'; }
    bStatus.innerText = 'Bulb: Scanning...';
    bStatus.style.color = '#ff9900';
    try {
        await fetch(`${BASE_URL}/api/reconnect_bulb`, { method: 'POST' });
        // Poll for up to 12s to see if it connects
        for (let i = 0; i < 4; i++) {
            await new Promise(r => setTimeout(r, 3000));
            await fetchConfig();
            if (config.bulb_status === 'Connected') break;
        }
    } catch (e) { console.error('Retry failed', e); }
    if (btn) { btn.disabled = false; btn.innerText = 'Retry Link'; }
}

async function fetchAudioDevices(retryCount = 0) {
    try {
        const res = await fetch(`${BASE_URL}/api/audio_devices`);
        const devices = await res.json();

        if ((!devices || devices.length === 0) && retryCount < 3) {
            console.log("No devices yet, retrying in 1s...");
            setTimeout(() => fetchAudioDevices(retryCount + 1), 1000);
            return;
        }

        const loops = devices.filter(d => d.isloopback);
        const mics = devices.filter(d => !d.isloopback);

        let html = '<optgroup label="Desktop / Game Audio">';
        html += loops.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        if (loops.length === 0) html += '<option disabled>Checking for loopback drivers...</option>';
        html += '</optgroup><optgroup label="Physical Microphones">';
        html += mics.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        if (mics.length === 0) html += '<option disabled>No microphones found</option>';
        html += '</optgroup>';

        audioDeviceSelect.innerHTML = html;
        const sSelect = document.getElementById('screen-audio-device-select');
        if (sSelect) sSelect.innerHTML = html;

        console.log(`Loaded ${devices.length} audio devices.`);
    } catch (e) {
        console.error("Failed to fetch audio devices", e);
    }
}

async function saveConfig() {
    try {
        await fetch(`${BASE_URL}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        renderLists();
    } catch (e) {
        console.error('Failed to save', e);
    }
}

async function testColor(rgb) {
    fetch(`${BASE_URL}/api/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_color', r: rgb.r, g: rgb.g, b: rgb.b })
    }).catch(e => { });
}

window.playSequence = async function (id) {
    fetch(`${BASE_URL}/api/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sequence', id: id })
    }).catch(e => { });
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    views.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('view-' + t.dataset.target).classList.add('active');

    if (t.dataset.target === 'arrange') {
        document.querySelector('.app-container').classList.add('wide');
        fetch(`${BASE_URL}/api/hotkey_state`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'pause' }) }).catch(e => { });
        if (renderAutomation) setTimeout(renderAutomation, 50); // initial render
    } else {
        document.querySelector('.app-container').classList.remove('wide');
        fetch(`${BASE_URL}/api/hotkey_state`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'resume' }) }).catch(e => { });
    }

    // Refresh Spotify state immediately when switching to Music Sync tab
    if (t.dataset.target === 'music') {
        fetch(`${BASE_URL}/api/spotify/state`).then(r => r.json()).then(data => {
            if (data.status === 'success') updateBeatTrackLabel(data.state);
        }).catch(() => {});
    }
}));

let automationMode = false;
document.getElementById('arrange-auto-toggle').addEventListener('change', e => {
    automationMode = e.target.checked;
    if (automationMode) document.querySelector('.arranger-layout').classList.add('automation-mode');
    else document.querySelector('.arranger-layout').classList.remove('automation-mode');
    renderAutomation();
});

document.getElementById('btn-on').addEventListener('click', () => fetch(`${BASE_URL}/api/action`, { method: 'POST', body: JSON.stringify({ action: 'on' }) }));
document.getElementById('btn-off').addEventListener('click', () => fetch(`${BASE_URL}/api/action`, { method: 'POST', body: JSON.stringify({ action: 'off' }) }));

let debounce;
quickColor.addEventListener('input', (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
        const rgb = hexToRgb(e.target.value);
        if (rgb) testColor(rgb);
    }, 50);
});

const btnAudioStart = document.getElementById('btn-audio-start');
const btnAudioStop = document.getElementById('btn-audio-stop');
const audioPreset = document.getElementById('audio-preset');
const audioSelect = document.getElementById('audio-color-select');
const audioSlider = document.getElementById('audio-sensitivity');

function updateAudioSync() {
    if (btnAudioStart.style.display === 'none') {
        fetch(`${BASE_URL}/api/audio_sync`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update',
                color_id: audioSelect.value,
                sensitivity: parseFloat(audioSlider.value) / 10.0,
                preset: audioPreset.value,
                device_id: audioDeviceSelect.value
            })
        });
    }
}

btnAudioStart.addEventListener('click', () => {
    if (!config.colors || config.colors.length === 0) {
        showToast('Registry Empty', 'No colors available. Click "Load Standard Color Palette" or add a color preset.', true);
        return;
    }
    fetch(`${BASE_URL}/api/audio_sync`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'start',
            color_id: audioSelect.value,
            sensitivity: parseFloat(audioSlider.value) / 10.0,
            preset: audioPreset.value,
            device_id: audioDeviceSelect.value
        })
    });
    btnAudioStart.style.display = 'none';
    btnAudioStop.style.display = 'inline-block';
});
btnAudioStop.addEventListener('click', () => {
    fetch(`${BASE_URL}/api/audio_sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) });
    btnAudioStop.style.display = 'none';
    btnAudioStart.style.display = 'inline-block';
});
audioPreset.addEventListener('change', updateAudioSync);
audioSelect.addEventListener('change', updateAudioSync);
audioSlider.addEventListener('input', updateAudioSync);
audioDeviceSelect.addEventListener('change', () => {
    // Automatically restart audio capturing with the new device if playing
    if (btnAudioStart.style.display === 'none') {
        btnAudioStop.click();
        setTimeout(() => btnAudioStart.click(), 500);
    }
});
document.getElementById('btn-scan-devices').addEventListener('click', () => {
    const btn = document.getElementById('btn-scan-devices');
    btn.innerText = '...';
    fetchAudioDevices().then(() => {
        setTimeout(() => btn.innerHTML = '<i data-lucide="refresh-cw"></i>', 500);
        if (window.lucide) setTimeout(() => lucide.createIcons(), 550);
    });
});

const btnScreenStart = document.getElementById('btn-screen-start');
const btnScreenStop = document.getElementById('btn-screen-stop');
const screenCombineAudio = document.getElementById('screen-audio-combine');
const screenScaleBrightness = document.getElementById('screen-scale-brightness');
const screenAudioDeviceSelect = document.getElementById('screen-audio-device-select');
const screenSlider = document.getElementById('screen-sensitivity');
const screenMinBrightSlider = document.getElementById('screen-min-brightness');
const screenMinBrightWrap = document.getElementById('min-brightness-wrap');
const screenMinBrightVal = document.getElementById('min-brightness-val');

// Show/hide min brightness section based on audio combine toggle
screenCombineAudio.addEventListener('change', () => {
    screenMinBrightWrap.style.display = screenCombineAudio.checked ? 'block' : 'none';
    updateScreenSync();
});
screenScaleBrightness.addEventListener('change', updateScreenSync);
screenMinBrightSlider.addEventListener('input', () => {
    screenMinBrightVal.innerText = screenMinBrightSlider.value + '%';
    updateScreenSync();
});

function getMinBrightness() {
    // Convert 0-100% slider to 0.0-1.0 multiplier
    return parseFloat(screenMinBrightSlider.value) / 100.0;
}

function updateScreenSync() {
    if (btnScreenStart.style.display === 'none') {
        fetch(`${BASE_URL}/api/screen_sync`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update',
                combine_audio: screenCombineAudio.checked,
                scale_brightness: screenScaleBrightness.checked,
                sensitivity: parseFloat(screenSlider.value) / 10.0,
                device_id: screenAudioDeviceSelect.value,
                min_brightness: getMinBrightness()
            })
        });
    }
}

btnScreenStart.addEventListener('click', () => {
    fetch(`${BASE_URL}/api/screen_sync`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'start',
            combine_audio: screenCombineAudio.checked,
            scale_brightness: screenScaleBrightness.checked,
            sensitivity: parseFloat(screenSlider.value) / 10.0,
            device_id: screenAudioDeviceSelect.value,
            min_brightness: getMinBrightness()
        })
    });
    btnScreenStart.style.display = 'none';
    btnScreenStop.style.display = 'inline-block';

    if (btnAudioStart.style.display === 'none') btnAudioStop.click();
});

btnScreenStop.addEventListener('click', () => {
    fetch(`${BASE_URL}/api/screen_sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) });
    btnScreenStop.style.display = 'none';
    btnScreenStart.style.display = 'inline-block';
});

screenCombineAudio.addEventListener('change', updateScreenSync);
screenSlider.addEventListener('input', updateScreenSync);
screenAudioDeviceSelect.addEventListener('change', () => {
    if (btnScreenStart.style.display === 'none') {
        btnScreenStop.click();
        setTimeout(() => btnScreenStart.click(), 500);
    }
});

btnAudioStart.addEventListener('click', () => {
    if (btnScreenStart.style.display === 'none') btnScreenStop.click();
});

function setupHotkeyRecorder(inputId) {
    const el = document.getElementById(inputId);
    el.addEventListener('focus', () => {
        el.value = '';
        el.classList.add('recording');
        el.placeholder = 'Press A Key combination...';
    });
    el.addEventListener('blur', () => {
        el.classList.remove('recording');
        if (!el.value) el.placeholder = 'Click here & press a key';
    });
    el.addEventListener('keydown', (e) => {
        e.preventDefault();
        const keys = [];
        if (e.ctrlKey) keys.push('ctrl');
        if (e.shiftKey) keys.push('shift');
        if (e.altKey) keys.push('alt');

        let key = e.key.toLowerCase();
        if (['control', 'shift', 'alt', 'meta'].includes(key)) return;
        if (key === ' ') key = 'space';

        keys.push(key);
        el.value = keys.join('+');
        el.blur();
    });
}
setupHotkeyRecorder('color-hotkey');
setupHotkeyRecorder('seq-hotkey');

function isHotkeyUsed(hk) {
    if (!hk) return false;
    for (let c of config.colors) if (c.hotkey === hk) return true;
    for (let s of config.sequences) if (s.hotkey === hk) return true;
    return false;
}

window.clearColorHotkey = function (index, e) {
    if (e) e.stopPropagation();
    config.colors[index].hotkey = '';
    saveConfig();
}
window.clearSeqHotkey = function (index, e) {
    if (e) e.stopPropagation();
    config.sequences[index].hotkey = '';
    saveConfig();
}

document.getElementById('btn-save-color').addEventListener('click', () => {
    const err = document.getElementById('color-error');
    err.innerText = '';
    const name = document.getElementById('color-name').value.trim() || 'Untitled Color';
    const hex = document.getElementById('color-hex').value;
    const hk = document.getElementById('color-hotkey').value;
    const rgb = hexToRgb(hex);

    if (isHotkeyUsed(hk)) {
        showToast('Hotkey Conflict', `Hotkey "${hk}" is already mapped to another action!`, true);
        return err.innerText = `Error: Hotkey "${hk}" is already in use by another action!`;
    }

    const newColor = { id: 'c_' + Date.now(), name: name, hex: hex, rgb: rgb, hotkey: hk };
    config.colors.push(newColor);
    saveConfig();
    showToast('Color Registered', `Added preset "${newColor.name}" (${newColor.hex}) to palette.`);

    document.getElementById('color-name').value = '';
    document.getElementById('color-hotkey').value = '';
});

const stepsContainer = document.getElementById('seq-steps-container');
document.getElementById('btn-add-step').addEventListener('click', () => {
    if (config.colors.length === 0) {
        document.getElementById('seq-error').innerText = "Please create some colors first!";
        return;
    }
    const stepDiv = document.createElement('div');
    stepDiv.className = 'seq-step';
    let options = config.colors.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    stepDiv.innerHTML = `
        <select class="step-color">${options}</select>
        <input type="number" class="step-dur" value="1000" min="50" step="50" placeholder="ms">
        <button class="del-btn">×</button>
    `;
    stepDiv.querySelector('.del-btn').addEventListener('click', () => stepDiv.remove());
    stepsContainer.appendChild(stepDiv);
});

document.getElementById('btn-save-seq').addEventListener('click', () => {
    const err = document.getElementById('seq-error');
    err.innerText = '';
    const name = document.getElementById('seq-name').value.trim() || 'Untitled Sequence';
    const hk = document.getElementById('seq-hotkey').value;

    if (isHotkeyUsed(hk)) return err.innerText = `Error: Hotkey "${hk}" is already in use!`;

    const stepDivs = document.querySelectorAll('.seq-step');
    if (stepDivs.length === 0) return err.innerText = "Error: Sequence must have at least one step.";

    const stepsArray = Array.from(stepDivs).map(div => {
        return {
            color_id: div.querySelector('.step-color').value,
            duration: parseInt(div.querySelector('.step-dur').value)
        };
    });

    const loopState = document.getElementById('seq-loop').checked;

    const newSeq = { id: 's_' + Date.now(), name: name, hotkey: hk, steps: stepsArray, loop: loopState };
    config.sequences.push(newSeq);
    saveConfig();

    document.getElementById('seq-name').value = '';
    document.getElementById('seq-hotkey').value = '';
    stepsContainer.innerHTML = '';
});

window.editSequence = function (index) {
    const seq = config.sequences[index];
    document.getElementById('seq-name').value = seq.name;
    document.getElementById('seq-hotkey').value = seq.hotkey || '';
    document.getElementById('seq-loop').checked = seq.loop;

    stepsContainer.innerHTML = '';
    seq.steps.forEach(step => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'seq-step';
        let options = config.colors.map(c =>
            `<option value="${c.id}" ${step.color_id === c.id ? 'selected' : ''}>${c.name}</option>`
        ).join('');
        stepDiv.innerHTML = `
            <select class="step-color">${options}</select>
            <input type="number" class="step-dur" value="${step.duration}" min="50" step="50" placeholder="ms">
            <button class="del-btn">×</button>
        `;
        stepDiv.querySelector('.del-btn').addEventListener('click', () => stepDiv.remove());
        stepsContainer.appendChild(stepDiv);
    });

    config.sequences.splice(index, 1);
    saveConfig();

    document.querySelector('.tab-btn[data-target="seqs"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderLists() {
    const clist = document.getElementById('colors-list');
    const slist = document.getElementById('seqs-list');

    clist.innerHTML = config.colors.map((c, i) => `
        <div class="list-item">
            <div class="list-item-content" style="display:flex; align-items:center;">
                <button class="small-btn" style="padding:4px 8px; margin-right:12px; border-radius:var(--radius-sm); background:var(--accent-dim); color:var(--accent-primary); border:1px solid var(--accent-primary);" onclick="testColor({r:${c.rgb.r}, g:${c.rgb.g}, b:${c.rgb.b}})" title="Play Color">Play</button>
                <div style="flex:1;">
                    <h4 style="margin:0;"><span class="color-preview" style="background:${c.hex}"></span> ${c.name}</h4>
                    <div style="margin-top:6px;">
                        ${c.hotkey ? `<span class="badge" style="cursor:pointer" onclick="startRebindColor(${i})" title="Rebind">[ ${c.hotkey} ] <span style="color:#c93b3b; margin-left:5px; padding-left:7px; border-left:1px solid rgba(255,255,255,0.3);" onclick="clearColorHotkey(${i}, event)" title="Remove Hotkey">x</span></span>` : `<button class="small-btn" style="padding:2px 8px; font-size:0.75rem;" onclick="startRebindColor(${i})">+ Add Hotkey</button>`}
                    </div>
                </div>
            </div>
            <button class="del-btn" onclick="deleteColor(${i})">Delete</button>
        </div>
    `).join('') || '<p class="desc">No colors saved.</p>';

    const palette = document.getElementById('arranger-palette');
    if (palette) {
        palette.innerHTML = `<p class="section-title" style="font-size: 0.8rem; text-align: center; margin-bottom: 15px;">Palette</p>` +
            config.colors.map(c => `
            <div class="draggable-color" draggable="true" data-id="${c.id}" style="background: ${c.hex};">
                ${c.name}
            </div>
        `).join('') || '<p class="desc" style="font-size:0.8rem; text-align:center;">Create colors in the Colors tab.</p>';

        document.querySelectorAll('.draggable-color').forEach(el => {
            el.addEventListener('dragstart', e => { e.dataTransfer.setData('color_id', e.target.dataset.id); e.target.style.opacity = '0.5'; });
            el.addEventListener('dragend', e => { e.target.style.opacity = '1'; });
        });
    }

    const launchpad = document.getElementById('launchpad-keys');
    if (launchpad) {
        launchpad.innerHTML = config.colors.filter(c => c.hotkey).map(c => `
            <div class="launchpad-key" id="lp-key-${c.id}">
                <span class="color-dot" style="background:${c.hex}"></span>
                ${c.name} <span class="badge" style="background:rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 4px;">${c.hotkey}</span>
            </div>
        `).join('') || '<p class="desc" style="font-size:0.8rem; text-align:center;">Assign hotkeys in Colors tab to play live.</p>';
    }

    slist.innerHTML = config.sequences.map((s, i) => `
        <div class="list-item">
            <div class="list-item-content" style="display:flex; align-items:flex-start;">
                <button class="small-btn" style="padding:4px 8px; margin-right:12px; margin-top:2px; border-radius:var(--radius-sm); background:var(--accent-dim); color:var(--accent-primary); border:1px solid var(--accent-primary);" onclick="playSequence('${s.id}')" title="Play Sequence">Play</button>
                <div style="flex:1;">
                    <h4 style="margin:0;">${s.name} ${s.loop === false ? '<small style="color:var(--text-muted); font-weight:normal">(1 shot)</small>' : ''}</h4>
                    <div style="margin-top:6px;">
                        ${s.hotkey ? `<span class="badge" style="cursor:pointer" onclick="startRebindSeq(${i})" title="Rebind">[ ${s.hotkey} ] <span style="color:#c93b3b; margin-left:5px; padding-left:7px; border-left:1px solid rgba(255,255,255,0.3);" onclick="clearSeqHotkey(${i}, event)" title="Remove Hotkey">x</span></span>` : `<button class="small-btn" style="padding:2px 8px; font-size:0.75rem;" onclick="startRebindSeq(${i})">+ Add Hotkey</button>`}
                    </div>
                    <small style="color:var(--text-muted); display:block; margin-top:6px;">${s.steps.length} logic steps built.</small>
                </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:5px;">
                <button class="small-btn" onclick="editSequence(${i})">Edit</button>
                <button class="del-btn" onclick="deleteSequence(${i})">Delete</button>
            </div>
        </div>
    `).join('') || '<p class="desc">No sequences saved.</p>';

    const currentVal = audioSelect.value;
    audioSelect.innerHTML = config.colors.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if (currentVal && Array.from(audioSelect.options).some(o => o.value == currentVal)) {
        audioSelect.value = currentVal;
    }
}

let rebindingTarget = null;
window.startRebindColor = function (index) { rebindingTarget = { type: 'color', index: index }; document.getElementById('rebind-overlay').style.display = 'flex'; };
window.startRebindSeq = function (index) { rebindingTarget = { type: 'sequence', index: index }; document.getElementById('rebind-overlay').style.display = 'flex'; };

window.addEventListener('keydown', (e) => {
    const isRebinding = document.getElementById('rebind-overlay').style.display === 'flex';

    if (e.code === 'Space' && !isRebinding && document.activeElement.tagName !== 'INPUT') {
        if (document.getElementById('view-arrange').classList.contains('active')) {
            e.preventDefault();
            const playBtn = document.getElementById('btn-arrange-play');
            if (playBtn) playBtn.click();
            return;
        }
    }

    if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.altKey && !isRebinding && document.activeElement.tagName !== 'INPUT') {
        if (!document.getElementById('view-arrange').classList.contains('active')) return;
        const autoToggle = document.getElementById('arrange-auto-toggle');
        if (autoToggle) {
            autoToggle.checked = !autoToggle.checked;
            autoToggle.dispatchEvent(new Event('change'));
        }
        return;
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && !isRebinding && document.activeElement.tagName !== 'INPUT') {
        if (!document.getElementById('view-arrange').classList.contains('active')) return;
        const selectedElements = Array.from(document.querySelectorAll('.timeline-block.selected'));
        if (selectedElements.length > 0) {
            saveUndoState();
            const indices = selectedElements.map(el => parseInt(el.id.split('-')[1])).sort((a, b) => b - a);
            indices.forEach(idx => arranger.blocks.splice(idx, 1));
            renderArrangerBlocks();
            return;
        }
    }

    // Ctrl + Hotkeys
    if (e.ctrlKey && !isRebinding && document.activeElement.tagName !== 'INPUT') {
        if (!document.getElementById('view-arrange').classList.contains('active')) return;
        const key = e.key.toLowerCase();
        if (key === 'c') {
            const selectedElements = Array.from(document.querySelectorAll('.timeline-block.selected'));
            if (selectedElements.length > 0) {
                const idx = parseInt(selectedElements[0].id.split('-')[1]);
                arranger.clipboard = JSON.parse(JSON.stringify(arranger.blocks[idx]));
            }
        } else if (key === 'v') {
            if (arranger.clipboard) {
                saveUndoState();
                const newBlock = JSON.parse(JSON.stringify(arranger.clipboard));
                newBlock.startMs = arranger.playheadMs;
                arranger.blocks.push(newBlock);
                renderArrangerBlocks();
            }
        } else if (key === 'z') {
            if (undoStack.length > 0) {
                const state = undoStack.pop();
                arranger.blocks = state.blocks;
                arranger.automation = state.auto;
                renderArrangerBlocks();
                renderAutomation();
            }
        } else if (key === 's') {
            e.preventDefault();
            const saveBtn = document.getElementById('btn-arrange-save');
            if (saveBtn) saveBtn.click();
        }
    }

    if (!isRebinding && document.activeElement.tagName === 'INPUT') return;

    const keys = [];
    if (e.ctrlKey) keys.push('ctrl');
    if (e.shiftKey) keys.push('shift');
    if (e.altKey) keys.push('alt');

    let key = e.key.toLowerCase();
    if (['control', 'shift', 'alt', 'meta'].includes(key)) return;
    if (key === ' ') key = 'space';
    // Normalize numpad keys to their digit equivalent (e.g. 'numpad0' -> '0')
    // e.key for numpad digits is already '0'-'9', but some browsers return 'numpad0' etc.
    key = key.replace(/^numpad(\d)$/, '$1');

    keys.push(key);
    const finalKey = keys.join('+');

    if (isRebinding) {
        e.preventDefault();
        if (isHotkeyUsed(finalKey)) {
            showToast('Hotkey Conflict', `Hotkey ${finalKey} is already in use by another action!`, true);
            return;
        }
        if (rebindingTarget.type === 'color') config.colors[rebindingTarget.index].hotkey = finalKey;
        else config.sequences[rebindingTarget.index].hotkey = finalKey;
        saveConfig();
        overlay.style.display = 'none';
        return;
    }

    // Sequences and colors fire EVERYWHERE except the Arranger tab (unless recording)
    const onArrangerTab = document.getElementById('view-arrange')?.classList.contains('active');

    const seq = config.sequences.find(s => s.hotkey === finalKey);
    if (seq && !e.repeat) {
        // Only fire sequences if we're NOT on the arranger tab (or we are but not recording)
        if (!onArrangerTab) {
            e.preventDefault();
            playSequence(seq.id);
            return;
        }
    }

    const color = config.colors.find(c => c.hotkey === finalKey);
    if (color && !e.repeat) {
        if (onArrangerTab && arranger.isRecording && arranger.activeKeys[color.id] === undefined) {
            // Recording mode: create a growing block on the timeline
            e.preventDefault();
            arranger.activeKeys[color.id] = arranger.playheadMs;
            const lpKey = document.getElementById(`lp-key-${color.id}`);
            if (lpKey) lpKey.classList.add('active');
            testColor(color.rgb);

            const tempBlock = document.createElement('div');
            tempBlock.className = 'timeline-block temp-block';
            tempBlock.id = `temp-block-${color.id}`;
            tempBlock.style.background = color.hex;
            tempBlock.style.left = `${(arranger.playheadMs / TRACK_LENGTH_MS) * 100}%`;
            tempBlock.style.width = '0%';
            tempBlock.style.pointerEvents = 'auto';
            document.getElementById('blocks-container').appendChild(tempBlock);
        } else if (!onArrangerTab) {
            // On any other tab: fire the color live
            e.preventDefault();
            testColor(color.rgb);
        }
        // If on arranger tab but NOT recording: do nothing (silently ignore)
    }
});

window.addEventListener('keyup', (e) => {
    if (!arranger.isRecording) return;
    const keys = [];
    if (e.ctrlKey) keys.push('ctrl');
    if (e.shiftKey) keys.push('shift');
    if (e.altKey) keys.push('alt');
    let key = e.key.toLowerCase();
    if (['control', 'shift', 'alt', 'meta'].includes(key)) return;
    if (key === ' ') key = 'space';
    keys.push(key);
    const finalKey = keys.join('+');

    const color = config.colors.find(c => c.hotkey === finalKey);
    if (color && arranger.activeKeys[color.id] !== undefined) {
        const startMs = arranger.activeKeys[color.id];
        const durationMs = Math.max(50, arranger.playheadMs - startMs);
        arranger.blocks.push({
            color_id: color.id, hex: color.hex, rgb: color.rgb, startMs: startMs, durationMs: durationMs
        });
        delete arranger.activeKeys[color.id];
        const lpKey = document.getElementById(`lp-key-${color.id}`);
        if (lpKey) lpKey.classList.remove('active');
        renderArrangerBlocks();
    }
});

// Arranger State & Logic
let TRACK_LENGTH_MS = 30000;
let arrangerZoom = 1.0;
let undoStack = [];
let arranger = {
    blocks: [], isPlaying: false, isRecording: false, playheadMs: 0,
    lastTime: 0, activeKeys: {}, currentBlock: null, clipboard: null
};

function saveUndoState() {
    undoStack.push({
        blocks: JSON.parse(JSON.stringify(arranger.blocks)),
        auto: JSON.parse(JSON.stringify(arranger.automation))
    });
    if (undoStack.length > 20) undoStack.shift();
}

document.querySelector('.arranger-timeline-area')?.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        e.preventDefault();
        const direction = Math.sign(e.deltaY);
        arrangerZoom -= direction * 0.15;
        arrangerZoom = Math.max(0.5, Math.min(5.0, arrangerZoom));

        const tracks = document.getElementById('timeline-tracks');
        if (tracks) {
            tracks.style.minWidth = `${1200 * arrangerZoom}px`;
            if (arranger.currentTrackId) {
                drawWaveform(arranger.currentTrackId);
            }
        }
    }
}, { passive: false });

function renderArrangerBlocks() {
    const tracksContainer = document.getElementById('blocks-container');
    if (!tracksContainer) return;

    const selected = Array.from(document.querySelectorAll('.timeline-block.selected')).map(el => parseInt(el.id.split('-')[1]));
    tracksContainer.innerHTML = arranger.blocks.map((b, i) => {
        const leftPct = (b.startMs / TRACK_LENGTH_MS) * 100;
        const widthPct = (b.durationMs / TRACK_LENGTH_MS) * 100;
        const selClass = selected.includes(i) ? 'selected' : '';
        return `
        <div class="timeline-block ${selClass}" id="block-${i}" style="left: ${leftPct}%; width: ${widthPct}%; background: ${b.hex};" onmousedown="startBlockAction(event, ${i})" oncontextmenu="openBlockContext(${i}, event)" title="Right-click for options">
            <div class="resize-handle" onmousedown="startBlockResize(event, ${i})"></div>
        </div>`;
    }).join('');
}

let activeContextBlock = -1;

window.openBlockContext = function (index, e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }

    activeContextBlock = index;
    const menu = document.getElementById('block-context-menu');
    const colorList = document.getElementById('context-color-list');

    // Populate colors
    colorList.innerHTML = '';
    config.colors.forEach(c => {
        const btn = document.createElement('div');
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.gap = '8px';
        btn.style.padding = '4px 8px';
        btn.style.cursor = 'pointer';
        btn.style.borderRadius = '4px';
        btn.onmouseover = () => btn.style.background = 'rgba(255,255,255,0.1)';
        btn.onmouseout = () => btn.style.background = 'transparent';

        btn.innerHTML = `
            <div style="width:12px; height:12px; border-radius:50%; background:${c.hex};"></div>
            <span style="color:#fff; font-size:0.8rem;">${c.name || 'Unnamed Color'}</span>
        `;

        btn.onclick = () => {
            saveUndoState();
            arranger.blocks[activeContextBlock].color_id = c.id;
            arranger.blocks[activeContextBlock].hex = c.hex;
            arranger.blocks[activeContextBlock].rgb = c.rgb;
            menu.style.display = 'none';
            renderArrangerBlocks();
        };

        colorList.appendChild(btn);
    });

    document.getElementById('btn-context-delete').onclick = () => {
        saveUndoState();
        arranger.blocks.splice(activeContextBlock, 1);
        menu.style.display = 'none';
        renderArrangerBlocks();
    };

    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.style.display = 'block';
};

window.addEventListener('click', () => {
    const menu = document.getElementById('block-context-menu');
    if (menu) menu.style.display = 'none';
});

let activeAction = null;
window.startBlockAction = function (e, index) {
    if (e.button !== 0 || e.target.classList.contains('resize-handle')) return;

    const blockEl = document.getElementById(`block-${index}`);
    if (!blockEl.classList.contains('selected') && !e.shiftKey) {
        document.querySelectorAll('.timeline-block.selected').forEach(el => el.classList.remove('selected'));
        blockEl.classList.add('selected');
    } else if (e.shiftKey) {
        blockEl.classList.toggle('selected');
    }

    const selectedIndices = Array.from(document.querySelectorAll('.timeline-block.selected')).map(el => parseInt(el.id.split('-')[1]));
    const originalStarts = {};
    selectedIndices.forEach(idx => originalStarts[idx] = arranger.blocks[idx].startMs);

    saveUndoState();
    activeAction = { type: 'move', index: index, startX: e.clientX, originalStarts: originalStarts, primaryStart: arranger.blocks[index].startMs };
    document.addEventListener('mousemove', handleBlockMove);
    document.addEventListener('mouseup', endBlockAction);
}
window.startBlockResize = function (e, index) {
    if (e.button !== 0) return;
    e.stopPropagation();
    saveUndoState();
    activeAction = { type: 'resize', index: index, startX: e.clientX, startDur: arranger.blocks[index].durationMs };
    document.addEventListener('mousemove', handleBlockMove);
    document.addEventListener('mouseup', endBlockAction);
}

function getSnapMs() {
    const el = document.getElementById('arrange-snap');
    return el ? (parseInt(el.value) || 0) : 0;
}
function snapValue(val, snap) {
    if (snap === 0) return val;
    return Math.round(val / snap) * snap;
}

function handleBlockMove(e) {
    if (!activeAction) return;
    const rect = document.getElementById('timeline-tracks').getBoundingClientRect();
    const msPerPixel = TRACK_LENGTH_MS / rect.width;
    const deltaMs = (e.clientX - activeAction.startX) * msPerPixel;
    const block = arranger.blocks[activeAction.index];
    const snapMs = getSnapMs();
    const SNAP_THRESHOLD_MS = 150 * msPerPixel;

    if (activeAction.type === 'move') {
        let newStart = activeAction.primaryStart + deltaMs;
        let snappedEdge = false;

        for (let i = 0; i < arranger.blocks.length; i++) {
            if (activeAction.originalStarts[i] !== undefined) continue;
            const other = arranger.blocks[i];
            if (Math.abs(newStart - (other.startMs + other.durationMs)) < SNAP_THRESHOLD_MS) { newStart = other.startMs + other.durationMs; snappedEdge = true; break; }
            if (Math.abs((newStart + block.durationMs) - other.startMs) < SNAP_THRESHOLD_MS) { newStart = other.startMs - block.durationMs; snappedEdge = true; break; }
            if (Math.abs(newStart - other.startMs) < SNAP_THRESHOLD_MS) { newStart = other.startMs; snappedEdge = true; break; }
        }

        if (!snappedEdge) newStart = snapValue(newStart, snapMs);
        const actualDeltaMs = newStart - activeAction.primaryStart;

        for (let idx in activeAction.originalStarts) {
            const b = arranger.blocks[idx];
            b.startMs = Math.max(0, Math.min(TRACK_LENGTH_MS - b.durationMs, activeAction.originalStarts[idx] + actualDeltaMs));
            const el = document.getElementById(`block-${idx}`);
            if (el) el.style.left = `${(b.startMs / TRACK_LENGTH_MS) * 100}%`;
        }
    } else if (activeAction.type === 'resize') {
        let newDur = activeAction.startDur + deltaMs;
        let snappedEdge = false;
        const currentEnd = activeAction.startMs + newDur;

        for (let i = 0; i < arranger.blocks.length; i++) {
            if (i === activeAction.index) continue;
            const other = arranger.blocks[i];
            if (Math.abs(currentEnd - other.startMs) < SNAP_THRESHOLD_MS) { newDur = other.startMs - activeAction.startMs; snappedEdge = true; break; }
        }

        if (!snappedEdge) newDur = snapValue(newDur, snapMs);
        block.durationMs = Math.max(100, Math.min(TRACK_LENGTH_MS - block.startMs, newDur));

        const blockEl = document.getElementById(`block-${activeAction.index}`);
        if (blockEl) blockEl.style.width = `${(block.durationMs / TRACK_LENGTH_MS) * 100}%`;
    }
}
function endBlockAction() {
    activeAction = null;
    document.removeEventListener('mousemove', handleBlockMove);
    document.removeEventListener('mouseup', endBlockAction);
    renderArrangerBlocks();
}

// Drag & Drop Timeline API
const tlTracks = document.getElementById('timeline-tracks');
if (tlTracks) {
    let currentZoom = 1;
    tlTracks.addEventListener('wheel', e => {
        e.preventDefault();
        const zoomDelta = e.deltaY < 0 ? 0.15 : -0.15;
        currentZoom = Math.max(1, Math.min(10, currentZoom + zoomDelta));
        tlTracks.style.minWidth = `${1200 * currentZoom}px`;
        renderAutomation();
    }, { passive: false });

    let selectionBox = null;
    let selectionStart = { x: 0, y: 0 };
    tlTracks.addEventListener('mousedown', e => {
        if (e.target.id === 'timeline-tracks' || e.target.id === 'blocks-container' || e.target.id === 'waveform-canvas') {
            // Clean up any stale selection boxes first
            tlTracks.querySelectorAll('.selection-box').forEach(el => el.remove());
            selectionBox = null;

            const rect = tlTracks.getBoundingClientRect();
            const scrollLeft = document.getElementById('timeline-container').scrollLeft;
            selectionStart = { x: e.clientX - rect.left + scrollLeft, y: e.clientY - rect.top };
            selectionBox = document.createElement('div');
            selectionBox.className = 'selection-box';
            selectionBox.style.position = 'absolute';
            selectionBox.style.left = `${selectionStart.x}px`;
            selectionBox.style.top = `${selectionStart.y}px`;
            selectionBox.style.width = '0px';
            selectionBox.style.height = '0px';
            tlTracks.appendChild(selectionBox);

            if (!e.shiftKey) document.querySelectorAll('.timeline-block.selected').forEach(el => el.classList.remove('selected'));

            document.addEventListener('mousemove', drawSelectionBox);
            document.addEventListener('mouseup', endSelectionBox);
        }
    });

    function drawSelectionBox(e) {
        if (!selectionBox) return;
        const rect = tlTracks.getBoundingClientRect();
        const scrollLeft = document.getElementById('timeline-container').scrollLeft;
        const currentX = e.clientX - rect.left + scrollLeft;
        const currentY = e.clientY - rect.top;
        const x = Math.min(selectionStart.x, currentX);
        const y = Math.min(selectionStart.y, currentY);
        const w = Math.abs(currentX - selectionStart.x);
        const h = Math.abs(currentY - selectionStart.y);
        selectionBox.style.left = `${x}px`;
        selectionBox.style.top = `${y}px`;
        selectionBox.style.width = `${w}px`;
        selectionBox.style.height = `${h}px`;
    }

    function endSelectionBox(e) {
        document.removeEventListener('mousemove', drawSelectionBox);
        document.removeEventListener('mouseup', endSelectionBox);
        if (!selectionBox) return;
        const boxRect = selectionBox.getBoundingClientRect();
        document.querySelectorAll('.timeline-block').forEach(blockEl => {
            const bRect = blockEl.getBoundingClientRect();
            if (!(boxRect.right < bRect.left || boxRect.left > bRect.right || boxRect.bottom < bRect.top || boxRect.top > bRect.bottom)) {
                blockEl.classList.add('selected');
            }
        });
        selectionBox.remove();
        selectionBox = null;
    }

    tlTracks.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    tlTracks.addEventListener('drop', e => {
        e.preventDefault();
        const colorId = e.dataTransfer.getData('color_id');
        if (!colorId) return;
        const color = config.colors.find(c => c.id === colorId);
        if (!color) return;

        const rect = tlTracks.getBoundingClientRect();
        const xPos = e.clientX - rect.left;
        let startMs = Math.max(0, (xPos / rect.width) * TRACK_LENGTH_MS);
        startMs = snapValue(startMs, getSnapMs());
        const durationMs = 1500;

        arranger.blocks.push({ color_id: color.id, hex: color.hex, rgb: color.rgb, startMs: startMs, durationMs: Math.min(durationMs, TRACK_LENGTH_MS - startMs) });
        renderArrangerBlocks();
    });
}

function renderAutomation(skipSort = false) {
    const tlTracks = document.getElementById('timeline-tracks');
    const svg = document.getElementById('automation-svg');
    if (!tlTracks || !svg) return;

    if (!arranger.automation) arranger.automation = [{ ms: 0, val: 0.5 }, { ms: TRACK_LENGTH_MS, val: 0.5 }];

    const w = tlTracks.clientWidth;
    const h = tlTracks.clientHeight || 150;
    svg.style.height = `${h}px`; // enforce height so it doesn't clip

    if (!skipSort) arranger.automation.sort((a, b) => a.ms - b.ms);
    let d = '';

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const svgNS = "http://www.w3.org/2000/svg";

    const cLine = document.createElementNS(svgNS, 'line');
    cLine.setAttribute('x1', '0');
    cLine.setAttribute('y1', h / 2);
    cLine.setAttribute('x2', w);
    cLine.setAttribute('y2', h / 2);
    cLine.setAttribute('stroke', 'rgba(255,255,255,0.2)');
    cLine.setAttribute('stroke-dasharray', '4');
    cLine.setAttribute('stroke-width', '1');
    svg.appendChild(cLine);

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#00d2ff');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);

    arranger.automation.forEach((pt, i) => {
        const x = (pt.ms / TRACK_LENGTH_MS) * w;
        const y = (1.0 - pt.val) * h;
        if (i === 0) d += `M ${x} ${y} `; else d += `L ${x} ${y} `;

        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('class', 'auto-node');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '6');
        circle.addEventListener('mousedown', (e) => startAutoNodeDrag(e, i));
        circle.addEventListener('contextmenu', (e) => deleteAutoNode(e, i));
        svg.appendChild(circle);
    });

    path.setAttribute('d', d);
}

if (document.getElementById('automation-svg')) {
    const trackContainer = document.getElementById('timeline-tracks');
    if (trackContainer) {
        trackContainer.addEventListener('dblclick', e => {
            if (!automationMode || (e.target.tagName && e.target.tagName.toLowerCase() === 'circle')) return;
            const rect = trackContainer.getBoundingClientRect();
            const x = e.clientX - rect.left; const y = e.clientY - rect.top;
            let ms = snapValue((x / rect.width) * TRACK_LENGTH_MS, getSnapMs());
            let val = Math.max(0, Math.min(1, 1.0 - (y / rect.height)));
            arranger.automation.push({ ms, val });
            renderAutomation();
        });
    }
}

let activeAutoNode = null;
window.startAutoNodeDrag = function (e, index) {
    if (e.button !== 0 || !automationMode) return;
    e.stopPropagation(); activeAutoNode = index;
    document.addEventListener('mousemove', handleAutoNodeDrag);
    document.addEventListener('mouseup', endAutoNodeDrag);
}
window.deleteAutoNode = function (e, index) {
    e.preventDefault(); e.stopPropagation();
    if (!automationMode || index === 0 || index === arranger.automation.length - 1) return;
    arranger.automation.splice(index, 1);
    renderAutomation();
}
function handleAutoNodeDrag(e) {
    if (activeAutoNode === null) return;
    const rect = document.getElementById('timeline-tracks').getBoundingClientRect();
    let ms = snapValue(((e.clientX - rect.left) / rect.width) * TRACK_LENGTH_MS, getSnapMs());
    let val = Math.max(0, Math.min(1, 1.0 - ((e.clientY - rect.top) / rect.height)));

    ms = Math.max(0, Math.min(TRACK_LENGTH_MS, ms));
    if (activeAutoNode === 0) ms = 0;
    if (activeAutoNode === arranger.automation.length - 1) ms = TRACK_LENGTH_MS;

    arranger.automation[activeAutoNode].ms = ms;
    arranger.automation[activeAutoNode].val = val;
    renderAutomation(true);
}
window.endAutoNodeDrag = function () {
    activeAutoNode = null;
    document.removeEventListener('mousemove', handleAutoNodeDrag);
    document.removeEventListener('mouseup', endAutoNodeDrag);
    renderAutomation(false);
}

function arrangerLoop(timestamp) {
    if (!arranger.lastTime) arranger.lastTime = timestamp;
    const delta = timestamp - arranger.lastTime;
    arranger.lastTime = timestamp;

    if (arranger.isPlaying || arranger.isRecording) {
        if (arranger.spotifySync) {
            // Smoothly interpolate the playhead forward based on elapsed time
            // The Spotify poll corrects us every 500ms; between polls we just advance at 1x speed
            if (!isScrubbingRuler && Date.now() > scrubCooldown) {
                arranger.playheadMs = Math.min(TRACK_LENGTH_MS, arranger.playheadMs + delta);
                const playhead = document.getElementById('timeline-playhead');
                if (playhead) playhead.style.left = `${(arranger.playheadMs / TRACK_LENGTH_MS) * 100}%`;
            }
        } else {
            arranger.playheadMs += delta;
            if (arranger.playheadMs > TRACK_LENGTH_MS) {
                arranger.playheadMs = 0;
                if (arranger.isRecording) document.getElementById('btn-arrange-record').click();
                else if (arranger.isPlaying) document.getElementById('btn-arrange-play').click();
            }
            const playhead = document.getElementById('timeline-playhead');
            if (playhead) playhead.style.left = `${(arranger.playheadMs / TRACK_LENGTH_MS) * 100}%`;
        }

        // Update temp blocks growing width
        if (arranger.isRecording) {
            for (let cid in arranger.activeKeys) {
                const tempBlock = document.getElementById(`temp-block-${cid}`);
                if (tempBlock) {
                    const dur = arranger.playheadMs - arranger.activeKeys[cid];
                    tempBlock.style.width = `${(dur / TRACK_LENGTH_MS) * 100}%`;
                }
            }
        }

        // Playback Logic
        if (arranger.isPlaying && !arranger.isRecording) {
            const activeBlock = arranger.blocks.find(b => arranger.playheadMs >= b.startMs && arranger.playheadMs < b.startMs + b.durationMs);
            if (activeBlock) {
                let brightness = 1.0;
                if (arranger.automation && arranger.automation.length >= 2) {
                    for (let i = 0; i < arranger.automation.length - 1; i++) {
                        const p1 = arranger.automation[i];
                        const p2 = arranger.automation[i + 1];
                        if (arranger.playheadMs >= p1.ms && arranger.playheadMs <= p2.ms) {
                            const range = p2.ms - p1.ms;
                            let val = p1.val;
                            if (range !== 0) val = p1.val + (p2.val - p1.val) * ((arranger.playheadMs - p1.ms) / range);
                            brightness = val * 2.0;
                            break;
                        }
                    }
                }

                // Only send if color changed OR brightness changed significantly
                if (!arranger.lastColorId || arranger.lastColorId !== activeBlock.color_id || Math.abs((arranger.lastBrightness || 1) - brightness) > 0.02) {
                    const c = activeBlock.rgb;
                    const r = Math.min(255, Math.round(c.r * brightness));
                    const g = Math.min(255, Math.round(c.g * brightness));
                    const b = Math.min(255, Math.round(c.b * brightness));
                    fetch(`${BASE_URL}/api/action`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'test_color', r: r, g: g, b: b })
                    }).catch(e => { });
                    arranger.lastColorId = activeBlock.color_id;
                    arranger.lastBrightness = brightness;
                }
            } else {
                if (arranger.lastColorId) {
                    fetch(`${BASE_URL}/api/color`, { method: 'POST', body: JSON.stringify({ r: 0, g: 0, b: 0 }) }).catch(e => { });
                    arranger.lastColorId = null;
                }
            }
        }
    }
    requestAnimationFrame(arrangerLoop);
}
requestAnimationFrame(arrangerLoop);

document.getElementById('btn-arrange-record').addEventListener('click', () => {
    const btn = document.getElementById('btn-arrange-record');
    arranger.isRecording = !arranger.isRecording;
    if (arranger.isRecording) {
        if (arranger.isPlaying) document.getElementById('btn-arrange-play').click();
        btn.innerText = 'Stop Rec';
        btn.style.boxShadow = '0 0 10px var(--accent-danger)';
        arranger.playheadMs = 0;
        arranger.lastTime = performance.now();
        const bc = document.getElementById('blocks-container');
        if (bc) bc.innerHTML = ''; // Clear DOM for re-render without temp blocks
        renderArrangerBlocks();
    } else {
        btn.innerText = 'Record';
        btn.style.boxShadow = '';
        // clear any stuck temp blocks
        arranger.activeKeys = {};
        document.querySelectorAll('.launchpad-key').forEach(k => k.classList.remove('active'));
        renderArrangerBlocks();
    }
});

document.getElementById('btn-arrange-play').addEventListener('click', async () => {
    const btn = document.getElementById('btn-arrange-play');
    arranger.isPlaying = !arranger.isPlaying;

    // Sync with Spotify remotely
    if (arranger.spotifySync) {
        try {
            await fetch(`${BASE_URL}/api/spotify/control`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: arranger.isPlaying ? 'play' : 'pause' })
            });
        } catch (e) { }
    }

    if (arranger.isPlaying) {
        if (arranger.isRecording) document.getElementById('btn-arrange-record').click();
        btn.innerText = 'Pause';
        if (arranger.playheadMs >= TRACK_LENGTH_MS) arranger.playheadMs = 0;
        arranger.lastTime = performance.now();
        arranger.currentBlock = null;
    } else {
        btn.innerText = 'Play';
    }
});

document.getElementById('btn-arrange-clear').addEventListener('click', () => {
    arranger.blocks = [];
    arranger.playheadMs = 0;
    document.getElementById('timeline-playhead').style.left = '0%';
    renderArrangerBlocks();
});

let isDraggingPlayhead = false;
const playheadEl = document.getElementById('timeline-playhead');
if (playheadEl) {
    playheadEl.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        isDraggingPlayhead = true;
        e.stopPropagation();
    });
}
document.addEventListener('mousemove', e => {
    if (isDraggingPlayhead) {
        const rect = document.getElementById('timeline-tracks').getBoundingClientRect();
        let ms = ((e.clientX - rect.left) / rect.width) * TRACK_LENGTH_MS;
        ms = Math.max(0, Math.min(TRACK_LENGTH_MS, ms));
        arranger.playheadMs = snapValue(ms, getSnapMs());
        const playhead = document.getElementById('timeline-playhead');
        if (playhead) playhead.style.left = `${(arranger.playheadMs / TRACK_LENGTH_MS) * 100}%`;
    }
});
document.addEventListener('mouseup', () => {
    isDraggingPlayhead = false;
});

document.getElementById('refresh-devices')?.addEventListener('click', async () => {
    sysStatus.innerText = 'Rescanning Hardware...';
    await fetch(`${BASE_URL}/api/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rescan_devices' })
    });
    setTimeout(fetchAudioDevices, 1500);
});

// Spotify Integration
document.getElementById('btn-spotify-login')?.addEventListener('click', async () => {
    const cid = document.getElementById('spotify-client-id').value.trim();
    const csec = document.getElementById('spotify-client-secret').value.trim();
    const msg = document.getElementById('spotify-status-msg');

    if (!cid || !csec) {
        msg.innerText = "Please enter both Client ID and Client Secret.";
        msg.style.color = "#ff3366";
        return;
    }

    config.spotify_client_id = cid;
    config.spotify_client_secret = csec;
    await saveConfig();

    msg.innerText = "Saved! Requesting Spotify Login...";
    msg.style.color = "#8b9bb4";

    try {
        const res = await fetch(`${BASE_URL}/api/spotify/login`);
        const data = await res.json();
        if (data.auth_url) {
            window.open(data.auth_url, '_blank', 'width=500,height=600');
            msg.innerText = "Please log in to Spotify in the popup window. After authorizing, restart this App from your terminal.";
            msg.style.color = "#1DB954";
        } else {
            msg.innerText = "Failed to get auth URL.";
            msg.style.color = "#ff3366";
        }
    } catch (e) {
        msg.innerText = "Error reaching server. Is it running?";
        msg.style.color = "#ff3366";
    }
});

// Spotify Sync state
arranger.spotifySync = true;
let spotifySyncInterval = null;

// Start polling immediately if configured
fetchConfig().then(() => {
    if (config.spotify_client_id) document.getElementById('spotify-client-id').value = config.spotify_client_id;
    if (config.spotify_client_secret) document.getElementById('spotify-client-secret').value = config.spotify_client_secret;

    if (config.spotify_client_id) {
        if (!spotifySyncInterval) {
            spotifySyncInterval = setInterval(async () => {
                if (!arranger.spotifySync) return;
                
                try {
                    const res = await fetch(`${BASE_URL}/api/spotify/state`);
                    const data = await res.json();
                    if (data.status === 'success') {
                        const st = data.state;
                        updateBeatTrackLabel(st);

                        // Auto-Load Magic
                        if (st.track_id && st.track_id !== arranger.currentTrackId) {
                            const saved = config.arrangements?.find(a => a.track_id === st.track_id);
                            if (saved) {
                                // Automatically update duration from current playback just in case
                                saved.duration_ms = st.duration_ms || saved.duration_ms || 30000;
                                loadArrangement(saved.id);
                            } else {
                                // It's a new song we have no arrangement for
                                arranger.currentTrackId = st.track_id;
                                arranger.blocks = [];
                                arranger.automation = [];
                                TRACK_LENGTH_MS = st.duration_ms || 30000;
                                updateDurationLabel();
                                document.getElementById('arranger-current-song-label').innerText = `${st.track_name} (Unsaved)`;
                                renderArrangerBlocks();
                                renderAutomation();
                                drawWaveform(st.track_id);
                            }
                        }

                        // Force the timeline to match the music
                        if (!isScrubbingRuler && Date.now() > scrubCooldown) {
                            // Snap playheadMs to Spotify's authoritative value
                            // (the rAF loop will then smoothly advance it forward)
                            arranger.playheadMs = Math.min(TRACK_LENGTH_MS, st.progress_ms);
                        }
                        arranger.isPlaying = st.is_playing;

                        // Visually update the play button to reflect Spotify's state
                        const playBtn = document.getElementById('btn-arrange-play');
                        if (playBtn) {
                            if (arranger.isPlaying) {
                                playBtn.innerText = 'Pause Spotify';
                                playBtn.classList.remove('success-btn');
                                playBtn.classList.add('accent-btn');
                            } else {
                                playBtn.innerText = 'Play Spotify';
                                playBtn.classList.add('success-btn');
                                playBtn.classList.remove('accent-btn');
                            }
                        }
                    }
                } catch (e) { }
            }, 2000);
        }
    }
});
fetchAudioDevices();

// --- Spotify Beat Sync UI ---
const btnBeatStart = document.getElementById('btn-beat-sync-start');
const btnBeatStop  = document.getElementById('btn-beat-sync-stop');
const beatStatus   = document.getElementById('beat-sync-status');
const beatTrackLbl = document.getElementById('beat-sync-track-label');
let beatSyncActive = false;

function updateBeatTrackLabel(state) {
    if (!beatTrackLbl) return;
    if (state && state.track_id) {
        const prefix = state.is_playing ? '[PLAYING]' : '[PAUSED]';
        beatTrackLbl.textContent = `${prefix} ${state.track_name || 'Unknown'} - ${state.artist_name || ''}`;
        beatTrackLbl.style.color = state.is_playing ? 'var(--accent-primary)' : 'var(--text-muted)';
    } else {
        beatTrackLbl.textContent = 'No active stream - open Spotify and play track.';
        beatTrackLbl.style.color = 'var(--text-muted)';
    }
}

btnBeatStart?.addEventListener('click', async () => {
    beatStatus.textContent = 'Loading beat telemetry from Spotify...';
    beatStatus.style.color = 'var(--text-muted)';
    try {
        const res = await fetch(`${BASE_URL}/api/spotify_beat_sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start' })
        });
        const data = await res.json();
        if (data.error) {
            beatStatus.textContent = 'Error: ' + data.error;
            beatStatus.style.color = 'var(--accent-danger)';
            return;
        }
        beatSyncActive = true;
        btnBeatStart.style.display = 'none';
        btnBeatStop.style.display  = 'inline-block';
        beatStatus.textContent = 'Beat Sync active - phase locked to track';
        beatStatus.style.color = 'var(--accent-primary)';

        // Stop the regular audio sync if it was running
        if (btnAudioStart.style.display === 'none') btnAudioStop.click();
        if (btnScreenStart.style.display === 'none') btnScreenStop.click();
    } catch (e) {
        beatStatus.textContent = 'Server communication error';
        beatStatus.style.color = 'var(--accent-danger)';
    }
});

btnBeatStop?.addEventListener('click', async () => {
    try {
        await fetch(`${BASE_URL}/api/spotify_beat_sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'stop' })
        });
    } catch (e) { }
    beatSyncActive = false;
    btnBeatStop.style.display  = 'none';
    btnBeatStart.style.display = 'inline-block';
    beatStatus.textContent = '';
});


// Song Library Logic
arranger.currentTrackId = null;

function renderLibraryList() {
    const list = document.getElementById('arrangements-list');
    if (!list) return;
    if (!config.arrangements || config.arrangements.length === 0) {
        list.innerHTML = '<p style="color:#8b9bb4; font-size:0.9rem; text-align:center;">No saved arrangements yet.</p>';
        return;
    }
    list.innerHTML = config.arrangements.map(arr => `
        <div class="list-item" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px; border-radius:6px; cursor:pointer;" onclick="loadArrangement('${arr.id}')">
            <div>
                <strong style="color:#fff; display:block; margin-bottom:3px;">${arr.track_name || 'Unknown Song'}</strong>
                <span style="color:#8b9bb4; font-size:0.8rem;">${arr.artist_name || 'Unknown Artist'}</span>
            </div>
            <button class="small-btn danger-btn" onclick="event.stopPropagation(); deleteArrangement('${arr.id}')">Delete</button>
        </div>
    `).join('');
}

document.getElementById('btn-open-library')?.addEventListener('click', () => {
    document.getElementById('library-overlay').style.display = 'flex';
    renderLibraryList();
    fetchSpotifyCurrentlyPlaying();
});

let currentSpotifyInfo = null;
async function fetchSpotifyCurrentlyPlaying() {
    try {
        const res = await fetch(`${BASE_URL}/api/spotify/state`);
        const data = await res.json();
        if (data.status === 'success' && data.state.track_id) {
            currentSpotifyInfo = data.state;
            document.getElementById('library-now-playing').innerText = data.state.track_name || 'Unknown Track';
            document.getElementById('library-now-artist').innerText = data.state.artist_name || 'Unknown Artist';
        } else {
            currentSpotifyInfo = null;
            document.getElementById('library-now-playing').innerText = 'Nothing Playing';
            document.getElementById('library-now-artist').innerText = '-';
        }
    } catch (e) { }
}

document.getElementById('btn-create-arrangement')?.addEventListener('click', () => {
    if (!currentSpotifyInfo || !currentSpotifyInfo.track_id) {
        showToast('Spotify Inactive', 'No active song playing on Spotify. Start playback first.', true);
        return;
    }

    if (!config.arrangements) config.arrangements = [];
    const exists = config.arrangements.find(a => a.track_id === currentSpotifyInfo.track_id);
    if (exists) {
        exists.duration_ms = currentSpotifyInfo.duration_ms || exists.duration_ms || 30000;
        loadArrangement(exists.id);
        document.getElementById('library-overlay').style.display = 'none';
        return;
    }

    const newArr = {
        id: 'arr_' + Date.now(),
        track_id: currentSpotifyInfo.track_id,
        track_name: currentSpotifyInfo.track_name,
        artist_name: currentSpotifyInfo.artist_name,
        duration_ms: currentSpotifyInfo.duration_ms || 30000,
        blocks: [],
        automation: []
    };
    config.arrangements.push(newArr);
    saveConfig();

    loadArrangement(newArr.id);
    drawWaveform(newArr.track_id); // Force waveform draw for newly created arrangement
    document.getElementById('library-overlay').style.display = 'none';
});

window.loadArrangement = function (id) {
    if (!config.arrangements) return;
    const arr = config.arrangements.find(a => a.id === id);
    if (arr) {
        arranger.currentTrackId = arr.track_id;
        arranger.blocks = JSON.parse(JSON.stringify(arr.blocks || []));
        arranger.automation = JSON.parse(JSON.stringify(arr.automation || []));
        TRACK_LENGTH_MS = arr.duration_ms || 30000;

        // Snap playhead to current progress if it's the currently playing song
        if (currentSpotifyInfo && currentSpotifyInfo.track_id === arr.track_id && currentSpotifyInfo.is_playing) {
            arranger.playheadMs = currentSpotifyInfo.progress_ms || 0;
        } else {
            arranger.playheadMs = 0;
        }

        const hPct = (arranger.playheadMs / TRACK_LENGTH_MS) * 100;
        document.getElementById('timeline-playhead').style.left = `${hPct}%`;
        const rHead = document.getElementById('timeline-ruler-playhead');
        if (rHead) rHead.style.left = '0%';

        document.getElementById('arranger-current-song-label').innerText = `${arr.track_name} - ${arr.artist_name}`;
        document.getElementById('library-overlay').style.display = 'none';
        updateDurationLabel();
        renderArrangerBlocks();
        renderAutomation();
        drawWaveform(arr.track_id);
    }
};

function updateDurationLabel() {
    const mins = Math.floor(TRACK_LENGTH_MS / 60000);
    const secs = Math.floor((TRACK_LENGTH_MS % 60000) / 1000).toString().padStart(2, '0');
    const lbl = document.getElementById('timeline-duration-label');
    if (lbl) lbl.innerText = `${mins}:${secs}`;
}

async function drawWaveform(trackId) {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas || !trackId) return;
    const ctx = canvas.getContext('2d');

    // Wait one frame for layout to settle
    await new Promise(r => requestAnimationFrame(r));
    const parent = canvas.parentElement;
    const W = Math.max(parent.offsetWidth, 1200);
    const H = parent.offsetHeight || 160;
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    // --- Synthetic waveform seeded from trackId so each song looks unique ---
    // Simple deterministic pseudo-random number generator (Mulberry32)
    let seed = 0;
    for (let i = 0; i < trackId.length; i++) seed = (seed * 31 + trackId.charCodeAt(i)) >>> 0;
    function rand() {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }

    const BARS = 300; // resolution of waveform
    const mid = H / 2;

    // Generate smooth amplitudes using layered noise
    const amps = [];
    for (let i = 0; i < BARS; i++) {
        // Base wave with some random structure
        const base = rand() * 0.6 + 0.2;
        const variation = Math.sin(i * 0.15) * 0.15 + Math.sin(i * 0.047) * 0.12;
        amps.push(Math.max(0.05, Math.min(1.0, base + variation)));
    }

    // Smooth the amplitudes (moving average)
    const smoothed = amps.map((v, i) => {
        const window = 5;
        let sum = 0, count = 0;
        for (let j = Math.max(0, i - window); j <= Math.min(BARS - 1, i + window); j++) {
            sum += amps[j]; count++;
        }
        return sum / count;
    });

    // Draw waveform
    ctx.beginPath();
    ctx.moveTo(0, mid);

    // Top half
    for (let i = 0; i < BARS; i++) {
        const x = (i / BARS) * W;
        ctx.lineTo(x, mid - smoothed[i] * mid * 0.92);
    }
    ctx.lineTo(W, mid);

    // Bottom half (mirror)
    for (let i = BARS - 1; i >= 0; i--) {
        const x = (i / BARS) * W;
        ctx.lineTo(x, mid + smoothed[i] * mid * 0.92);
    }
    ctx.closePath();

    // Gradient fill
    const waveGrad = ctx.createLinearGradient(0, 0, 0, H);
    waveGrad.addColorStop(0, 'rgba(255,51,102,0.20)');
    waveGrad.addColorStop(0.5, 'rgba(255,51,102,0.35)');
    waveGrad.addColorStop(1, 'rgba(255,51,102,0.20)');
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(255,51,102,0.5)';
    ctx.fillStyle = waveGrad;
    ctx.fill();

    // Bright edge
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 80, 120, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();

    console.log(`[Waveform] Drew synthetic waveform for ${trackId}`);

    // Also try to overlay real Spotify data on top if available
    try {
        const res = await fetch(`${BASE_URL}/api/spotify/analysis?track_id=${trackId}`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === 'success' && data.segments && data.segments.length > 0) {
                ctx.clearRect(0, 0, W, H);
                ctx.beginPath();
                ctx.moveTo(0, mid);
                data.segments.forEach(seg => {
                    const x = (seg.start * 1000 / TRACK_LENGTH_MS) * W;
                    const loudness = Math.max(-60, Math.min(0, seg.loudness_max ?? -40));
                    const amp = Math.pow((loudness + 60) / 60, 1.4);
                    ctx.lineTo(x, mid - (mid * 0.9 * amp));
                });
                ctx.lineTo(W, mid);
                for (let i = data.segments.length - 1; i >= 0; i--) {
                    const seg = data.segments[i];
                    const x = (seg.start * 1000 / TRACK_LENGTH_MS) * W;
                    const loudness = Math.max(-60, Math.min(0, seg.loudness_max ?? -40));
                    const amp = Math.pow((loudness + 60) / 60, 1.4);
                    ctx.lineTo(x, mid + (mid * 0.9 * amp));
                }
                ctx.closePath();
                ctx.shadowBlur = 14;
                ctx.shadowColor = '#ff3366';
                ctx.fillStyle = waveGrad;
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.strokeStyle = 'rgba(255,80,120,0.85)';
                ctx.lineWidth = 1;
                ctx.stroke();
                console.log('[Waveform] Upgraded to real Spotify analysis data.');
            }
        }
    } catch (err) { /* graceful fallback to synthetic */ }
}

function clearWaveform() {
    const canvas = document.getElementById('waveform-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

let isScrubbingRuler = false;

let scrubCooldown = 0; // timestamp until we ignore Spotify position updates

function handleRulerScrub(e) {
    const container = document.getElementById('timeline-container');
    const tracks = document.getElementById('timeline-tracks');
    const containerRect = container.getBoundingClientRect();

    // clickX relative to the container left edge + scrollLeft for full track width
    const clickX = e.clientX - containerRect.left + container.scrollLeft;
    const totalWidth = tracks.scrollWidth || tracks.clientWidth || 1200;
    const pct = Math.max(0, Math.min(1, clickX / totalWidth));

    const newTime = pct * TRACK_LENGTH_MS;
    arranger.playheadMs = newTime;

    const hPct = pct * 100;
    document.getElementById('timeline-playhead').style.left = `${hPct}%`;
}

document.getElementById('timeline-ruler')?.addEventListener('mousedown', async (e) => {
    isScrubbingRuler = true;
    handleRulerScrub(e);
});

window.addEventListener('mousemove', (e) => {
    if (isScrubbingRuler) {
        handleRulerScrub(e);
    }
});

window.addEventListener('mouseup', async (e) => {
    if (isScrubbingRuler) {
        isScrubbingRuler = false;
        // Give a 1.5s cooldown before allowing Spotify to override the position again
        scrubCooldown = Date.now() + 1500;
        if (arranger.spotifySync) {
            try {
                await fetch(`${BASE_URL}/api/spotify/control`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'seek', position_ms: arranger.playheadMs })
                });
            } catch (e) { }
        }
    }
});

window.deleteArrangement = function (id) {
    if (!confirm("Are you sure you want to delete this arrangement?")) return;
    config.arrangements = config.arrangements.filter(a => a.id !== id);
    saveConfig();
    if (!config.arrangements.find(a => a.track_id === arranger.currentTrackId)) {
        arranger.currentTrackId = null;
        document.getElementById('arranger-current-song-label').innerText = 'Unassigned (Sandbox)';
    }
    renderLibraryList();
};

document.getElementById('btn-arrange-save')?.addEventListener('click', () => {
    if (!arranger.currentTrackId) {
        showToast('Sandbox Session', 'This is a sandbox session! Please wait for a Spotify song to load before saving.', true);
        return;
    }
    let arr = config.arrangements.find(a => a.track_id === arranger.currentTrackId);
    if (!arr) {
        // Automatically create the arrangement
        arr = {
            id: 'arr_' + Date.now(),
            track_id: arranger.currentTrackId,
            track_name: currentSpotifyInfo ? currentSpotifyInfo.track_name : 'Unknown Track',
            artist_name: currentSpotifyInfo ? currentSpotifyInfo.artist_name : 'Unknown Artist',
            duration_ms: TRACK_LENGTH_MS,
            blocks: [],
            automation: []
        };
        config.arrangements.push(arr);
        document.getElementById('arranger-current-song-label').innerText = `${arr.track_name} - ${arr.artist_name}`;
    }

    arr.blocks = JSON.parse(JSON.stringify(arranger.blocks));
    arr.automation = JSON.parse(JSON.stringify(arranger.automation || []));
    saveConfig();
    const btn = document.getElementById('btn-arrange-save');
    btn.innerText = 'Saved!';
    btn.classList.add('success-btn');
    btn.classList.remove('accent-btn');
    setTimeout(() => {
        btn.innerText = 'Save';
        btn.classList.remove('success-btn');
        btn.classList.add('accent-btn');
    }, 2000);
});

// --- Theme Switcher & Telemetry Subsystem ---
const themeSwitcher = document.getElementById('theme-switcher');

function initTheme() {
    let savedTheme = localStorage.getItem('symphony_theme') || 'theme-amber';
    if (savedTheme === 'theme-obsidian') savedTheme = 'theme-amber';
    if (savedTheme === 'theme-oled') savedTheme = 'theme-monochrome';
    document.documentElement.className = savedTheme;
    if (themeSwitcher) themeSwitcher.value = savedTheme;
}

if (themeSwitcher) {
    themeSwitcher.addEventListener('change', (e) => {
        const theme = e.target.value;
        document.documentElement.className = theme;
        localStorage.setItem('symphony_theme', theme);
        showToast('Hardware Profile Loaded', `Switched theme to ${themeSwitcher.options[themeSwitcher.selectedIndex].text}.`);
    });
}

initTheme();
initStandardSwatches();

// Polling for telemetry & VU audio levels
async function pollTelemetry() {
    try {
        const res = await fetch(`${BASE_URL}/api/telemetry`);
        if (res.ok) {
            const data = await res.json();
            const rmsEl = document.getElementById('telemetry-rms');
            if (rmsEl) rmsEl.innerText = (data.rms || 0).toFixed(3);

            const bulbEl = document.getElementById('header-bulb-state');
            if (bulbEl) {
                bulbEl.innerText = data.bulb_status === 'Connected' ? 'LINKED' : 'OFFLINE';
                bulbEl.style.color = data.bulb_status === 'Connected' ? 'var(--accent-success)' : 'var(--accent-danger)';
            }

            // VU Bars
            const bassBar = document.getElementById('vu-bar-bass');
            const midBar = document.getElementById('vu-bar-mid');
            const trebleBar = document.getElementById('vu-bar-treble');

            if (bassBar) {
                const bassH = Math.min(100, Math.max(10, (data.bass || 0) * 400));
                bassBar.style.height = `${bassH}%`;
                if (bassH > 30) bassBar.classList.add('active-bass'); else bassBar.classList.remove('active-bass');
            }

            if (midBar) {
                const midH = Math.min(100, Math.max(10, (data.mid || 0) * 400));
                midBar.style.height = `${midH}%`;
                if (midH > 30) midBar.classList.add('active-mid'); else midBar.classList.remove('active-mid');
            }

            if (trebleBar) {
                const trebleH = Math.min(100, Math.max(10, (data.treble || 0) * 400));
                trebleBar.style.height = `${trebleH}%`;
                if (trebleH > 30) trebleBar.classList.add('active-treble'); else trebleBar.classList.remove('active-treble');
            }
        }
    } catch (e) { }
}

setInterval(pollTelemetry, 250);
