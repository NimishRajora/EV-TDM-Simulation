/* EV Sensor TDM Simulation (simple version)
   Part 1: core logic (no DOM). Part 2: user interface. */

// ===== PART 1: CORE LOGIC =====
// Each sensor owns a fixed time slot. 'step' = typical change per update.
const SENSORS = [
  { id: 'S1', slot: 'T1', name: 'Battery Voltage',     unit: 'V',   min: 36, max: 60,   def: 48,   dec: 1, step: 0.4, color: '#2563eb' },
  { id: 'S2', slot: 'T2', name: 'Battery Current',     unit: 'A',   min: 0,  max: 100,  def: 20,   dec: 0, step: 4,   color: '#0d9488' },
  { id: 'S3', slot: 'T3', name: 'Battery Temperature', unit: '°C',  min: 15, max: 60,   def: 32,   dec: 1, step: 0.5, color: '#ea580c' },
  { id: 'S4', slot: 'T4', name: 'Motor RPM',           unit: 'RPM', min: 0,  max: 6000, def: 1500, dec: 0, step: 150, color: '#7c3aed' },
  { id: 'S5', slot: 'T5', name: 'State of Charge',     unit: '%',   min: 0,  max: 100,  def: 85,   dec: 1, step: 0.3, color: '#db2777' }
];
const round = (v, d) => Number(v.toFixed(d));

function defaultReadings() {
  const r = {}; SENSORS.forEach(s => { r[s.id] = s.def; }); return r;
}

// Sensor generator: small random steps, always inside the allowed range.
function generateSensorData(prev) {
  const next = {};
  SENSORS.forEach(s => {
    const drift = s.id === 'S5' ? -s.step * 0.3 : 0;              // SOC slowly falls
    const v = (prev[s.id] ?? s.def) + (Math.random() * 2 - 1) * s.step + drift;
    next[s.id] = round(Math.min(s.max, Math.max(s.min, v)), s.dec);
  });
  return next;
}

// MUX: one record per sensor, each placed in its own slot of the frame.
function multiplex(data, frameNumber) {
  return { frameNumber, slots: SENSORS.map(s => ({ slotId: s.slot, sensorId: s.id, value: data[s.id] })) };
}

// Channel model: every slot is dropped with the given probability.
function applyChannelLoss(frame, probability, random = Math.random) {
  const dropped = [];
  const slots = frame.slots.filter(r => { if (random() < probability) { dropped.push(r.slotId); return false; } return true; });
  return { frame: { frameNumber: frame.frameNumber, slots }, dropped };
}

// DEMUX: rebuild each reading from its slot ID + sensor ID (not from array order).
function demultiplex(frame) {
  const outputs = {};
  SENSORS.forEach(s => { outputs[s.id] = { value: null, status: 'missing' }; });
  const records = frame && Array.isArray(frame.slots) ? frame.slots : [];
  records.forEach(r => {
    const s = r ? SENSORS.find(x => x.slot === r.slotId) : null;
    const ok = s && r.sensorId === s.id && typeof r.value === 'number' && isFinite(r.value) && r.value >= s.min && r.value <= s.max;
    if (ok) outputs[s.id] = { value: r.value, status: 'ok' };
    else if (s) outputs[s.id].status = 'invalid';                  // never guess a value
  });
  const missing = SENSORS.filter(s => outputs[s.id].status !== 'ok').map(s => s.slot);
  return { outputs, missing };
}

// Result is computed from the real DEMUX output, not hard-coded.
function compareReadings(original, result) {
  const matches = SENSORS.filter(s => result.outputs[s.id].status === 'ok' && result.outputs[s.id].value === original[s.id]).length;
  const received = SENSORS.filter(s => result.outputs[s.id].status === 'ok').length;
  return matches === SENSORS.length ? 'Successful' : received > 0 ? 'Partial data' : 'Failed';
}

// ===== PART 2: USER INTERFACE =====
function startUI() {
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const state = { running: false, paused: false, busy: false, loopActive: false, token: 0, frame: 0, data: defaultReadings(), history: [] };
  const show = (s, v) => v.toFixed(s.dec);

  $('tx').innerHTML = SENSORS.map(s => `<div class="row" style="--c:${s.color}"><span class="tag">${s.id}</span>
    <label for="in-${s.id}">${s.name}</label><span class="val"><input id="in-${s.id}" type="number" step="any" min="${s.min}" max="${s.max}" value="${s.def}" disabled><em>${s.unit}</em></span></div>`).join('');
  $('rx').innerHTML = SENSORS.map(s => `<div class="row" style="--c:${s.color}"><span class="tag">${s.id}</span>
    <span class="name">${s.name}</span><span class="val"><span id="rx-${s.id}">—</span><em>${s.unit}</em></span></div>`).join('');

  function drawSlots(frame, marks) {
    $('slots').innerHTML = SENSORS.map(s => {
      const rec = frame && frame.slots.find(r => r.slotId === s.slot);
      return `<div class="slot ${marks[s.slot] || ''}" style="--c:${s.color}"><small>${s.slot}</small><b>${rec ? rec.value : '·'}</b></div>`;
    }).join('');
  }
  function drawReceiver(result) {
    SENSORS.forEach(s => {
      const o = result ? result.outputs[s.id] : null;
      $('rx-' + s.id).innerHTML = !o ? '—' : o.status === 'ok' ? show(s, o.value) : '<span class="lost">Missing</span>';
    });
  }
  function drawButtons() {
    const [cls, text] = !state.running ? ['', 'Stopped'] : state.paused ? ['paused', 'Paused'] : ['running', 'Running'];
    $('status').className = 'status ' + cls; $('status').textContent = text;
    $('btnRun').textContent = !state.running ? 'Start' : state.paused ? 'Resume' : 'Pause';
    $('btnOne').disabled = state.running && !state.paused;
  }
  const message = t => { $('msg').textContent = t || ''; };

  // Next readings: generated (automatic) or validated from the boxes (manual).
  function nextData() {
    if ($('mode').value === 'auto') {
      state.data = generateSensorData(state.data);
      SENSORS.forEach(s => { $('in-' + s.id).value = state.data[s.id]; });
      return state.data;
    }
    const manual = {};
    for (const s of SENSORS) {
      const raw = $('in-' + s.id).value.trim(), v = Number(raw);
      if (raw === '' || !isFinite(v) || v < s.min || v > s.max) { message(`${s.name} must be between ${s.min} and ${s.max} ${s.unit}.`); return null; }
      manual[s.id] = round(v, s.dec);
    }
    state.data = manual;
    return manual;
  }

  // One frame: MUX → channel (slot by slot) → DEMUX → compare.
  async function sendFrame() {
    if (state.busy) return;                                          // no overlapping frames
    message('');
    const data = nextData();
    if (!data) { if (state.running) { state.paused = true; drawButtons(); } return; }
    state.busy = true;
    const token = state.token, slotMs = Number($('speed').value);
    const frame = multiplex(data, ++state.frame);
    const channel = $('loss').checked ? applyChannelLoss(frame, 0.3) : { frame, dropped: [] };
    const marks = {};
    for (const rec of frame.slots) {
      if (token !== state.token) return;                             // reset happened
      marks[rec.slotId] = 'active';
      drawSlots(frame, marks);
      $('frameInfo').textContent = `Frame #${state.frame} · sending slot ${rec.slotId}`;
      await sleep(slotMs);
      marks[rec.slotId] = channel.dropped.includes(rec.slotId) ? 'lost' : '';
    }
    if (token !== state.token) return;
    drawSlots(frame, marks);
    const result = demultiplex(channel.frame);
    const verdict = compareReadings(data, result);
    drawReceiver(result);
    $('frameInfo').textContent = `Frame #${state.frame} received`;
    $('result').textContent = verdict;
    $('result').className = 'pill ' + (verdict === 'Successful' ? 'ok' : verdict === 'Partial data' ? 'partial' : 'failed');
    state.history.unshift({ n: state.frame, lost: result.missing.join(', ') || 'none', verdict });
    state.history.length = Math.min(state.history.length, 5);
    $('hist').innerHTML = state.history.map(h => `<tr><td>${h.n}</td><td>${h.lost}</td><td>${h.verdict}</td></tr>`).join('');
    state.busy = false;
  }

  async function loop() {
    const token = state.token;
    while (state.running && !state.paused && token === state.token) { await sendFrame(); await sleep(300); }
  }
  function toggleRun() {
    if (state.running && !state.paused) { state.paused = true; drawButtons(); return; }   // pause
    state.running = true; state.paused = false; drawButtons();                            // start / resume
    if (state.loopActive) return;                                                         // never two loops
    state.loopActive = true;
    loop().finally(() => { state.loopActive = false; });
  }
  function reset() {
    state.token++; Object.assign(state, { running: false, paused: false, busy: false, loopActive: false, frame: 0, data: defaultReadings(), history: [] });
    SENSORS.forEach(s => { $('in-' + s.id).value = s.def; });
    drawSlots(null, {}); drawReceiver(null);
    $('frameInfo').textContent = 'No frame sent yet'; $('result').textContent = '—'; $('result').className = 'pill'; $('hist').innerHTML = '';
    message(''); drawButtons();
  }

  $('btnRun').onclick = toggleRun;
  $('btnOne').onclick = () => { if (!(state.running && !state.paused)) sendFrame(); };
  $('btnReset').onclick = reset;
  $('speed').oninput = () => { $('speedTxt').textContent = $('speed').value; };
  $('mode').onchange = () => {
    const manual = $('mode').value === 'manual';
    SENSORS.forEach(s => { $('in-' + s.id).disabled = !manual; });
    message(manual ? 'Manual mode: edit the values, then press Send one frame.' : '');
  };
  reset();
}

if (typeof document !== 'undefined') startUI();
if (typeof module !== 'undefined') module.exports = { SENSORS, multiplex, demultiplex, applyChannelLoss, compareReadings, generateSensorData };
