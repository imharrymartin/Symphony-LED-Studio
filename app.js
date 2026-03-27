// State
let config = { colors: [], sequences: [] };

// Elements
const sysStatus = document.getElementById('system-status');
const tabs = document.querySelectorAll('.tab-btn');
const views = document.querySelectorAll('.view');
const quickColor = document.getElementById('quick-color');
const audioDeviceSelect = document.getElementById('audio-device-select');

const BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:8090' : '';

async function fetchConfig() {
    try {
        const res = await fetch(`${BASE_URL}/api/config`);
        config = await res.json();
        
        sysStatus.innerText = 'Server: Online';
        sysStatus.style.color = '#00ff88';
        
        const bStatus = document.getElementById('bulb-status');
        if (config.bulb_status === 'Connected') {
            bStatus.innerText = `Bulb: Linked (${config.bulb_ip})`;
            bStatus.style.color = '#00ff88';
        } else {
            bStatus.innerText = 'Bulb: Offline (Scanning...)';
            bStatus.style.color = '#ff9900';
        }
        
        renderLists();
    } catch(e) {
        sysStatus.innerText = 'Server: Offline';
        sysStatus.style.color = '#ff3366';
        document.getElementById('bulb-status').innerText = 'Bulb: Unknown';
    }
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
    } catch(e) {
        console.error("Failed to fetch audio devices", e);
    }
}

async function saveConfig() {
    try {
        await fetch(`${BASE_URL}/api/config`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(config)
        });
        renderLists();
    } catch(e) {
        console.error('Failed to save', e);
    }
}

async function testColor(rgb) {
    fetch(`${BASE_URL}/api/action`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'test_color', r: rgb.r, g: rgb.g, b: rgb.b})
    }).catch(e=>{});
}

window.playSequence = async function(id) {
    fetch(`${BASE_URL}/api/action`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'sequence', id: id})
    }).catch(e=>{});
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
}));

document.getElementById('btn-on').addEventListener('click', () => fetch(`${BASE_URL}/api/action`, {method:'POST', body: JSON.stringify({action: 'on'})}));
document.getElementById('btn-off').addEventListener('click', () => fetch(`${BASE_URL}/api/action`, {method:'POST', body: JSON.stringify({action: 'off'})}));

let debounce;
quickColor.addEventListener('input', (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
        const rgb = hexToRgb(e.target.value);
        if(rgb) testColor(rgb);
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
            method:'POST', headers: {'Content-Type': 'application/json'},
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
    if(config.colors.length === 0) return alert('Create a color first!');
    fetch(`${BASE_URL}/api/audio_sync`, {
        method:'POST', headers: {'Content-Type': 'application/json'},
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
    fetch(`${BASE_URL}/api/audio_sync`, {method:'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'stop'})});
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
    btn.innerText = '⌛';
    fetchAudioDevices().then(() => {
        setTimeout(() => btn.innerText = '🔄', 500);
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
            method:'POST', headers: {'Content-Type': 'application/json'},
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
        method:'POST', headers: {'Content-Type': 'application/json'},
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
    fetch(`${BASE_URL}/api/screen_sync`, {method:'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'stop'})});
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
        if(!el.value) el.placeholder = 'Click here & press a key';
    });
    el.addEventListener('keydown', (e) => {
        e.preventDefault();
        const keys = [];
        if (e.ctrlKey) keys.push('ctrl');
        if (e.shiftKey) keys.push('shift');
        if (e.altKey) keys.push('alt');
        
        let key = e.key.toLowerCase();
        if(['control', 'shift', 'alt', 'meta'].includes(key)) return;
        if(key === ' ') key = 'space';
        
        keys.push(key);
        el.value = keys.join('+');
        el.blur();
    });
}
setupHotkeyRecorder('color-hotkey');
setupHotkeyRecorder('seq-hotkey');

function isHotkeyUsed(hk) {
    if(!hk) return false;
    for(let c of config.colors) if(c.hotkey === hk) return true;
    for(let s of config.sequences) if(s.hotkey === hk) return true;
    return false;
}

window.clearColorHotkey = function(index, e) {
    if(e) e.stopPropagation();
    config.colors[index].hotkey = '';
    saveConfig();
}
window.clearSeqHotkey = function(index, e) {
    if(e) e.stopPropagation();
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

    if (isHotkeyUsed(hk)) return err.innerText = `Error: Hotkey "${hk}" is already in use by another action!`;

    const newColor = { id: 'c_' + Date.now(), name: name, hex: hex, rgb: rgb, hotkey: hk };
    config.colors.push(newColor);
    saveConfig();
    
    document.getElementById('color-name').value = '';
    document.getElementById('color-hotkey').value = '';
});

const stepsContainer = document.getElementById('seq-steps-container');
document.getElementById('btn-add-step').addEventListener('click', () => {
    if(config.colors.length === 0) {
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
    if(stepDivs.length === 0) return err.innerText = "Error: Sequence must have at least one step.";

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

window.editSequence = function(index) {
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
    window.scrollTo({top: 0, behavior: 'smooth'});
}

function renderLists() {
    const clist = document.getElementById('colors-list');
    const slist = document.getElementById('seqs-list');
    
    clist.innerHTML = config.colors.map((c, i) => `
        <div class="list-item">
            <div class="list-item-content" style="display:flex; align-items:center;">
                <button class="small-btn" style="padding:4px 10px; margin-right:12px; border-radius:50%; background:rgba(0,255,136,0.15); color:#00ff88; border:1px solid #00ff88;" onclick="testColor({r:${c.rgb.r}, g:${c.rgb.g}, b:${c.rgb.b}})" title="Play Color">▶</button>
                <div style="flex:1;">
                    <h4 style="margin:0;"><span class="color-preview" style="background:${c.hex}"></span> ${c.name}</h4>
                    <div style="margin-top:6px;">
                        ${c.hotkey ? `<span class="badge" style="cursor:pointer" onclick="startRebindColor(${i})" title="Rebind">[ ${c.hotkey} ] <span style="color:#ff3366; margin-left:5px; padding-left:7px; border-left:1px solid rgba(255,255,255,0.3);" onclick="clearColorHotkey(${i}, event)" title="Remove Hotkey">×</span></span>` : `<button class="small-btn" style="padding:2px 8px; font-size:0.75rem;" onclick="startRebindColor(${i})">+ Add Hotkey</button>`}
                    </div>
                </div>
            </div>
            <button class="del-btn" onclick="deleteColor(${i})">Delete</button>
        </div>
    `).join('') || '<p class="desc">No colors saved.</p>';

    slist.innerHTML = config.sequences.map((s, i) => `
        <div class="list-item">
            <div class="list-item-content" style="display:flex; align-items:flex-start;">
                <button class="small-btn" style="padding:4px 10px; margin-right:12px; margin-top:2px; border-radius:50%; background:rgba(0,255,136,0.15); color:#00ff88; border:1px solid #00ff88;" onclick="playSequence('${s.id}')" title="Play Sequence">▶</button>
                <div style="flex:1;">
                    <h4 style="margin:0;">${s.name} ${s.loop === false ? '<small style="color:#667; font-weight:normal">(1 shot)</small>' : ''}</h4>
                    <div style="margin-top:6px;">
                        ${s.hotkey ? `<span class="badge" style="cursor:pointer" onclick="startRebindSeq(${i})" title="Rebind">[ ${s.hotkey} ] <span style="color:#ff3366; margin-left:5px; padding-left:7px; border-left:1px solid rgba(255,255,255,0.3);" onclick="clearSeqHotkey(${i}, event)" title="Remove Hotkey">×</span></span>` : `<button class="small-btn" style="padding:2px 8px; font-size:0.75rem;" onclick="startRebindSeq(${i})">+ Add Hotkey</button>`}
                    </div>
                    <small style="color:#8b9bb4; display:block; margin-top:6px;">${s.steps.length} logic steps built.</small>
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
    if(currentVal && Array.from(audioSelect.options).some(o => o.value == currentVal)) {
        audioSelect.value = currentVal;
    }
}

let rebindingTarget = null;
window.startRebindColor = function(index) { rebindingTarget = { type: 'color', index: index }; document.getElementById('rebind-overlay').style.display = 'flex'; };
window.startRebindSeq = function(index) { rebindingTarget = { type: 'sequence', index: index }; document.getElementById('rebind-overlay').style.display = 'flex'; };

window.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('rebind-overlay');
    if (overlay.style.display !== 'flex') return;
    
    e.preventDefault();
    const keys = [];
    if (e.ctrlKey) keys.push('ctrl');
    if (e.shiftKey) keys.push('shift');
    if (e.altKey) keys.push('alt');
    
    let key = e.key.toLowerCase();
    if(['control', 'shift', 'alt', 'meta'].includes(key)) return;
    if(key === ' ') key = 'space';
    
    keys.push(key);
    const finalKey = keys.join('+');
    
    if (isHotkeyUsed(finalKey)) { alert(`Hotkey ${finalKey} is already in use by another action!`); return; }
    
    if (rebindingTarget.type === 'color') config.colors[rebindingTarget.index].hotkey = finalKey;
    else config.sequences[rebindingTarget.index].hotkey = finalKey;
    
    saveConfig();
    overlay.style.display = 'none';
});

document.getElementById('refresh-devices')?.addEventListener('click', async () => {
    sysStatus.innerText = 'Rescanning Hardware...';
    await fetch(`${BASE_URL}/api/action`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'rescan_devices'})
    });
    setTimeout(fetchAudioDevices, 1500);
});

fetchConfig();
fetchAudioDevices();
