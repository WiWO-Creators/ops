/**
 * Mock del seguimiento de actividad del portal: `POST /portal/actividad` y las dos lecturas de
 * staff (`/clients/{id}/portal-activity`, `/contacts/{id}/portal-activity`).
 *
 * Replica la forma de `RecursoActividadPortal` de la API. Arranca con sesiones de ejemplo
 * deterministas para los contactos de `datos.js`, y lo que el portal mande por el POST se suma.
 */

import { CONTACTOS, ESPACIOS, STAFF } from './datos.js'
import { ErrorApi } from './consulta.js'

const DIA_MS = 86_400_000
const RUTAS = ['/portal', '/portal/proyectos', '/portal/proyectos/:id', '/portal/soporte', '/portal/reporte']
const PESTANAS = ['tasks', 'gantt', 'files', 'hitos']
const CLICKS = ['tablero.ver-mes', 'aprobacion.aprobar', 'ticket.nuevo', 'resumen.generar', 'tema.cambiar', 'enlace.proyectos.id']

const sesiones = []
const eventos = []
let generador = 7

/** Congruencial lineal: el mismo "azar" en cada arranque, para que las capturas sean estables. */
function azar () {
  generador = (generador * 1103515245 + 12345) % 2147483648

  return generador / 2147483648
}

const iso = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19)

/** Siembra unas treinta jornadas repartidas por los contactos y los ultimos 28 dias. */
function sembrar () {
  const ahora = Date.now()
  const proyectos = ESPACIOS.slice(0, 6).map((e) => e.id)

  CONTACTOS.forEach((contacto, i) => {
    const jornadas = 3 + ((i * 5) % 9)

    for (let j = 0; j < jornadas; j++) {
      const inicio = ahora - Math.floor(azar() * 28) * DIA_MS - Math.floor(azar() * 10) * 3_600_000
      const id = `00000000-0000-4000-8000-${String(contacto.id).padStart(4, '0')}${String(j).padStart(8, '0')}`
      const suplantado = j === 0 && i === 0 ? STAFF[0].id : null
      let t = inicio
      let cuenta = 0

      for (let k = 0; k < 2 + Math.floor(azar() * 4); k++) {
        const ruta = RUTAS[Math.floor(azar() * RUTAS.length)]
        const real = ruta.replace(':id', String(proyectos[Math.floor(azar() * proyectos.length)]))
        const ms = 8000 + Math.floor(azar() * 150_000)

        eventos.push({ sesion: id, contact_id: contacto.id, userid: contacto.client_id, tipo: 'vista', ruta: real, pestana: null, objetivo: null, objeto_id: null, duracion_ms: ms, suplantado_por: suplantado, creado_en: iso(t) })
        cuenta++

        if (real.includes('/proyectos/')) {
          eventos.push({ sesion: id, contact_id: contacto.id, userid: contacto.client_id, tipo: 'pestana', ruta: real, pestana: PESTANAS[Math.floor(azar() * PESTANAS.length)], objetivo: null, objeto_id: null, duracion_ms: Math.floor(ms / 2), suplantado_por: suplantado, creado_en: iso(t) })
          cuenta++
        }

        if (azar() > 0.4) {
          eventos.push({ sesion: id, contact_id: contacto.id, userid: contacto.client_id, tipo: 'click', ruta: real, pestana: null, objetivo: CLICKS[Math.floor(azar() * CLICKS.length)], objeto_id: null, duracion_ms: null, suplantado_por: suplantado, creado_en: iso(t + 4000) })
          cuenta++
        }

        t += ms
      }

      sesiones.push({ sesion: id, contact_id: contacto.id, userid: contacto.client_id, suplantado_por: suplantado, dispositivo: azar() > 0.7 ? 'movil' : 'escritorio', inicio: iso(inicio), ultimo: iso(t), eventos: cuenta })
    }
  })
}

sembrar()

const PATRON_RUTA = /^\/portal(\/[a-z0-9_-]+)*$/
const PATRON_CLAVE = /^[a-z0-9_.-]{1,64}$/

/** Guarda un lote, con las mismas reglas de formato que la API. */
export function registrarActividad (contacto, cuerpo, suplantadoPor) {
  if (typeof cuerpo?.session !== 'string' || !/^[a-f0-9-]{36}$/.test(cuerpo.session)) {
    throw new ErrorApi(422, 'validation_failed', '"session" tiene que ser un uuid en minusculas.')
  }

  if (!Array.isArray(cuerpo.events) || cuerpo.events.length > 50) {
    throw new ErrorApi(422, 'validation_failed', '"events" tiene que ser una lista de hasta 50.')
  }

  for (const e of cuerpo.events) {
    const bien = ['vista', 'pestana', 'click'].includes(e?.type) && PATRON_RUTA.test(e.route ?? '') &&
      (e.target === undefined || PATRON_CLAVE.test(e.target)) && (e.type !== 'click' || e.target !== undefined)

    if (!bien) throw new ErrorApi(422, 'validation_failed', 'Evento invalido.')
  }

  const ahora = iso(Date.now())
  let sesion = sesiones.find((s) => s.sesion === cuerpo.session)

  if (sesion && sesion.contact_id !== contacto.id) throw new ErrorApi(422, 'validation_failed', 'Esa sesion no es de este contacto.')

  if (!sesion) {
    sesion = { sesion: cuerpo.session, contact_id: contacto.id, userid: contacto.client_id, suplantado_por: suplantadoPor, dispositivo: cuerpo.device === 'movil' ? 'movil' : 'escritorio', inicio: ahora, ultimo: ahora, eventos: 0 }
    sesiones.push(sesion)
  }

  sesion.ultimo = ahora
  sesion.eventos += cuerpo.events.length

  for (const e of cuerpo.events) {
    eventos.push({ sesion: cuerpo.session, contact_id: contacto.id, userid: contacto.client_id, tipo: e.type, ruta: e.route, pestana: e.tab ?? null, objetivo: e.target ?? null, objeto_id: e.object_id ?? null, duracion_ms: e.duration_ms ?? null, suplantado_por: suplantadoPor, creado_en: ahora })
  }
}

const normalizar = (ruta) => ruta.replace(/\/\d+(?=\/|$)/g, '/:id')

function nombresDeProyectos (rutas) {
  const nombres = {}

  for (const ruta of rutas) {
    const m = /^\/portal\/proyectos\/(\d+)/.exec(ruta)
    const espacio = m && ESPACIOS.find((e) => e.id === Number(m[1]))

    if (espacio) nombres[espacio.id] = espacio.name
  }

  return nombres
}

const mediana = (lista) => {
  if (lista.length === 0) return 0
  const o = [...lista].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)

  return o.length % 2 ? o[m] : Math.floor((o[m - 1] + o[m]) / 2)
}

const instante = (valor) => (valor ? `${valor.replace(' ', 'T')}Z` : null)
const segundosDe = (s) => Math.max(0, Math.floor((Date.parse(`${s.ultimo.replace(' ', 'T')}Z`) - Date.parse(`${s.inicio.replace(' ', 'T')}Z`)) / 1000))

/** `GET /clients/{id}/portal-activity` */
export function actividadDeCliente (clienteId, parametros) {
  const hoy = new Date().toISOString().slice(0, 10)
  const hasta = parametros.get('hasta') ?? hoy
  const desde = parametros.get('desde') ?? new Date(Date.parse(hasta) - 29 * DIA_MS).toISOString().slice(0, 10)
  const con = parametros.get('suplantadas') === '1'
  const dentro = (valor) => valor.slice(0, 10) >= desde && valor.slice(0, 10) <= hasta
  const ses = sesiones.filter((s) => s.userid === clienteId && dentro(s.inicio) && (con || s.suplantado_por === null))
  const evs = eventos.filter((e) => e.userid === clienteId && dentro(e.creado_en) && (con || e.suplantado_por === null))

  const dias = new Map()
  const vistas = new Map()
  const clicks = new Map()
  const proyectos = new Map()
  const contactos = new Map()
  let segundos = 0

  const contactoDe = (id) => {
    if (!contactos.has(id)) contactos.set(id, { id, sesiones: 0, segundos: 0, ultima: '', rutas: new Map() })

    return contactos.get(id)
  }

  for (const s of ses) {
    const c = contactoDe(s.contact_id)

    c.sesiones++
    c.ultima = s.ultimo > c.ultima ? s.ultimo : c.ultima
    const d = dias.get(s.inicio.slice(0, 10)) ?? { dia: s.inicio.slice(0, 10), sesiones: 0, segundos: 0 }

    d.sesiones++
    dias.set(d.dia, d)
  }

  for (const e of evs) {
    const c = contactoDe(e.contact_id)
    const ruta = normalizar(e.ruta)
    const s = Math.floor((e.duracion_ms ?? 0) / 1000)

    if (e.tipo === 'vista') {
      segundos += s
      c.segundos += s
      const v = vistas.get(ruta) ?? { ruta, pestana: null, visitas: 0, segundos: 0 }

      v.visitas++
      v.segundos += s
      vistas.set(ruta, v)
      c.rutas.set(ruta, (c.rutas.get(ruta) ?? 0) + 1)
      const proyecto = /^\/portal\/proyectos\/(\d+)$/.exec(e.ruta)

      if (proyecto) {
        const id = Number(proyecto[1])
        const p = proyectos.get(id) ?? { id, nombre: ESPACIOS.find((x) => x.id === id)?.name ?? null, visitas: 0, segundos: 0 }

        p.visitas++
        p.segundos += s
        proyectos.set(id, p)
      }
      const d = dias.get(e.creado_en.slice(0, 10)) ?? { dia: e.creado_en.slice(0, 10), sesiones: 0, segundos: 0 }

      d.segundos += s
      dias.set(d.dia, d)
    } else if (e.tipo === 'pestana') {
      const clave = `${ruta}#${e.pestana}`
      const v = vistas.get(clave) ?? { ruta, pestana: e.pestana, visitas: 0, segundos: 0 }

      v.visitas++
      v.segundos += s
      vistas.set(clave, v)
    } else {
      const k = clicks.get(e.objetivo) ?? { objetivo: e.objetivo, clicks: 0 }

      k.clicks++
      clicks.set(e.objetivo, k)
    }
  }

  const filasContactos = [...contactos.values()].map((c) => {
    const real = CONTACTOS.find((x) => x.id === c.id)
    const favorita = [...c.rutas.entries()].sort((a, b) => b[1] - a[1])[0]

    return {
      id: c.id,
      nombre: real?.full_name ?? 'Contacto eliminado',
      email: real?.email ?? '',
      sesiones: c.sesiones,
      segundos: c.segundos,
      ultima_visita: instante(c.ultima || null),
      vista_favorita: favorita ? favorita[0] : null
    }
  }).sort((a, b) => String(b.ultima_visita).localeCompare(String(a.ultima_visita)))

  const orden = (m, clave) => [...m.values()].sort((a, b) => b[clave] - a[clave]).slice(0, 40)

  return {
    desde,
    hasta,
    kpis: {
      sesiones: ses.length,
      contactos_activos: filasContactos.filter((c) => c.sesiones > 0).length,
      segundos_activos: segundos,
      mediana_segundos: mediana(ses.map(segundosDe)),
      ultima_visita: instante(ses.map((s) => s.ultimo).sort().at(-1) ?? null)
    },
    por_dia: [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
    vistas: orden(vistas, 'visitas'),
    proyectos: orden(proyectos, 'visitas').slice(0, 15),
    clicks: orden(clicks, 'clicks'),
    contactos: filasContactos
  }
}

/** `GET /contacts/{id}/portal-activity` -> `{ filas, meta }`. */
export function actividadDeContacto (contactoId, parametros) {
  const con = parametros.get('suplantadas') === '1'
  const pagina = Math.max(1, Number(parametros.get('pagina') ?? 1) || 1)
  const todas = sesiones
    .filter((s) => s.contact_id === contactoId && (con || s.suplantado_por === null))
    .sort((a, b) => b.inicio.localeCompare(a.inicio))
  const trozo = todas.slice((pagina - 1) * 15, pagina * 15)
  const pasos = eventos.filter((e) => trozo.some((s) => s.sesion === e.sesion))

  const filas = trozo.map((s) => ({
    sesion: s.sesion,
    inicio: instante(s.inicio),
    segundos: segundosDe(s),
    dispositivo: s.dispositivo,
    eventos: s.eventos,
    suplantado_por: s.suplantado_por === null ? null : { id: s.suplantado_por, full_name: STAFF.find((x) => x.id === s.suplantado_por)?.full_name ?? 'Equipo' },
    pasos: pasos.filter((e) => e.sesion === s.sesion).map((e) => ({
      tipo: e.tipo,
      ruta: e.ruta,
      pestana: e.pestana,
      objetivo: e.objetivo,
      objeto_id: e.objeto_id,
      segundos: e.duracion_ms === null ? null : Math.floor(e.duracion_ms / 1000),
      a: instante(e.creado_en)
    }))
  }))

  return { filas, meta: { pagina, por_pagina: 15, total: todas.length, nombres: nombresDeProyectos(pasos.map((e) => e.ruta)) } }
}
