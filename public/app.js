let user=null

async function register(){
 const email=document.getElementById('email').value
 const password=document.getElementById('password').value

 const {data,error}=await db.auth.signUp({email,password})
 if(error){alert(error.message);return}

 alert('Usuario creado')
}

async function login(){
 const email=document.getElementById('email').value
 const password=document.getElementById('password').value

 const {data,error}=await db.auth.signInWithPassword({email,password})
 if(error){alert('Error');return}

 user=data.user
 initApp()
}

async function logout(){
 await db.auth.signOut()
 location.reload()
}

async function initApp(){
 document.getElementById('auth').style.display='none'
 document.getElementById('app').style.display='block'
 loadClientes()
}

async function loadClientes(){
 const {data}=await db.from('clientes').select('*')
 const ul=document.getElementById('clientes')
 ul.innerHTML=''
 let total=data.length

 data.forEach(c=>{
  const li=document.createElement('li')
  li.innerHTML=`${c.nombre} (${c.estado||'nuevo'}) 
  <button onclick="wa('${c.telefono}','${c.nombre}')">WA</button>`
  ul.appendChild(li)
 })

 document.getElementById('metricas').innerText="Total clientes: "+total
}

async function crearCliente(){
 const nombre=prompt('Nombre')
 const telefono=prompt('Teléfono')
 const estado='nuevo'

 await db.from('clientes').insert([{nombre,telefono,estado}])
 loadClientes()
}

function wa(t,n){
 window.open(`https://wa.me/57${t}?text=Hola ${n}`,'_blank')
}
