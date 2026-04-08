import { sb, getEmpresaId, getCurrentUser } from './supabase.js'

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
let currentUser = null
let empresaId = null
let currentEstado = 'todos'
let currentSearch = ''
let calDate = new Date()
let editClienteId = null
let editAsesorId = null
let selectedAsesorId = null

// ═══════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════
async function login() {
  const email = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value
  const errEl = document.getElementById('login-err')
  errEl.style.display = 'none'

  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) { errEl.style.display = 'block'; errEl.textContent = 'Correo o contraseña incorrectos'; return }

  currentUser = data.user
  await initApp()
}

async function register() {
  const email = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value
  const errEl = document.getElementById('login-err')
  errEl.style.display = 'none'

  if (!email || !password) { errEl.style.display = 'block'; errEl.textContent = 'Completa email y contraseña'; return }

  const { data, error } = await sb.auth.signUp({ email, password })
  if (error) { errEl.style.display = 'block'; errEl.textContent = error.message; return }

  currentUser = data.user

  const nombreEmpresa = prompt('¿Nombre de tu empresa?') || 'Mi Empresa'
  const { data: empresa } = await sb.from('empresas').insert([{ nombre: nombreEmpresa }]).select().single()

  await sb.from('usuarios').insert([{
    id: currentUser.id, email: currentUser.email,
    empresa_id: empresa.id, rol: 'admin', nombre: 'Administrador'
  }])

  await initApp()
}

async function logout() {
  if (!confirm('¿Cerrar sesión?')) return
  await sb.auth.signOut()
  location.reload()
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
async function initApp() {
  empresaId = await getEmpresaId()
  const userData = await getCurrentUser()

  // Guard: si no hay empresaId, mostrar error claro en lugar de queries rotas
  if (!empresaId) {
    console.error('No se encontró empresa_id para este usuario. Verifica la tabla usuarios.')
    const errEl = document.getElementById('login-err')
    if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Error: usuario sin empresa asignada. Contacta al administrador.' }
    await sb.auth.signOut()
    return
  }

  document.getElementById('auth').classList.add('hidden')
  document.getElementById('app').classList.remove('hidden')

  if (userData) {
    document.getElementById('sidebar-name').textContent = userData.nombre || userData.email
    document.getElementById('sidebar-role').textContent = userData.rol === 'admin' ? 'Administrador' : 'Usuario'
    document.getElementById('sidebar-av').textContent = (userData.nombre || userData.email || 'U').substring(0,2).toUpperCase()
    if (userData.rol === 'admin') document.body.classList.add('is-admin')
  }

  nav('dashboard')
}

// Check session on load
sb.auth.getSession().then(({ data: { session } }) => {
  if (session) { currentUser = session.user; initApp() }
})

// ═══════════════════════════════════════════
// NAV
// ═══════════════════════════════════════════
function nav(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'))
  const page = document.getElementById('page-' + id)
  if (page) page.classList.add('active')
  document.querySelectorAll('.ni').forEach(n => {
    if ((n.getAttribute('onclick') || '').includes(`'${id}'`)) n.classList.add('active')
  })
  const loaders = { dashboard: loadDashboard, leads: loadLeads, agenda: renderCal, instalaciones: loadInstalaciones, recordatorios: loadRecordatorios, reportes: loadReportes, asesores: loadAsesores, usuarios: loadUsuarios }
  if (loaders[id]) loaders[id]()
}

// ═══════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════
async function openModal(id) {
  document.getElementById(id).classList.add('open')
  if (id === 'm-cliente' || id === 'm-visita' || id === 'm-inst') {
    const asesores = await fetchAsesores()
    if (id === 'm-cliente') renderAsesorGrid(asesores, 'asesor-sel-nc')
    if (id === 'm-visita') {
      fillSelect('v-asesor', asesores, a => ({ v: a.id, t: a.nombre }))
      const clientes = await fetchClientes()
      fillSelect('v-cliente', clientes, c => ({ v: c.id, t: `${c.nombre} — ${c.telefono}` }))
    }
    if (id === 'm-inst') {
      const clientes = await fetchClientes()
      fillSelect('i-cliente', clientes, c => ({ v: c.id, t: `${c.nombre} — ${c.telefono}` }))
    }
  }
}

function closeModal(id) { document.getElementById(id).classList.remove('open') }

document.querySelectorAll('.overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open') }))
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.overlay.open').forEach(m => m.classList.remove('open')) })

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════
function toast(msg, color = 'var(--green)') {
  const t = document.createElement('div')
  t.className = 'toast'; t.style.background = color; t.style.color = '#fff'; t.textContent = msg
  document.body.appendChild(t); setTimeout(() => t.remove(), 2800)
}

function fillSelect(id, items, mapper) {
  const sel = document.getElementById(id)
  if (!sel) return
  sel.innerHTML = items.map(x => { const o = mapper(x); return `<option value="${o.v}">${o.t}</option>` }).join('')
}

function renderAsesorGrid(asesores, containerId) {
  const container = document.getElementById(containerId)
  if (!container) return
  if (!asesores.length) { container.innerHTML = '<div style="color:var(--text3);font-size:12px">No hay asesores</div>'; return }
  container.innerHTML = asesores.map((a, i) =>
    `<div class="ac${i === 0 ? ' sel' : ''}" onclick="selectAsesor(this,'${a.id}')">
      <div class="ap" style="background:${a.bg_color};color:${a.color}">${a.iniciales}</div>
      <div class="an">${a.nombre.split(' ')[0]}</div>
    </div>`
  ).join('')
  if (asesores[0]) selectedAsesorId = asesores[0].id
}

function selectAsesor(el, id) {
  el.closest('.asesor-grid').querySelectorAll('.ac').forEach(c => c.classList.remove('sel'))
  el.classList.add('sel')
  selectedAsesorId = id
}

function toggleProd(el) { el.classList.toggle('sel') }
function setChip(el) { el.closest('.filters').querySelectorAll('.chip').forEach(c => c.classList.remove('active')); el.classList.add('active') }
function fmtFecha(f) { if (!f) return '—'; const p = f.split('-'); return `${p[2]}/${p[1]}/${p[0]}` }
function sbClass(s) { return 's-' + s }
function sbText(s) { return { nuevo: '● Nuevo', proceso: '● En proceso', cotizado: '● Cotizado', cerrado: '● Cerrado', perdido: '● Perdido' }[s] || s }
function initiales(n) { return n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() }

function globalSearch(v) {
  if (v.length < 2) return
  currentSearch = v; currentEstado = 'todos'
  nav('leads')
  document.getElementById('lead-search').value = v
}

// ═══════════════════════════════════════════
// FETCH HELPERS
// ═══════════════════════════════════════════
async function fetchAsesores() {
  if (!empresaId) return []
  const { data } = await sb.from('asesores').select('*').eq('empresa_id', empresaId).eq('activo', true).order('nombre')
  return data || []
}

async function fetchClientes(filters = {}) {
  if (!empresaId) return []
  let q = sb.from('clientes').select(`*, asesores(nombre, iniciales, color, bg_color), cliente_productos(producto)`).eq('empresa_id', empresaId)
  if (filters.estado && filters.estado !== 'todos') q = q.eq('estado', filters.estado)
  if (filters.buscar) q = q.or(`nombre.ilike.%${filters.buscar}%,telefono.ilike.%${filters.buscar}%`)
  q = q.order('created_at', { ascending: false })
  const { data, error } = await q
  if (error) { console.error('fetchClientes error:', error); toast('Error cargando clientes: ' + error.message, 'var(--red)'); return [] }
  return (data || []).map(c => ({
    ...c,
    productos: (c.cliente_productos || []).map(p => p.producto),
    asesor_nombre: c.asesores?.nombre,
    asesor_iniciales: c.asesores?.iniciales,
    asesor_color: c.asesores?.color,
    asesor_bg: c.asesores?.bg_color,
  }))
}

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
async function loadDashboard() {
  try {
    const [clientes, visitas] = await Promise.all([
      sb.from('clientes').select('estado, created_at').eq('empresa_id', empresaId),
      sb.from('visitas').select('fecha, cliente_id, clientes(nombre)').eq('empresa_id', empresaId)
    ])

    const todos = clientes.data || []
    const hoy = new Date().toISOString().split('T')[0]
    const mesActual = new Date().toMonth
    const now = new Date()
    const mes = String(now.getMonth() + 1).padStart(2, '0')
    const anio = String(now.getFullYear())

    const leadsDelMes = todos.filter(c => c.created_at?.startsWith(`${anio}-${mes}`)).length
    const cerradosMes = todos.filter(c => c.estado === 'cerrado' && c.created_at?.startsWith(`${anio}-${mes}`)).length
    const conversion = leadsDelMes > 0 ? Math.round(cerradosMes / leadsDelMes * 100) : 0

    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7)
    const visitasArr = visitas.data || []
    const visitasSem = visitasArr.filter(v => v.fecha >= hoy && v.fecha <= weekEnd.toISOString().split('T')[0]).length
    const visitasHoy = visitasArr.filter(v => v.fecha === hoy).length

    // Badges
    document.getElementById('badge-leads').textContent = leadsDelMes
    document.getElementById('badge-agenda').textContent = visitasSem
    document.getElementById('badge-rem').textContent = visitasHoy

    // Alert bar
    if (visitasHoy > 0) {
      const a = document.getElementById('dash-alert')
      a.style.display = 'flex'
      a.innerHTML = `<b>🔔 ${visitasHoy} visita${visitasHoy > 1 ? 's' : ''} hoy</b> — Recuerda confirmar con los clientes.`
    }

    // Metrics
    document.getElementById('dash-metrics').innerHTML =
      `<div class="mc" onclick="nav('leads')"><div class="mc-icon" style="background:var(--blue-l)">👥</div><div class="mc-val">${leadsDelMes}</div><div class="mc-lbl">Leads este mes</div></div>` +
      `<div class="mc"><div class="mc-icon" style="background:var(--green-l)">💰</div><div class="mc-val">${cerradosMes}</div><div class="mc-lbl">Cierres del mes</div></div>` +
      `<div class="mc"><div class="mc-icon" style="background:var(--wine-l)">📈</div><div class="mc-val">${conversion}%</div><div class="mc-lbl">Conversión</div></div>` +
      `<div class="mc" onclick="nav('agenda')"><div class="mc-icon" style="background:var(--orange-l)">📅</div><div class="mc-val">${visitasSem}</div><div class="mc-lbl">Visitas esta semana</div></div>`

    // Bar chart — últimos 6 meses
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    const porMes = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setMonth(d.getMonth() - 5 + i)
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yy = String(d.getFullYear())
      const n = todos.filter(c => c.created_at?.startsWith(`${yy}-${mm}`)).length
      return { label: meses[d.getMonth()], total: n, actual: i === 5 }
    })
    const maxB = Math.max(...porMes.map(m => m.total), 1)
    document.getElementById('dash-bars').innerHTML = porMes.map(m =>
      `<div class="bg"><div class="bar" style="height:${Math.max(10, Math.round(m.total / maxB * 100))}px;background:${m.actual ? 'var(--wine)' : 'var(--border2)'}"></div><div class="bar-lbl">${m.label}</div></div>`
    ).join('')

    // Funnel
    const estados = ['nuevo', 'proceso', 'cotizado', 'cerrado', 'perdido']
    const cfg = { nuevo: { c: 'var(--blue)', l: 'Nuevos' }, proceso: { c: 'var(--orange)', l: 'En proceso' }, cotizado: { c: 'var(--purple)', l: 'Cotizados' }, cerrado: { c: 'var(--green)', l: 'Cerrados' }, perdido: { c: 'var(--red)', l: 'Perdidos' } }
    const totalClientes = todos.length || 1
    document.getElementById('dash-funnel').innerHTML = estados.map(k => {
      const v = cfg[k]; const n = todos.filter(c => c.estado === k).length; const pct = Math.round(n / totalClientes * 100)
      return `<div class="fi2"><div class="fl">${v.l}</div><div class="fb"><div class="ff" style="width:${Math.max(pct, 5)}%;background:${v.c}">${n}</div></div><div class="fc">${pct}%</div></div>`
    }).join('')

    // Top productos
    const clienteIds = todos.map(c => c.id).filter(Boolean)
    const { data: prods } = clienteIds.length
      ? await sb.from('cliente_productos').select('producto').in('cliente_id', clienteIds.slice(0, 500))
      : { data: [] }
    const prodCount = {}
    ;(prods || []).forEach(p => { prodCount[p.producto] = (prodCount[p.producto] || 0) + 1 })
    const topProds = Object.entries(prodCount).sort((a, b) => b[1] - a[1]).slice(0, 6)
    document.getElementById('dash-productos').innerHTML = topProds.map(([p, n]) =>
      `<div class="srow"><span class="sk">${p}</span><span class="sv">${n}</span></div>`
    ).join('') || '<div style="color:var(--text3)">Sin datos</div>'

    // Próximas visitas
    const proximas = visitasArr.filter(v => v.fecha >= hoy).slice(0, 5)
    document.getElementById('dash-visitas').innerHTML = proximas.map(v =>
      `<div class="srow"><span class="sk">${v.clientes?.nombre || '—'}</span><span class="sv">${fmtFecha(v.fecha)}</span></div>`
    ).join('') || '<div style="color:var(--text3)">No hay visitas próximas</div>'

  } catch (e) { toast('Error dashboard: ' + e.message, 'var(--red)') }
}

// ═══════════════════════════════════════════
// LEADS / CLIENTES
// ═══════════════════════════════════════════
async function loadLeads() {
  document.getElementById('leads-body').innerHTML = '<div class="loading-row"><span class="spinner"></span></div>'
  const data = await fetchClientes({ estado: currentEstado, buscar: currentSearch })
  renderLeadsTable(data)
}

function filterEstado(estado, el) {
  document.querySelectorAll('#lead-filters .chip').forEach(c => c.classList.remove('active'))
  el.classList.add('active'); currentEstado = estado; loadLeads()
}

function searchLeads(v) { currentSearch = v; loadLeads() }

function renderLeadsTable(data) {
  if (!data.length) { document.getElementById('leads-body').innerHTML = '<div class="loading-row">No se encontraron clientes</div>'; return }
  document.getElementById('leads-body').innerHTML = data.map(c => {
    const prod = c.productos[0] || '—'
    const asesorHtml = c.asesor_nombre
      ? `<div style="display:flex;align-items:center;gap:6px"><div class="av" style="width:26px;height:26px;font-size:9px;background:${c.asesor_bg || '#eee'};color:${c.asesor_color || '#666'}">${c.asesor_iniciales || '?'}</div><span style="font-size:12px">${c.asesor_nombre.split(' ')[0]}</span></div>`
      : '<span style="color:var(--text3);font-size:12px">Sin asignar</span>'
    const accionHtml = c.estado === 'cerrado'
      ? `<button class="btn btn-g" style="font-size:11px;padding:5px 9px" onclick="event.stopPropagation();prepInstFromClient('${c.id}')">Instalar</button>`
      : c.estado === 'perdido'
        ? `<span style="font-size:11px;color:var(--text3)">${c.motivo_abandono || '—'}</span>`
        : `<a class="wa-btn" style="font-size:11px;padding:5px 10px;cursor:pointer" onclick="event.stopPropagation();sendWA('${c.telefono}','${(c.asesor_nombre || 'el equipo').replace(/'/g, "\\'")}','${c.nombre.replace(/'/g, "\\'")}')">WhatsApp</a>`
    return `<div class="tbl-row" onclick="openDP('${c.id}')">
      <div class="cc"><div class="av" style="background:${c.asesor_bg || 'var(--wine-l)'};color:${c.asesor_color || 'var(--wine-d)'}">${initiales(c.nombre)}</div>
      <div><div class="c-name">${c.nombre}</div><div class="c-addr">${c.direccion || ''}</div></div></div>
      <div style="font-size:12.5px">📞 ${c.telefono}</div>
      <div><span class="ptag">${prod}${c.productos.length > 1 ? ' +' + (c.productos.length - 1) : ''}</span></div>
      <div><span class="sb ${sbClass(c.estado)}">${sbText(c.estado)}</span></div>
      <div>${asesorHtml}</div>
      <div>${accionHtml}</div>
    </div>`
  }).join('')
}

// ═══════════════════════════════════════════
// DETAIL PANEL
// ═══════════════════════════════════════════
async function openDP(id) {
  document.getElementById('dp').classList.add('open')
  document.getElementById('dp-hdr').innerHTML = '<div class="loading-row"><span class="spinner"></span></div>'
  try {
    const { data: c } = await sb.from('clientes').select(`*, asesores(nombre,iniciales,color,bg_color), cliente_productos(producto)`).eq('id', id).single()
    const { data: hist } = await sb.from('historial').select('*').eq('cliente_id', id).order('created_at', { ascending: false })
    const { data: notas } = await sb.from('notas_cliente').select('*').eq('cliente_id', id).order('created_at', { ascending: false })

    const prods = (c.cliente_productos || []).map(p => p.producto)
    const asesorNombre = c.asesores?.nombre || 'Sin asignar'

    document.getElementById('dp-hdr').innerHTML =
      `<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div class="av" style="width:50px;height:50px;font-size:17px;background:${c.asesores?.bg_color || 'var(--wine-l)'};color:${c.asesores?.color || 'var(--wine-d)'}">${initiales(c.nombre)}</div>
        <div><div class="dp-name">${c.nombre}</div><div class="dp-phone">📞 ${c.telefono}</div></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span class="sb ${sbClass(c.estado)}">${sbText(c.estado)}</span>
        ${prods.map(p => `<span class="ptag">${p}</span>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <a class="wa-btn" style="flex:1;justify-content:center;font-size:12.5px;cursor:pointer" onclick="sendWA('${c.telefono}','${asesorNombre.replace(/'/g, "\\'")}','${c.nombre.replace(/'/g, "\\'")}')">WhatsApp</a>
        <button class="btn btn-g" style="flex:1;font-size:12.5px" onclick="openEditCliente('${c.id}')">✏️ Editar</button>
      </div>`

    const icons = { creacion: '📋', contacto: '📞', cotizacion: '📄', cierre: '🎉', perdido: '❌', visita: '📅', instalacion: '🔧', nota: '📝', estado: '🔄' }
    const histHtml = (hist || []).map(h => {
      const dt = new Date(h.created_at)
      return `<div class="tl-item"><div class="tl-dot">${icons[h.tipo] || '•'}</div><div><div class="tl-date">${dt.toLocaleDateString('es-CO')} ${dt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</div><div class="tl-text">${h.descripcion}</div></div></div>`
    }).join('') || '<div style="color:var(--text3);font-size:12px">Sin historial</div>'

    const notasHtml = (notas || []).map(n =>
      `<div style="background:var(--surface2);border-radius:var(--rs);padding:9px 11px;margin-bottom:7px;font-size:12.5px"><div style="color:var(--text2)">${n.nota}</div><div style="font-size:10.5px;color:var(--text3);margin-top:3px">${new Date(n.created_at).toLocaleDateString('es-CO')}</div></div>`
    ).join('')

    document.getElementById('dp-body').innerHTML =
      `<div class="dp-sec"><div class="dp-sec-title">Información</div>
        <div class="dr"><span class="dk">Dirección</span><span class="dv">${c.direccion || '—'}</span></div>
        <div class="dr"><span class="dk">Asesor</span><span class="dv">${asesorNombre}</span></div>
        <div class="dr"><span class="dk">Fuente</span><span class="dv">${c.fuente || '—'}</span></div>
        <div class="dr"><span class="dk">Registrado</span><span class="dv">${new Date(c.created_at).toLocaleDateString('es-CO')}</span></div>
        ${c.estado === 'perdido' ? `<div class="dr"><span class="dk">Motivo pérdida</span><span class="dv" style="color:var(--red)">${c.motivo_abandono || '—'}</span></div>` : ''}
      </div>
      <div class="dp-sec"><div class="dp-sec-title">Historial</div><div class="tl">${histHtml}</div></div>
      ${notasHtml ? `<div class="dp-sec"><div class="dp-sec-title">Notas guardadas</div>${notasHtml}</div>` : ''}
      <div class="dp-sec">
        <div class="dp-sec-title">Agregar nota</div>
        <textarea class="fi fi-ta" id="dp-nota-input" placeholder="Escribe una nota..." style="font-size:12.5px;width:100%"></textarea>
        <button class="btn btn-p mt8" style="width:100%;font-size:12.5px" onclick="saveNota('${id}')">💾 Guardar nota</button>
      </div>`
  } catch (e) { toast('Error: ' + e.message, 'var(--red)') }
}

function closeDP() { document.getElementById('dp').classList.remove('open') }

async function saveNota(id) {
  const nota = document.getElementById('dp-nota-input').value.trim()
  if (!nota) return
  await sb.from('notas_cliente').insert([{ cliente_id: id, nota }])
  await sb.from('historial').insert([{ cliente_id: id, tipo: 'nota', descripcion: `Nota: ${nota.substring(0, 60)}` }])
  toast('Nota guardada'); openDP(id)
}

// ═══════════════════════════════════════════
// NUEVO CLIENTE
// ═══════════════════════════════════════════
async function submitCliente(e) {
  e.preventDefault()
  const fd = new FormData(e.target)
  const body = Object.fromEntries(fd)
  const productos = [...document.querySelectorAll('#prod-sel-nc .po.sel')].map(p => p.textContent)
  const btn = document.getElementById('btn-save-cliente')
  btn.disabled = true; btn.textContent = 'Guardando...'
  try {
    const { data: cliente, error } = await sb.from('clientes').insert([{
      empresa_id: empresaId, nombre: body.nombre, telefono: body.telefono,
      direccion: body.direccion || '', estado: body.estado || 'nuevo',
      fuente: body.fuente || 'Directo', asesor_id: selectedAsesorId || null, notas: body.notas || ''
    }]).select().single()
    if (error) throw error

    if (productos.length) {
      await sb.from('cliente_productos').insert(productos.map(p => ({ cliente_id: cliente.id, producto: p })))
    }
    await sb.from('historial').insert([{ cliente_id: cliente.id, tipo: 'creacion', descripcion: `Lead registrado — ${body.nombre}` }])

    toast('✓ Cliente guardado'); closeModal('m-cliente'); e.target.reset()
    document.querySelectorAll('#prod-sel-nc .po').forEach(p => p.classList.remove('sel'))
    loadLeads(); loadDashboard()
  } catch (err) { toast('Error: ' + err.message, 'var(--red)') }
  finally { btn.disabled = false; btn.textContent = '💾 Guardar cliente' }
}

// ═══════════════════════════════════════════
// EDITAR CLIENTE
// ═══════════════════════════════════════════
async function openEditCliente(id) {
  const { data: c } = await sb.from('clientes').select(`*, cliente_productos(producto)`).eq('id', id).single()
  editClienteId = id
  document.getElementById('edit-nombre').value = c.nombre
  document.getElementById('edit-telefono').value = c.telefono
  document.getElementById('edit-direccion').value = c.direccion || ''
  document.getElementById('edit-estado').value = c.estado
  document.getElementById('edit-notas').value = c.notas || ''
  document.getElementById('edit-motivo-wrap').style.display = c.estado === 'perdido' ? '' : 'none'
  if (c.motivo_abandono) document.getElementById('edit-motivo').value = c.motivo_abandono
  const prods = (c.cliente_productos || []).map(p => p.producto)
  document.querySelectorAll('#edit-prod-sel .po').forEach(p => p.classList.toggle('sel', prods.includes(p.textContent)))
  openModal('m-edit-cliente')
}

document.getElementById('edit-estado')?.addEventListener('change', function () {
  document.getElementById('edit-motivo-wrap').style.display = this.value === 'perdido' ? '' : 'none'
})

async function submitEditCliente(e) {
  e.preventDefault()
  const fd = new FormData(e.target); const body = Object.fromEntries(fd)
  const productos = [...document.querySelectorAll('#edit-prod-sel .po.sel')].map(p => p.textContent)
  const { data: anterior } = await sb.from('clientes').select('estado').eq('id', editClienteId).single()
  await sb.from('clientes').update({
    nombre: body.nombre, telefono: body.telefono, direccion: body.direccion || '',
    estado: body.estado, motivo_abandono: body.motivo_abandono || '',
    notas: body.notas || '', updated_at: new Date().toISOString()
  }).eq('id', editClienteId)
  await sb.from('cliente_productos').delete().eq('cliente_id', editClienteId)
  if (productos.length) await sb.from('cliente_productos').insert(productos.map(p => ({ cliente_id: editClienteId, producto: p })))
  if (anterior?.estado !== body.estado) {
    const msgs = { proceso: 'Estado: En proceso', cotizado: 'Cotización registrada', cerrado: '¡Venta cerrada! 🎉', perdido: `Lead perdido — ${body.motivo_abandono || ''}` }
    await sb.from('historial').insert([{ cliente_id: editClienteId, tipo: 'estado', descripcion: msgs[body.estado] || `Estado: ${body.estado}` }])
  }
  toast('✓ Cliente actualizado'); closeModal('m-edit-cliente'); loadLeads(); openDP(editClienteId)
}

async function deleteCliente() {
  if (!document.body.classList.contains('is-admin')) { toast('Solo administradores pueden eliminar', 'var(--red)'); return }
  if (!confirm('¿Eliminar este cliente? No se puede deshacer.')) return
  await sb.from('clientes').delete().eq('id', editClienteId)
  toast('Cliente eliminado'); closeModal('m-edit-cliente'); closeDP(); loadLeads(); loadDashboard()
}

// ═══════════════════════════════════════════
// VISITAS
// ═══════════════════════════════════════════
async function submitVisita(e) {
  e.preventDefault()
  const fd = new FormData(e.target); const body = Object.fromEntries(fd)
  const { error } = await sb.from('visitas').insert([{ ...body, empresa_id: empresaId, estado: 'programada' }])
  if (error) { toast('Error: ' + error.message, 'var(--red)'); return }
  await sb.from('historial').insert([{ cliente_id: body.cliente_id, tipo: 'visita', descripcion: `Visita agendada ${body.fecha} ${body.hora}` }])
  toast('📅 Visita agendada'); closeModal('m-visita'); e.target.reset(); renderCal(); loadDashboard()
}

// ═══════════════════════════════════════════
// INSTALACIONES
// ═══════════════════════════════════════════
async function loadInstalaciones(estado) {
  document.getElementById('inst-grid').innerHTML = '<div class="loading-row" style="grid-column:1/-1"><span class="spinner"></span></div>'
  let q = sb.from('instalaciones').select(`*, clientes(nombre, telefono, direccion)`).eq('empresa_id', empresaId).order('fecha')
  if (estado) q = q.eq('estado', estado)
  const { data } = await q
  if (!data?.length) { document.getElementById('inst-grid').innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="empty-icon">🔧</div>No hay instalaciones</div>'; return }
  const labels = { programada: 'Programada', en_curso: 'En curso', completada: 'Completada', con_novedad: 'Con novedad' }
  const classes = { programada: 's-nuevo', en_curso: 's-proceso', completada: 's-cerrado', con_novedad: 's-perdido' }
  document.getElementById('inst-grid').innerHTML = data.map(i =>
    `<div class="ic2">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div><div style="font-weight:600;font-size:14px">${i.clientes?.nombre || '—'}</div><div style="font-size:11px;color:var(--text3)">${i.clientes?.direccion || ''}</div></div>
        <span class="sb ${classes[i.estado] || 's-nuevo'}">${labels[i.estado] || i.estado}</span>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:4px">📦 ${i.producto}${i.detalles ? ' — ' + i.detalles : ''}</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:4px">👷 ${i.tecnico || 'Sin técnico'}</div>
      <div style="font-size:12px;color:var(--text2)">📅 ${fmtFecha(i.fecha)}, ${i.hora || ''}</div>
      <div class="pb"><div class="pf" style="width:${i.progreso || 0}%"></div></div>
      <div style="font-size:10.5px;color:var(--text3);text-align:right;margin-top:4px">${i.progreso || 0}%</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        ${i.estado !== 'completada' ? `<button class="btn btn-g w100" style="font-size:11.5px" onclick="updateProgreso('${i.id}','${i.estado}',${i.progreso || 0})">Actualizar</button>` : ''}
      </div>
    </div>`
  ).join('')
}

async function updateProgreso(id, estadoActual, progresoActual) {
  const nuevo = prompt('Progreso (0-100):', progresoActual)
  if (nuevo === null) return
  const p = parseInt(nuevo)
  const estado = p >= 100 ? 'completada' : p > 0 ? 'en_curso' : estadoActual
  await sb.from('instalaciones').update({ estado, progreso: p }).eq('id', id)
  toast('✓ Progreso actualizado'); loadInstalaciones()
}

async function submitInstalacion(e) {
  e.preventDefault()
  const fd = new FormData(e.target); const body = Object.fromEntries(fd)
  await sb.from('instalaciones').insert([{ ...body, empresa_id: empresaId, estado: 'programada', progreso: 0 }])
  await sb.from('historial').insert([{ cliente_id: body.cliente_id, tipo: 'instalacion', descripcion: `Instalación programada ${body.fecha}` }])
  toast('🔧 Instalación programada'); closeModal('m-inst'); e.target.reset(); loadInstalaciones()
}

async function prepInstFromClient(cid) {
  await openModal('m-inst')
  setTimeout(() => {
    const sel = document.getElementById('i-cliente')
    if (sel) for (const o of sel.options) { if (o.value === cid) { o.selected = true; break } }
  }, 400)
}

// ═══════════════════════════════════════════
// CALENDARIO
// ═══════════════════════════════════════════
async function renderCal() {
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  const y = calDate.getFullYear(), m = calDate.getMonth()
  document.getElementById('cal-title').textContent = MESES[m] + ' ' + y
  document.getElementById('cal-days').innerHTML = DIAS.map(d => `<div class="cal-dname">${d}</div>`).join('')

  const mesStr = `${y}-${String(m + 1).padStart(2, '0')}`
  const { data: visitas } = await sb.from('visitas').select(`fecha, clientes(nombre)`).eq('empresa_id', empresaId).gte('fecha', `${mesStr}-01`).lte('fecha', `${mesStr}-31`)
  const { data: instals } = await sb.from('instalaciones').select(`fecha, clientes(nombre)`).eq('empresa_id', empresaId).gte('fecha', `${mesStr}-01`).lte('fecha', `${mesStr}-31`)

  const evMap = {}
  ;(visitas || []).forEach(v => { if (!evMap[v.fecha]) evMap[v.fecha] = []; evMap[v.fecha].push({ text: v.clientes?.nombre, tipo: 'visita' }) })
  ;(instals || []).forEach(i => { if (!evMap[i.fecha]) evMap[i.fecha] = []; evMap[i.fecha].push({ text: i.clientes?.nombre, tipo: 'instalacion' }) })

  let first = new Date(y, m, 1).getDay(); first = first === 0 ? 6 : first - 1
  const days = new Date(y, m + 1, 0).getDate()
  const today = new Date(); let html = ''
  for (let i = 0; i < first; i++) { const pd = new Date(y, m, -(first - 1 - i)); html += `<div class="cal-cell"><div class="cal-dn other">${pd.getDate()}</div></div>` }
  for (let d = 1; d <= days; d++) {
    const isT = (today.getFullYear() === y && today.getMonth() === m && today.getDate() === d)
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const evs = (evMap[key] || []).slice(0, 3).map(e => `<div class="cal-ev ev-${e.tipo}">${e.text}</div>`).join('')
    html += `<div class="cal-cell" onclick="openModal('m-visita')"><div class="cal-dn ${isT ? 'today' : ''}">${d}</div>${evs}</div>`
  }
  const rem = (first + days) % 7; if (rem > 0) for (let i = 1; i <= 7 - rem; i++) html += `<div class="cal-cell"><div class="cal-dn other">${i}</div></div>`
  document.getElementById('cal-body').innerHTML = html
}

function prevMonth() { calDate.setMonth(calDate.getMonth() - 1); renderCal() }
function nextMonth() { calDate.setMonth(calDate.getMonth() + 1); renderCal() }
function setTab(el) { el.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active')); el.classList.add('active') }

// ═══════════════════════════════════════════
// RECORDATORIOS
// ═══════════════════════════════════════════
async function loadRecordatorios() {
  document.getElementById('rem-content').innerHTML = '<div class="loading-row"><span class="spinner"></span></div>'
  const hoy = new Date().toISOString().split('T')[0]
  const manana = new Date(); manana.setDate(manana.getDate() + 1)
  const mananaStr = manana.toISOString().split('T')[0]

  const { data: visitasHoy } = await sb.from('visitas').select(`*, clientes(nombre, telefono), asesores(nombre)`).eq('empresa_id', empresaId).eq('fecha', hoy).neq('estado', 'cancelada').order('hora')
  const { data: visitasManana } = await sb.from('visitas').select(`*, clientes(nombre), asesores(nombre)`).eq('empresa_id', empresaId).eq('fecha', mananaStr).neq('estado', 'cancelada').order('hora')

  const tresDiasAtras = new Date(); tresDiasAtras.setDate(tresDiasAtras.getDate() - 3)
  const { data: sinSeguim } = await sb.from('clientes').select(`*, asesores(nombre)`).eq('empresa_id', empresaId).in('estado', ['nuevo', 'proceso']).lt('updated_at', tresDiasAtras.toISOString()).order('updated_at').limit(10)

  let html = ''
  if (visitasHoy?.length) {
    html += `<div class="sec-title">Visitas hoy</div><div class="sec-sub">Confirmar con los clientes</div><div class="rem-list mb16">`
    html += visitasHoy.map(v =>
      `<div class="rem urg"><div style="font-size:18px">🔴</div><div style="flex:1"><div style="font-size:14px;font-weight:500">${v.clientes?.nombre}</div><div style="font-size:12px;color:var(--text2)">${v.producto || ''} · ${v.hora}</div></div>
      <a class="wa-btn" style="font-size:11px;padding:6px 11px;cursor:pointer" onclick="sendWA('${v.clientes?.telefono}','${(v.asesores?.nombre || 'el equipo').replace(/'/g, "\\'")}','${v.clientes?.nombre?.replace(/'/g, "\\'")}')">WhatsApp</a></div>`
    ).join('') + '</div>'
  }
  if (sinSeguim?.length) {
    html += `<div class="sec-title">Sin seguimiento</div><div class="sec-sub">Leads sin contacto hace más de 3 días</div><div class="rem-list mb16">`
    html += sinSeguim.map(c =>
      `<div class="rem norm"><div style="font-size:18px">🟡</div><div style="flex:1"><div style="font-size:14px;font-weight:500">${c.nombre}</div><div style="font-size:12px;color:var(--text2)">${c.asesores?.nombre || 'Sin asesor'} · ${c.estado}</div></div>
      <a class="wa-btn" style="font-size:11px;padding:6px 11px;background:var(--wine);cursor:pointer" onclick="sendWA('${c.telefono}','${(c.asesores?.nombre || 'el equipo').replace(/'/g, "\\'")}','${c.nombre.replace(/'/g, "\\'")}')">Contactar</a></div>`
    ).join('') + '</div>'
  }
  if (visitasManana?.length) {
    html += `<div class="sec-title">Visitas mañana</div><div class="sec-sub">Preparar con anticipación</div><div class="rem-list">`
    html += visitasManana.map(v =>
      `<div class="rem norm"><div style="font-size:18px">📅</div><div style="flex:1"><div style="font-size:14px;font-weight:500">${v.clientes?.nombre}</div><div style="font-size:12px;color:var(--text2)">${v.hora} · ${v.asesores?.nombre || ''}</div></div></div>`
    ).join('') + '</div>'
  }
  if (!html) html = `<div class="empty"><div class="empty-icon">✅</div><div style="font-size:16px;font-weight:500;color:var(--text2)">Todo al día</div><div style="font-size:13px;margin-top:4px">No hay recordatorios pendientes</div></div>`
  document.getElementById('rem-content').innerHTML = html
}

// ═══════════════════════════════════════════
// REPORTES
// ═══════════════════════════════════════════
async function loadReportes() {
  const { data: todos } = await sb.from('clientes').select('estado, created_at').eq('empresa_id', empresaId)
  const arr = todos || []
  const now = new Date(); const mes = String(now.getMonth() + 1).padStart(2, '0'); const anio = String(now.getFullYear())
  const leadsDelMes = arr.filter(c => c.created_at?.startsWith(`${anio}-${mes}`)).length
  const cerradosMes = arr.filter(c => c.estado === 'cerrado' && c.created_at?.startsWith(`${anio}-${mes}`)).length
  const conversion = leadsDelMes > 0 ? Math.round(cerradosMes / leadsDelMes * 100) : 0
  const total = arr.length || 1
  const cfg = { nuevo: { l: 'Nuevos' }, proceso: { l: 'En proceso' }, cotizado: { l: 'Cotizados' }, cerrado: { l: 'Cerrados' }, perdido: { l: 'Perdidos' } }
  const estadosHtml = Object.keys(cfg).map(k => {
    const n = arr.filter(c => c.estado === k).length
    return `<div class="srow"><span class="sk">${cfg[k].l}</span><span class="sv">${n} (${Math.round(n / total * 100)}%)</span></div>`
  }).join('')
  const clienteIdsRep = arr.map(c => c.id).filter(Boolean)
  const { data: prods } = clienteIdsRep.length
    ? await sb.from('cliente_productos').select('producto').in('cliente_id', clienteIdsRep.slice(0, 500))
    : { data: [] }
  const prodCount = {}
  ;(prods || []).forEach(p => { prodCount[p.producto] = (prodCount[p.producto] || 0) + 1 })
  const topProds = Object.entries(prodCount).sort((a, b) => b[1] - a[1]).slice(0, 6)

  document.getElementById('rep-content').innerHTML =
    `<div class="metrics" style="margin-bottom:20px">
      <div class="mc"><div class="mc-icon" style="background:var(--blue-l)">📋</div><div class="mc-val">${total}</div><div class="mc-lbl">Clientes totales</div></div>
      <div class="mc"><div class="mc-icon" style="background:var(--green-l)">🎯</div><div class="mc-val">${cerradosMes}</div><div class="mc-lbl">Cierres este mes</div></div>
      <div class="mc"><div class="mc-icon" style="background:var(--wine-l)">📈</div><div class="mc-val">${conversion}%</div><div class="mc-lbl">Conversión</div></div>
      <div class="mc"><div class="mc-icon" style="background:var(--orange-l)">⏱</div><div class="mc-val">${leadsDelMes}</div><div class="mc-lbl">Leads este mes</div></div>
    </div>
    <div class="g2">
      <div class="card"><div class="card-hdr"><div class="card-title">Por estado</div></div>${estadosHtml}</div>
      <div class="card"><div class="card-hdr"><div class="card-title">Top productos</div></div>${topProds.map(([p, n]) => `<div class="srow"><span class="sk">${p}</span><span class="sv">${n}</span></div>`).join('') || '<div style="color:var(--text3)">Sin datos</div>'}</div>
    </div>`
}

// ═══════════════════════════════════════════
// ASESORES
// ═══════════════════════════════════════════
async function loadAsesores() {
  const asesores = await fetchAsesores()
  const now = new Date(); const mes = String(now.getMonth() + 1).padStart(2, '0'); const anio = String(now.getFullYear())
  const { data: clientes } = await sb.from('clientes').select('asesor_id, estado, created_at').eq('empresa_id', empresaId)
  const arr = clientes || []

  document.getElementById('asesor-cards').innerHTML = asesores.map(a => {
    const mios = arr.filter(c => c.asesor_id === a.id)
    const miosMes = mios.filter(c => c.created_at?.startsWith(`${anio}-${mes}`))
    const cerrados = miosMes.filter(c => c.estado === 'cerrado').length
    const conv = miosMes.length > 0 ? Math.round(cerrados / miosMes.length * 100) : 0
    return `<div class="asesor-card">
      <div class="asesor-av" style="background:${a.bg_color};color:${a.color}">${a.iniciales}</div>
      <div style="font-size:15px;font-weight:600">${a.nombre}</div>
      <div style="font-size:12px;color:var(--text3);margin:3px 0 10px">${a.rol}</div>
      <div style="font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:500;color:var(--wine-d)">${cerrados}</div>
      <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">cierres este mes</div>
      <div style="font-size:12px;color:${conv >= 35 ? 'var(--green)' : 'var(--orange)'}">${conv}% conversión</div>
      ${a.telefono ? `<a class="wa-btn mt16" style="justify-content:center;font-size:12px;width:100%;text-decoration:none" href="https://wa.me/57${a.telefono.replace(/\D/g, '')}" target="_blank">WhatsApp</a>` : ''}
      <div class="asesor-card-actions">
        <button class="btn-edit" onclick="openEditAsesor('${a.id}','${a.nombre.replace(/'/g, "\\'")}','${a.telefono || ''}','${a.rol}')">✏️ Editar</button>
      </div>
    </div>`
  }).join('') || '<div class="empty" style="grid-column:1/-1">No hay asesores</div>'
}

async function submitAsesor(e) {
  e.preventDefault()
  const fd = new FormData(e.target); const body = Object.fromEntries(fd)
  const iniciales = body.nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const colores = [['#9A7A45', '#F5EDD9'], ['#4A7FA5', '#E8F0F7'], ['#7A5FAA', '#F0EBFA'], ['#5B8A5A', '#EBF3EB'], ['#C97A3A', '#FAF0E6']]
  const [color, bg_color] = colores[Math.floor(Math.random() * colores.length)]
  await sb.from('asesores').insert([{ empresa_id: empresaId, nombre: body.nombre, telefono: body.telefono || '', rol: body.rol || 'Asesor', iniciales, color, bg_color }])
  toast('✓ Asesor guardado'); closeModal('m-asesor'); e.target.reset(); loadAsesores()
}

function openEditAsesor(id, nombre, telefono, rol) {
  editAsesorId = id
  document.getElementById('edit-asesor-nombre').value = nombre
  document.getElementById('edit-asesor-telefono').value = telefono || ''
  document.getElementById('edit-asesor-rol').value = rol || 'Asesor'
  openModal('m-edit-asesor')
}

async function submitEditAsesor(e) {
  e.preventDefault()
  const fd = new FormData(e.target); const body = Object.fromEntries(fd)
  const iniciales = body.nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  await sb.from('asesores').update({ nombre: body.nombre, telefono: body.telefono || '', rol: body.rol || 'Asesor', iniciales }).eq('id', editAsesorId)
  toast('✓ Asesor actualizado'); closeModal('m-edit-asesor'); loadAsesores()
}

async function deleteAsesor() {
  if (!document.body.classList.contains('is-admin')) { toast('Solo administradores', 'var(--red)'); return }
  const nombre = document.getElementById('edit-asesor-nombre').value
  if (!confirm(`¿Desactivar a "${nombre}"?`)) return
  await sb.from('asesores').update({ activo: false }).eq('id', editAsesorId)
  toast('Asesor desactivado'); closeModal('m-edit-asesor'); loadAsesores()
}

// ═══════════════════════════════════════════
// USUARIOS
// ═══════════════════════════════════════════
async function loadUsuarios() {
  if (!document.body.classList.contains('is-admin')) {
    document.getElementById('usuarios-content').innerHTML = '<div class="empty"><div class="empty-icon">🔒</div>Solo administradores</div>'
    return
  }
  document.getElementById('usuarios-content').innerHTML = '<div class="loading-row"><span class="spinner"></span></div>'
  const { data: usuarios, error } = await sb.from('usuarios').select('*').eq('empresa_id', empresaId).order('created_at')
  if (error) { toast('Error cargando usuarios: ' + error.message, 'var(--red)'); return }

  const html = (usuarios || []).map(u => `
    <div class="asesor-card" style="display:flex;flex-direction:row;align-items:center;gap:14px;padding:14px 18px">
      <div class="asesor-av" style="width:40px;height:40px;font-size:14px;flex-shrink:0">${(u.nombre || u.email || 'U').substring(0,2).toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.nombre || '—'}</div>
        <div style="font-size:12px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.email}</div>
      </div>
      <span class="sb ${u.rol === 'admin' ? 's-cerrado' : 's-proceso'}" style="flex-shrink:0">${u.rol === 'admin' ? 'Admin' : 'Usuario'}</span>
      ${u.id !== currentUser?.id ? `<button class="btn btn-g" style="font-size:11px;padding:5px 10px;flex-shrink:0" onclick="toggleRolUsuario('${u.id}','${u.rol}','${u.nombre || u.email}')">${u.rol === 'admin' ? '→ Usuario' : '→ Admin'}</button>` : '<span style="font-size:11px;color:var(--text3)">Tú</span>'}
    </div>
  `).join('')

  document.getElementById('usuarios-content').innerHTML = html || '<div style="color:var(--text3);padding:20px">No hay usuarios</div>'
}

async function toggleRolUsuario(id, rolActual, nombre) {
  const nuevoRol = rolActual === 'admin' ? 'asesor' : 'admin'
  if (!confirm(`¿Cambiar rol de "${nombre}" a ${nuevoRol}?`)) return
  const { error } = await sb.from('usuarios').update({ rol: nuevoRol }).eq('id', id)
  if (error) { toast('Error: ' + error.message, 'var(--red)'); return }
  toast(`✓ Rol actualizado a ${nuevoRol}`)
  loadUsuarios()
}

async function invitarUsuario(e) {
  e.preventDefault()
  if (!document.body.classList.contains('is-admin')) { toast('Solo administradores', 'var(--red)'); return }
  const fd = new FormData(e.target); const body = Object.fromEntries(fd)
  const btn = document.getElementById('btn-invitar')
  btn.disabled = true; btn.textContent = 'Creando...'

  try {
    // Crear usuario en Supabase Auth
    const { data, error } = await sb.auth.admin?.createUser({
      email: body.email, password: body.password, email_confirm: true
    })

    // Si no tenemos acceso a admin API, usar signUp normal
    if (error || !sb.auth.admin) {
      // Registrar via signUp desde el cliente — Supabase enviará email de confirmación
      const { data: signUpData, error: signUpError } = await sb.auth.signUp({
        email: body.email,
        password: body.password,
        options: { data: { empresa_id: empresaId } }
      })
      if (signUpError) throw signUpError

      const newUserId = signUpData.user?.id
      if (newUserId) {
        await sb.from('usuarios').insert([{
          id: newUserId, email: body.email,
          empresa_id: empresaId, rol: body.rol || 'asesor', nombre: body.nombre
        }])
      }
    }

    toast('✓ Usuario creado — recibirá un correo de confirmación')
    closeModal('m-invitar')
    e.target.reset()
    loadUsuarios()
  } catch (err) {
    toast('Error: ' + err.message, 'var(--red)')
  } finally {
    btn.disabled = false; btn.textContent = '✉️ Crear usuario'
  }
}

// ═══════════════════════════════════════════
// WHATSAPP
// ═══════════════════════════════════════════
function sendWA(telefono, asesor, cliente) {
  const msg = `Hola ${cliente}, le recordamos que tiene una visita programada con Armony. ${asesor} estará puntual. ¿Confirmamos? 😊`
  const num = telefono.replace(/\D/g, '')
  window.open(num ? `https://web.whatsapp.com/send?phone=57${num}&text=${encodeURIComponent(msg)}` : `https://web.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank')
}

// Expose globals
window.login = login
window.register = register
window.logout = logout
window.nav = nav
window.openModal = openModal
window.closeModal = closeModal
window.closeDP = closeDP
window.openDP = openDP
window.saveNota = saveNota
window.submitCliente = submitCliente
window.openEditCliente = openEditCliente
window.submitEditCliente = submitEditCliente
window.deleteCliente = deleteCliente
window.submitVisita = submitVisita
window.loadInstalaciones = loadInstalaciones
window.updateProgreso = updateProgreso
window.submitInstalacion = submitInstalacion
window.prepInstFromClient = prepInstFromClient
window.renderCal = renderCal
window.prevMonth = prevMonth
window.nextMonth = nextMonth
window.setTab = setTab
window.filterEstado = filterEstado
window.searchLeads = searchLeads
window.globalSearch = globalSearch
window.setChip = setChip
window.toggleProd = toggleProd
window.selectAsesor = selectAsesor
window.submitAsesor = submitAsesor
window.openEditAsesor = openEditAsesor
window.submitEditAsesor = submitEditAsesor
window.deleteAsesor = deleteAsesor
window.loadUsuarios = loadUsuarios
window.toggleRolUsuario = toggleRolUsuario
window.invitarUsuario = invitarUsuario
window.sendWA = sendWA
// ═══════════════════════════════════════════
// EXPORTAR DASHBOARD A EXCEL
// ═══════════════════════════════════════════
async function exportarDashboardExcel() {
  try {
    toast('Generando informe...', 'var(--wine)')

    const [clientesRes, visitasRes, prodsRes] = await Promise.all([
      sb.from('clientes').select('*, asesores(nombre)').eq('empresa_id', empresaId),
      sb.from('visitas').select('*, clientes(nombre)').eq('empresa_id', empresaId),
      sb.from('cliente_productos').select('producto, cliente_id')
    ])

    const clientes = clientesRes.data || []
    const visitas = visitasRes.data || []
    const prods = prodsRes.data || []

    const now = new Date()
    const mes = String(now.getMonth() + 1).padStart(2, '0')
    const anio = String(now.getFullYear())
    const hoy = now.toISOString().split('T')[0]
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

    // ── Hoja 1: Resumen general ──
    const cerradosMes = clientes.filter(c => c.estado === 'cerrado' && c.created_at?.startsWith(`${anio}-${mes}`)).length
    const leadsDelMes = clientes.filter(c => c.created_at?.startsWith(`${anio}-${mes}`)).length
    const conversion = leadsDelMes > 0 ? Math.round(cerradosMes / leadsDelMes * 100) : 0
    const visitasHoy = visitas.filter(v => v.fecha === hoy).length
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7)
    const visitasSem = visitas.filter(v => v.fecha >= hoy && v.fecha <= weekEnd.toISOString().split('T')[0]).length

    const resumen = [
      ['INFORME DASHBOARD — HORIZONTE CORTINAS Y PERSIANAS'],
      ['Generado:', new Date().toLocaleString('es-CO')],
      [],
      ['MÉTRICAS DEL MES', ''],
      ['Leads este mes', leadsDelMes],
      ['Cierres del mes', cerradosMes],
      ['Tasa de conversión', `${conversion}%`],
      ['Visitas esta semana', visitasSem],
      ['Visitas hoy', visitasHoy],
      ['Total clientes', clientes.length],
    ]

    // ── Hoja 2: Leads por mes (últimos 6) ──
    const leadsPorMes = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setMonth(d.getMonth() - 5 + i)
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yy = String(d.getFullYear())
      const n = clientes.filter(c => c.created_at?.startsWith(`${yy}-${mm}`)).length
      return [`${meses[d.getMonth()]} ${yy}`, n]
    })
    const hLeadsMes = [['Mes', 'Cantidad de Leads'], ...leadsPorMes]

    // ── Hoja 3: Embudo por estado ──
    const estados = ['nuevo','proceso','cotizado','cerrado','perdido']
    const labels = { nuevo:'Nuevos', proceso:'En proceso', cotizado:'Cotizados', cerrado:'Cerrados', perdido:'Perdidos' }
    const total = clientes.length || 1
    const hEmbudo = [
      ['Estado', 'Cantidad', '% del Total'],
      ...estados.map(e => {
        const n = clientes.filter(c => c.estado === e).length
        return [labels[e], n, `${Math.round(n / total * 100)}%`]
      })
    ]

    // ── Hoja 4: Top productos ──
    const prodCount = {}
    prods.forEach(p => { prodCount[p.producto] = (prodCount[p.producto] || 0) + 1 })
    const topProds = Object.entries(prodCount).sort((a, b) => b[1] - a[1])
    const hProds = [['Producto', 'Cantidad de Clientes'], ...topProds]

    // ── Hoja 5: Listado completo de clientes ──
    const hClientes = [
      ['Nombre', 'Teléfono', 'Dirección', 'Estado', 'Asesor', 'Fecha Registro'],
      ...clientes.map(c => [
        c.nombre || '',
        c.telefono || '',
        c.direccion || '',
        labels[c.estado] || c.estado || '',
        c.asesores?.nombre || '',
        c.created_at ? new Date(c.created_at).toLocaleDateString('es-CO') : ''
      ])
    ]

    // ── Hoja 6: Visitas ──
    const hVisitas = [
      ['Cliente', 'Fecha', 'Hora', 'Tipo', 'Estado', 'Notas'],
      ...visitas.map(v => [
        v.clientes?.nombre || '',
        v.fecha || '',
        v.hora || '',
        v.tipo || '',
        v.estado || '',
        v.notas || ''
      ])
    ]

    // ── Construir workbook con SheetJS ──
    const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs')
    const wb = XLSX.utils.book_new()

    const wsResumen = XLSX.utils.aoa_to_sheet(resumen)
    wsResumen['!cols'] = [{ wch: 30 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

    const wsLeadsMes = XLSX.utils.aoa_to_sheet(hLeadsMes)
    wsLeadsMes['!cols'] = [{ wch: 16 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, wsLeadsMes, 'Leads por Mes')

    const wsEmbudo = XLSX.utils.aoa_to_sheet(hEmbudo)
    wsEmbudo['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, wsEmbudo, 'Embudo de Ventas')

    const wsProds = XLSX.utils.aoa_to_sheet(hProds)
    wsProds['!cols'] = [{ wch: 30 }, { wch: 22 }]
    XLSX.utils.book_append_sheet(wb, wsProds, 'Top Productos')

    const wsClientes = XLSX.utils.aoa_to_sheet(hClientes)
    wsClientes['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 32 }, { wch: 14 }, { wch: 20 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, wsClientes, 'Clientes')

    const wsVisitas = XLSX.utils.aoa_to_sheet(hVisitas)
    wsVisitas['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, wsVisitas, 'Visitas')

    const fecha = now.toISOString().split('T')[0]
    XLSX.writeFile(wb, `Horizonte_Dashboard_${fecha}.xlsx`)
    toast('✅ Informe descargado', 'var(--green)')

  } catch (e) {
    console.error(e)
    toast('Error al exportar: ' + e.message, 'var(--red)')
  }
}

window.exportarDashboardExcel = exportarDashboardExcel
