import { chromium } from 'playwright'

const BASE = 'http://localhost:3000'
const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a']

const fallos = []
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FALLA'}  ${msg}`); if (!cond) fallos.push(msg) }

async function cookieDe (email, password) {
  const r = await fetch(`${BASE}/api/sesion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  const crudo = r.headers.getSetCookie().find(c => c.startsWith('ops_sesion='))
  return crudo.split(';')[0].slice('ops_sesion='.length)
}

const navegador = await chromium.launch()

async function sesion (email, password) {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 860 } })
  const valor = await cookieDe(email, password)
  await ctx.addCookies([{ name: 'ops_sesion', value: valor, domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }])
  return ctx
}

// --- 1. Ana (superadmin): el atajo abre el Refugio ---
{
  const ctx = await sesion('ana@wiwo.me', 'mock1234')
  const pagina = await ctx.newPage()
  await pagina.goto(`${BASE}/inicio`, { waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(1200)

  ok(await pagina.locator('.ad').count() === 0, 'sin teclear, no hay telon')

  for (const tecla of KONAMI) {
    await pagina.keyboard.press(tecla)
    await pagina.waitForTimeout(40)
  }

  await pagina.waitForSelector('.ad', { timeout: 3000 })
  ok(true, 'la secuencia levanta el telon de apertura')

  const piezas = await pagina.evaluate(() => ({
    hojas: document.querySelectorAll('.ad__h').length,
    franja: document.querySelectorAll('.ad__f').length,
    cerrojo: document.querySelectorAll('.ad__c').length,
    animando: [...document.querySelectorAll('.ad__h')].every(e => getComputedStyle(e).animationName !== 'none')
  }))
  ok(piezas.hojas === 2 && piezas.franja === 1 && piezas.cerrojo === 1, 'el telon trae las dos hojas, la franja y el cerrojo')
  ok(piezas.animando, 'las hojas estan animando de verdad')

  await pagina.waitForURL('**/refugio', { timeout: 8000 })
  ok(true, 'la secuencia termina navegando al Refugio')

  await pagina.waitForSelector('.bk__titulo', { timeout: 5000 })
  const texto = await pagina.locator('.bk').innerText()
  ok(/REFUGIO|Refugio/.test(await pagina.locator('.bk__titulo').innerText()), 'el bunker se pinta')
  ok(texto.includes('Ana Ríos'), 'la cabecera nombra al operador')
  ok(texto.includes('0770_cambios_de_compromiso.sql'), 'lista las migraciones pendientes')
  ok(texto.includes('+14400s'), 'muestra el desfase de reloj')
  ok(texto.includes('10.11.6-MariaDB'), 'muestra la version del motor')

  const interruptores = await pagina.locator('.bk__int').count()
  ok(interruptores === 9, `pinta los 9 interruptores (vio ${interruptores})`)

  const peligrosos = await pagina.locator('.bk__llave--peligro').count()
  ok(peligrosos === 6, `marca los 6 de efecto externo (vio ${peligrosos})`)

  // Apagar uno peligroso no pide confirmacion; encenderlo si. Se apaga el de recordatorio de jornada.
  const antes = await pagina.locator('.bk__int').filter({ hasText: 'Recordatorio de jornada' }).locator('.bk__llave').getAttribute('class')
  ok(antes.includes('bk__llave--on'), 'el recordatorio de jornada arranca encendido')

  await pagina.locator('.bk__int').filter({ hasText: 'Recordatorio de jornada' }).evaluate(e => e.click())
  await pagina.waitForTimeout(1500)

  const despues = await pagina.locator('.bk__int').filter({ hasText: 'Recordatorio de jornada' }).locator('.bk__llave').getAttribute('class')
  ok(!despues.includes('bk__llave--on'), 'apagarlo lo deja apagado tras releer del servidor')

  await pagina.screenshot({ path: '/tmp/claude-1000/refugio.png', fullPage: true })
  await ctx.close()
}

// --- 2. Diego (ni admin ni superadmin): para el la puerta no existe ---
{
  const ctx = await sesion('diego@wiwo.me', 'mock1234')
  const pagina = await ctx.newPage()
  await pagina.goto(`${BASE}/inicio`, { waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(1200)

  for (const tecla of KONAMI) {
    await pagina.keyboard.press(tecla)
    await pagina.waitForTimeout(40)
  }
  await pagina.waitForTimeout(1200)

  ok(await pagina.locator('.ad').count() === 0, 'sin es_refugiado, la secuencia no hace nada')
  ok(!pagina.url().includes('/refugio'), 'y no navega a ningun lado')

  // Y la URL escrita a mano tampoco: 404 de Next, no pantalla de "sin permiso".
  const r = await pagina.goto(`${BASE}/refugio`, { waitUntil: 'domcontentloaded' })
  ok(r.status() === 404, `la URL directa contesta 404 (contesto ${r.status()})`)

  const cuerpo = await pagina.locator('body').innerText()
  ok(!/permiso|prohibid|refugio/i.test(cuerpo), 'y la pagina de 404 no nombra el Refugio ni habla de permisos')

  await ctx.close()
}

// --- 3. La secuencia no se dispara escribiendo en un campo ---
{
  const ctx = await sesion('ana@wiwo.me', 'mock1234')
  const pagina = await ctx.newPage()
  await pagina.goto(`${BASE}/inicio`, { waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(1200)

  // El evento se despacha SOBRE el campo a mano. Ni `keyboard.press` ni `locator.press` sirven aca:
  // el modal de jornada tiene trampa de foco y devuelve el foco a su boton, asi que las teclas
  // terminan saliendo de un BUTTON y la guarda que se quiere probar nunca se ejercita.
  await pagina.evaluate((teclas) => {
    const campo = document.createElement('input')
    campo.id = 'campo-de-prueba'
    document.body.appendChild(campo)

    for (const key of teclas) {
      campo.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    }
  }, KONAMI)

  await pagina.waitForTimeout(900)
  ok(await pagina.locator('.ad').count() === 0, 'tecleando en un input la secuencia no dispara')
  await ctx.close()
}

await navegador.close()

console.log(`\n${fallos.length === 0 ? 'TODO VERDE' : `${fallos.length} FALLAS`}`)
process.exit(fallos.length === 0 ? 0 : 1)
