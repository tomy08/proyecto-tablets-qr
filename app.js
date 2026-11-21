'use strict';

/* ================= Datos y constantes ================= */
const KEY = 'tablets_v1';
const PANOL = 'En Pañol';
const LOCAL = 'En Uso Local (Oficina)';
const EXTERNO = 'En Uso Externo (Home Office)';
const ST = 'En Servicio Técnico';
const ESTADOS = [PANOL, LOCAL, EXTERNO, ST];
const COLOR = { [PANOL]: '#2e7d32', [LOCAL]: '#1565c0', [EXTERNO]: '#6a1b9a', [ST]: '#e65100' };
const FISICOS = ['Excelente', 'Bueno', 'Con marcas de uso', 'Dañada'];

const now = () => new Date().toLocaleString('es-AR');

// Dos tablets de ejemplo que se cargan la primera vez
const SEED = [
  {
    serial: 'TAB-2024-0001',
    specs: { processor: 'Snapdragon 8 Gen 2', memoryStorage: '8 GB RAM / 256 GB', screenSize: '11"' },
    connectivity: { ports: ['USB-C', 'Jack 3.5'], network: ['Wi-Fi', '4G/5G', 'Bluetooth'] },
    estado: PANOL,
    estadoFisico: 'Excelente',
    historial: [{ fecha: now(), accion: 'Alta', detalle: 'Ejemplo precargado' }],
  },
  {
    serial: 'TAB-2024-0002',
    specs: { processor: 'MediaTek Dimensity 9000', memoryStorage: '6 GB RAM / 128 GB', screenSize: '10.4"' },
    connectivity: { ports: ['USB-C', 'microSD'], network: ['Wi-Fi', 'Bluetooth'] },
    estado: EXTERNO,
    legajo: '10452',
    tarea: 'Relevamiento en campo zona norte',
    historial: [{ fecha: now(), accion: 'Préstamo', detalle: 'Ejemplo precargado' }],
  },
];

/* ================= Persistencia (localStorage) ================= */
function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    alert('No se pudieron guardar los cambios en este navegador.');
  }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* datos corruptos o storage bloqueado: se usan los ejemplos */ }
  save(SEED);
  return structuredClone(SEED);
}

/* ================= QR: decodificar y generar ================= */
const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isStrArr = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Valida el JSON del QR. Lanza Error con un mensaje claro si algo falla. */
function parseQR(raw) {
  let o;
  try {
    o = JSON.parse(raw);
  } catch {
    throw new Error('El QR no contiene un JSON válido.');
  }
  if (!o || !isStr(o.serial)) throw new Error('Falta el campo "serial".');
  const s = o.specs, c = o.connectivity;
  if (!s || !isStr(s.processor) || !isStr(s.memoryStorage) || !isStr(s.screenSize))
    throw new Error('"specs" incompleto: requiere processor, memoryStorage y screenSize.');
  if (!c || !isStrArr(c.ports) || !isStrArr(c.network))
    throw new Error('"connectivity" requiere "ports" y "network" como listas de texto.');
  return {
    serial: o.serial.trim(),
    specs: { processor: s.processor, memoryStorage: s.memoryStorage, screenSize: s.screenSize },
    connectivity: { ports: c.ports, network: c.network },
  };
}

const toQR = (t) => JSON.stringify({ serial: t.serial, specs: t.specs, connectivity: t.connectivity });

function drawQR(el, text) {
  el.innerHTML = '';
  if (typeof QRCode === 'undefined') {
    el.textContent = 'Sin conexión: no se pudo cargar el generador de QR. Copiá el JSON.';
    return;
  }
  new QRCode(el, { text, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.M });
}

function downloadQR(el, serial) {
  const canvas = el.querySelector('canvas');
  if (!canvas) return;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `QR-${serial}.png`;
  a.click();
}

/* ================= Estado de la app ================= */
let tablets = load();
let tab = 'buscar';
let sel = null;     // serie de la tablet abierta
let draft = null;   // datos de un QR no registrado, para precargar el alta
let creada = null;  // tablet recién dada de alta

const app = document.getElementById('app');
const $ = (q) => app.querySelector(q);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const find = (serial) => tablets.find((t) => t.serial.toLowerCase() === String(serial).trim().toLowerCase());
const csv = (v) => v.split(',').map((x) => x.trim()).filter(Boolean);
const badge = (estado, big = false) => `<span class="badge ${big ? 'big' : ''}" style="background:${COLOR[estado]}">${esc(estado)}</span>`;
const row = (k, v) => `<div class="row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`;

function move(serial, changes, accion, detalle) {
  tablets = tablets.map((t) => {
    if (t.serial !== serial) return t;
    const nt = { ...t, ...changes, historial: [{ fecha: now(), accion, detalle }, ...t.historial] };
    Object.keys(nt).forEach((k) => nt[k] === undefined && delete nt[k]);
    return nt;
  });
  save(tablets);
  render();
}

function abrir(serial) { sel = serial; render(); }

function handleCode(raw) {
  let data;
  try {
    data = parseQR(raw);
  } catch (e) {
    const t = find(raw); // QR que trae sólo el número de serie
    if (t) return abrir(t.serial);
    return alert('QR inválido: ' + e.message);
  }
  const t = find(data.serial);
  if (t) return abrir(t.serial);
  if (confirm(`${data.serial} no está en el inventario. ¿Darla de alta?`)) {
    draft = data;
    sel = null;
    creada = null;
    tab = 'alta';
    render();
  }
}

/* ================= Render principal ================= */
function render() {
  stopCamera();
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', !sel && b.dataset.tab === tab));
  const t = sel && find(sel);
  if (t) renderFicha(t);
  else if (tab === 'buscar') renderBuscar();
  else if (tab === 'alta') renderAlta();
  else renderInventario();
  window.scrollTo(0, 0);
}

document.querySelectorAll('#tabs button').forEach((b) => {
  b.onclick = () => { sel = null; creada = null; tab = b.dataset.tab; render(); };
});

/* ---------- Escanear / buscar ---------- */
function renderBuscar() {
  app.innerHTML = `
    <h2>Escanear QR</h2>
    <div class="cam"><video id="video" playsinline muted></video><div class="mira"></div></div>
    <p id="camMsg" class="muted">Iniciando cámara…</p>
    <div class="card">
      <h3>¿QR dañado? Buscar por N° de serie</h3>
      <form id="fBuscar" class="inline">
        <input id="serial" placeholder="Ej: TAB-2024-0001" autocomplete="off">
        <button class="btn">Buscar</button>
      </form>
    </div>`;
  $('#fBuscar').onsubmit = (e) => {
    e.preventDefault();
    const v = $('#serial').value.trim();
    if (!v) return alert('Ingresá un número de serie.');
    const t = find(v);
    t ? abrir(t.serial) : alert(`No existe una tablet con serie "${v}".`);
  };
  startCamera();
}

let stream = null, camGen = 0, lockedUntil = 0;

async function startCamera() {
  const gen = ++camGen;
  const video = $('#video'), msg = $('#camMsg');
  if (!navigator.mediaDevices?.getUserMedia) {
    msg.textContent = 'Este navegador no permite usar la cámara (se necesita HTTPS). Usá la búsqueda manual.';
    return;
  }
  if (typeof jsQR === 'undefined') {
    msg.textContent = 'Sin conexión: no se pudo cargar el lector QR. Usá la búsqueda manual.';
    return;
  }
  let s;
  try {
    s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (e) {
    msg.textContent = `Sin acceso a la cámara (${e.name}). Usá la búsqueda manual.`;
    return;
  }
  if (gen !== camGen) return s.getTracks().forEach((tr) => tr.stop()); // el usuario cambió de pantalla
  stream = s;
  video.srcObject = s;
  try { await video.play(); } catch { /* autoplay bloqueado: igual se intenta leer */ }
  msg.textContent = 'Apuntá la cámara al código QR.';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const tick = () => {
    if (gen !== camGen) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA && Date.now() > lockedUntil) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (code?.data) {
        lockedUntil = Date.now() + 2500;
        handleCode(code.data);
      }
    }
    requestAnimationFrame(tick);
  };
  tick();
}

function stopCamera() {
  camGen++;
  if (stream) stream.getTracks().forEach((tr) => tr.stop());
  stream = null;
}

/* ---------- Alta rápida ---------- */
const CAMPOS = [
  ['serial', 'Número de serie'],
  ['processor', 'Procesador'],
  ['memoryStorage', 'Memoria / Almacenamiento'],
  ['screenSize', 'Pantalla (ej. 11")'],
  ['ports', 'Puertos, separados por coma (USB-C, Jack 3.5)'],
  ['network', 'Red, separada por coma (Wi-Fi, 4G/5G, Bluetooth)'],
];

function renderAlta() {
  const d = draft;
  const val = d ? {
    serial: d.serial, processor: d.specs.processor, memoryStorage: d.specs.memoryStorage,
    screenSize: d.specs.screenSize, ports: d.connectivity.ports.join(', '), network: d.connectivity.network.join(', '),
  } : {};

  app.innerHTML = `
    <h2>Alta rápida</h2>
    <form id="fAlta">
      ${CAMPOS.map(([k, label]) => `<input name="${k}" placeholder="${esc(label)}" value="${esc(val[k])}" autocomplete="off">`).join('')}
      <button class="btn">💾 Guardar en Pañol</button>
    </form>
    ${creada ? `
      <div class="card">
        <h3>✅ ${esc(creada.serial)} creada — JSON para el QR</h3>
        <pre class="json">${esc(toQR(creada))}</pre>
        <div id="qr" class="qr"></div>
        <button class="btn" id="copiar">📋 Copiar JSON</button>
        <button class="btn" id="bajar">⬇️ Descargar QR (PNG)</button>
        <button class="btn ghost" id="ver">Ver ficha</button>
      </div>` : ''}`;

  $('#fAlta').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (Object.values(f).some((v) => !String(v).trim())) return alert('Completá todos los campos.');
    const data = {
      serial: f.serial.trim(),
      specs: { processor: f.processor.trim(), memoryStorage: f.memoryStorage.trim(), screenSize: f.screenSize.trim() },
      connectivity: { ports: csv(f.ports), network: csv(f.network) },
    };
    if (find(data.serial)) return alert(`Ya existe una tablet con serie ${data.serial}.`);
    tablets = [{ ...data, estado: PANOL, historial: [{ fecha: now(), accion: 'Alta', detalle: 'Ingreso a Pañol' }] }, ...tablets];
    save(tablets);
    draft = null;
    creada = data;
    render();
  };

  if (creada) {
    const qrEl = $('#qr'), c = creada;
    drawQR(qrEl, toQR(c));
    $('#copiar').onclick = () => navigator.clipboard?.writeText(toQR(c)).then(() => alert('JSON copiado.'), () => alert('No se pudo copiar; seleccionalo a mano.'));
    $('#bajar').onclick = () => downloadQR(qrEl, c.serial);
    $('#ver').onclick = () => { creada = null; abrir(c.serial); };
  }
}

/* ---------- Inventario ---------- */
function renderInventario() {
  app.innerHTML = `
    <h2>Inventario (${tablets.length})</h2>
    <div class="resumen">
      ${ESTADOS.map((e) => `<div style="border-color:${COLOR[e]}"><b style="color:${COLOR[e]}">${tablets.filter((t) => t.estado === e).length}</b><small>${esc(e)}</small></div>`).join('')}
    </div>
    ${tablets.map((t) => `
      <button class="item" data-serial="${esc(t.serial)}">
        <strong>${esc(t.serial)}</strong>${badge(t.estado)}
        ${t.legajo ? `<div class="muted">Legajo ${esc(t.legajo)}</div>` : ''}
      </button>`).join('')}`;
  app.querySelectorAll('[data-serial]').forEach((b) => { b.onclick = () => abrir(b.dataset.serial); });
}

/* ---------- Ficha técnica + acciones ---------- */
const chips = (name, items, checked) => `<div class="chips">${items.map((it, i) => `
  <input type="radio" name="${name}" id="${name}${i}" value="${esc(it)}" ${it === checked ? 'checked' : ''}>
  <label for="${name}${i}">${esc(it)}</label>`).join('')}</div>`;

function renderFicha(t) {
  const enUso = t.estado === LOCAL || t.estado === EXTERNO;

  const prestamo = `
    <form id="fPrestamo" class="card">
      <h3>📤 Préstamo</h3>
      <input name="legajo" placeholder="Legajo del empleado" autocomplete="off">
      ${chips('destino', [LOCAL, EXTERNO], LOCAL)}
      <textarea name="tarea" placeholder="Tarea asignada (opcional)"></textarea>
      <div id="alerta" class="alerta hidden">
        <strong>⚠️ TAREA OBLIGATORIA</strong>
        <p>No se puede despachar a Home Office sin registrar la tarea asignada.</p>
      </div>
      <button class="btn" id="btnPrestar">Confirmar préstamo</button>
    </form>`;

  const devolucion = `
    <form id="fDevolucion" class="card">
      <h3>📥 Devolución</h3>
      <label class="lbl">Estado físico</label>
      ${chips('fisico', FISICOS, null)}
      <textarea name="obs" placeholder="Observaciones (opcional)"></textarea>
      <button class="btn" data-destino="${PANOL}">↩️ Devolver a Pañol</button>
      <button class="btn st" data-destino="${ST}">🔧 Enviar a Servicio Técnico</button>
    </form>`;

  app.innerHTML = `
    <button class="link" id="volver">← Volver</button>
    <h2>${esc(t.serial)}</h2>
    ${badge(t.estado, true)}
    <div class="card">
      <h3>Ficha técnica</h3>
      ${row('Procesador', t.specs.processor)}
      ${row('Memoria', t.specs.memoryStorage)}
      ${row('Pantalla', t.specs.screenSize)}
      ${row('Puertos', t.connectivity.ports.join(' · '))}
      ${row('Red', t.connectivity.network.join(' · '))}
      ${t.estadoFisico ? row('Estado físico', t.estadoFisico) : ''}
    </div>
    ${enUso ? `<div class="card"><h3>Asignación actual</h3>${row('Legajo', t.legajo || '—')}${row('Tarea', t.tarea || '—')}</div>` : ''}
    ${t.estado === PANOL ? prestamo : ''}
    ${enUso ? devolucion : ''}
    ${t.estado === ST ? `<div class="card"><h3>🔧 Servicio Técnico</h3><button class="btn" id="reparada">✅ Reparada → volver a Pañol</button></div>` : ''}
    <details class="card" id="detQR">
      <summary>Ver JSON y QR de esta tablet</summary>
      <pre class="json">${esc(toQR(t))}</pre>
      <div id="qr" class="qr"></div>
      <button class="btn" id="bajar">⬇️ Descargar QR (PNG)</button>
    </details>
    <div class="card">
      <h3>Historial</h3>
      ${t.historial.slice(0, 15).map((h) => `<div class="hist">${esc(h.fecha)} · <b>${esc(h.accion)}</b>${h.detalle ? ' — ' + esc(h.detalle) : ''}</div>`).join('')}
    </div>`;

  $('#volver').onclick = () => { sel = null; render(); };
  $('#detQR').ontoggle = (e) => { if (e.target.open) drawQR($('#qr'), toQR(t)); };
  $('#bajar').onclick = () => downloadQR($('#qr'), t.serial);

  /* Préstamo: alerta visible en vivo si es Home Office sin tarea */
  const fp = $('#fPrestamo');
  if (fp) {
    const alerta = $('#alerta');
    const bloqueado = () => fp.destino.value === EXTERNO && !fp.tarea.value.trim();
    const actualizar = () => {
      const b = bloqueado();
      alerta.classList.toggle('hidden', !b);
      fp.tarea.classList.toggle('input-error', b);
      fp.tarea.placeholder = fp.destino.value === EXTERNO ? 'Tarea asignada (OBLIGATORIA)' : 'Tarea asignada (opcional)';
      $('#btnPrestar').classList.toggle('danger', b);
    };
    fp.oninput = actualizar;
    fp.onchange = actualizar;
    fp.onsubmit = (e) => {
      e.preventDefault();
      const legajo = fp.legajo.value.trim();
      const destino = fp.destino.value;
      const tarea = fp.tarea.value.trim();
      if (!legajo) return alert('Ingresá el legajo del empleado.');
      if (bloqueado()) {
        alerta.classList.remove('shake');
        void alerta.offsetWidth; // reinicia la animación
        alerta.classList.add('shake');
        alerta.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      move(t.serial, { estado: destino, legajo, tarea: tarea || undefined }, 'Préstamo',
        `Legajo ${legajo} → ${destino}${tarea ? ' | Tarea: ' + tarea : ''}`);
    };
  }

  /* Devolución */
  const fd = $('#fDevolucion');
  if (fd) {
    fd.onsubmit = (e) => {
      e.preventDefault();
      const destino = e.submitter?.dataset.destino || PANOL;
      const fisico = fd.fisico.value;
      const obs = fd.obs.value.trim();
      if (!fisico) return alert('Seleccioná el estado físico de la tablet.');
      const estadoFisico = obs ? `${fisico} (${obs})` : fisico;
      move(t.serial, { estado: destino, estadoFisico, legajo: undefined, tarea: undefined }, 'Devolución',
        `Legajo ${t.legajo || '—'} | ${estadoFisico} → ${destino}`);
    };
  }

  const rep = $('#reparada');
  if (rep) rep.onclick = () => move(t.serial, { estado: PANOL, estadoFisico: 'Reparada' }, 'Regreso de S.T.', 'Reparada → En Pañol');
}

render();
