import supabase, { getEmpresaId } from './supabase.js'

let user = null

// 🔐 REGISTRO
async function register() {
  const email = document.getElementById('email').value
  const password = document.getElementById('password').value

  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    alert(error.message)
    return
  }

  user = data.user

  // 🧠 crear empresa automáticamente
  const nombreEmpresa = prompt('Nombre de tu empresa')

  const { data: empresa } = await supabase
    .from('empresas')
    .insert([{ nombre: nombreEmpresa }])
    .select()
    .single()

  // 👤 vincular usuario
  await supabase.from('usuarios').insert([
    {
      id: user.id,
      email: user.email,
      empresa_id: empresa.id,
      rol: 'admin'
    }
  ])

  alert('Usuario y empresa creados 🚀')
}

// 🔐 LOGIN
async function login() {
  const email = document.getElementById('email').value
  const password = document.getElementById('password').value

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    alert('Error al iniciar sesión')
    return
  }

  user = data.user
  initApp()
}

// 🚪 LOGOUT
async function logout() {
  await supabase.auth.signOut()
  location.reload()
}

// 🚀 INICIO APP
async function initApp() {
  document.getElementById('auth').style.display = 'none'
  document.getElementById('app').style.display = 'block'

  loadClientes()
}

// 📦 CARGAR CLIENTES (MULTIEMPRESA)
async function loadClientes() {
  const empresa_id = await getEmpresaId()

  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('empresa_id', empresa_id)

  if (error) {
    alert('Error cargando clientes')
    return
  }

  const ul = document.getElementById('clientes')
  ul.innerHTML = ''

  let total = data.length

  data.forEach(c => {
    const li = document.createElement('li')
    li.innerHTML = `
      ${c.nombre} (${c.estado || 'nuevo'}) 
      <button onclick="wa('${c.telefono}','${c.nombre}')">WA</button>
    `
    ul.appendChild(li)
  })

  document.getElementById('metricas').innerText = "Total clientes: " + total
}

// ➕ CREAR CLIENTE (MULTIEMPRESA)
async function crearCliente() {
  const nombre = prompt('Nombre')
  const telefono = prompt('Teléfono')
  const estado = 'nuevo'

  const empresa_id = await getEmpresaId()

  const { error } = await supabase.from('clientes').insert([
    { nombre, telefono, estado, empresa_id }
  ])

  if (error) {
    alert('Error al crear cliente')
    return
  }

  loadClientes()
}

// 📲 WHATSAPP
function wa(t, n) {
  window.open(`https://wa.me/57${t}?text=Hola ${n}`, '_blank')
}
