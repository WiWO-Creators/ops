/**
 * El Scope del contrato por Proyecto, en el mock.
 *
 * Replica el contrato de `GET|PUT /projects/{id}/scope`, `POST /ia/proyectos/{id}/scope/interpretar`
 * y `POST /ia/proyectos/{id}/scope/analizar`: la misma validacion del `PUT` (422 con
 * `required|invalid|too_long|no_editable` por campo), el 409 sin Scope, el freno de 60 s entre
 * analisis (429 con `retry_after`) y las Tareas ordenadas fuera, dudoso, dentro.
 *
 * La "IA" es deterministica a proposito: interpretar parte el texto por secciones y analizar cruza el
 * nombre de cada Tarea con los items del Scope. Lo que se prueba contra el mock es la pantalla, no el
 * modelo, y una respuesta que cambia en cada llamada no se puede probar.
 */

import { ErrorApi } from './consulta.js'

/** Topes del contrato. */
export const LIMITES = {
  resumen: 4000,
  item: 500,
  items: 100,
  texto: 100_000,
  archivoNombre: 255,
  pdfBytes: 10 * 1024 * 1024
}

/** Segundos entre dos analisis del mismo Proyecto. */
export const FRENO_ANALISIS_S = 60

const FUENTES = ['estructurado', 'texto', 'pdf']
const CLAVES_PUT = ['fuente', 'texto_original', 'archivo_nombre', 'resumen', 'incluye', 'excluye', 'supuestos']
const ORDEN = { fuera: 0, dudoso: 1, dentro: 2 }

/** Scope y analisis por Proyecto: `{ scope, analisis, ultimoAnalisisMs }`. */
const ALMACEN = new Map()
let siguienteAnalisis = 1

/** Vacia el almacen. Solo para las pruebas. */
export function reiniciarScopes () {
  ALMACEN.clear()
  siguienteAnalisis = 1
}

/** Fecha `Y-m-d H:i:s` como la devuelve la API. */
function ahoraApi (ms = Date.now()) {
  const d = new Date(ms)
  const dos = (n) => String(n).padStart(2, '0')

  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`
}

/** Quien hizo algo, con la forma del contrato. */
function autor (staff) {
  return staff ? { id: staff.id, nombre: staff.full_name ?? `${staff.firstname ?? ''} ${staff.lastname ?? ''}`.trim() } : null
}

/**
 * Valida una lista del `PUT`: strings no vacios tras trim, ≤ 500 cada uno, ≤ 100 items.
 *
 * @returns `{ valor }` o `{ error }`
 */
function validarLista (crudo) {
  if (crudo === undefined) return { valor: [] }
  if (!Array.isArray(crudo)) return { error: 'invalid' }
  if (crudo.length > LIMITES.items) return { error: 'too_long' }

  const valor = []
  for (const item of crudo) {
    if (typeof item !== 'string' || item.trim() === '') return { error: 'invalid' }
    if (item.trim().length > LIMITES.item) return { error: 'too_long' }
    valor.push(item.trim())
  }

  return { valor }
}

/**
 * Valida el cuerpo del `PUT` con las reglas del contrato.
 *
 * @param {object} datos el cuerpo
 * @returns {object} el Scope limpio
 * @throws {ErrorApi} 422 con el detalle por campo
 */
export function validarScope (datos) {
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new ErrorApi(400, 'bad_request', 'El cuerpo no es un objeto JSON válido.')
  }

  const errores = {}
  for (const clave of Object.keys(datos)) {
    if (!CLAVES_PUT.includes(clave)) errores[clave] = ['no_editable']
  }

  if (datos.fuente === undefined) errores.fuente = ['required']
  else if (!FUENTES.includes(datos.fuente)) errores.fuente = ['invalid']

  let resumen = ''
  if (datos.resumen !== undefined && datos.resumen !== null) {
    if (typeof datos.resumen !== 'string') errores.resumen = ['invalid']
    else if (datos.resumen.trim().length > LIMITES.resumen) errores.resumen = ['too_long']
    else resumen = datos.resumen.trim()
  }

  const listas = {}
  for (const clave of ['incluye', 'excluye', 'supuestos']) {
    const { valor, error } = validarLista(datos[clave])
    if (error) errores[clave] = [error]
    else listas[clave] = valor
  }

  for (const [clave, tope] of [['texto_original', LIMITES.texto], ['archivo_nombre', LIMITES.archivoNombre]]) {
    const valor = datos[clave]
    if (valor === undefined || valor === null) continue
    if (typeof valor !== 'string') errores[clave] = ['invalid']
    else if (valor.length > tope) errores[clave] = ['too_long']
  }

  if (!errores.resumen && !errores.incluye && resumen === '' && (listas.incluye ?? []).length === 0) {
    errores.resumen = ['required']
  }

  if (Object.keys(errores).length > 0) {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos del scope que no se pueden guardar.', errores)
  }

  return {
    fuente: datos.fuente,
    texto_original: datos.texto_original ?? null,
    archivo_nombre: datos.archivo_nombre ?? null,
    resumen,
    ...listas
  }
}

/** Lo que devuelve el `GET`: el analisis solo con las Tareas que aun existen. */
function presentar (espacioId, puedeEditar, procesos) {
  const guardado = ALMACEN.get(espacioId) ?? { scope: null, analisis: null }
  let analisis = null

  if (guardado.analisis !== null) {
    const vivas = new Map(procesos.map((p) => [p.id, p]))
    const tareas = guardado.analisis.tareas
      .filter((t) => vivas.has(t.task_id))
      .map((t) => ({ ...t, nombre: vivas.get(t.task_id).name, estado: vivas.get(t.task_id).status }))

    analisis = {
      ...guardado.analisis,
      scope_desactualizado: guardado.scope !== null && guardado.scope._version !== guardado.analisis._version,
      conteo: contar(tareas),
      tareas
    }
    delete analisis._version
  }

  let scope = null
  if (guardado.scope !== null) {
    scope = { ...guardado.scope }
    delete scope._version
  }

  return { puede_editar: puedeEditar, scope, analisis }
}

/** Conteo por veredicto. */
function contar (tareas) {
  const conteo = { total: tareas.length, dentro: 0, fuera: 0, dudoso: 0 }
  for (const t of tareas) conteo[t.veredicto]++

  return conteo
}

/**
 * `GET|PUT /projects/{id}/scope`.
 *
 * @param {object} opciones
 * @param {string} opciones.metodo
 * @param {object} opciones.espacio el Proyecto, ya encontrado
 * @param {object[]} opciones.procesos las Tareas del Proyecto
 * @param {object} opciones.actual staff de la sesion
 * @param {boolean} opciones.puedeEditar `projects.edit` y no archivado
 * @param {() => Promise<object>} opciones.cuerpo thunk del cuerpo
 */
export async function scopeRuta ({ metodo, espacio, procesos, actual, puedeEditar, cuerpo }) {
  if (metodo === 'GET') {
    return { estado: 200, cuerpo: { data: presentar(espacio.id, puedeEditar, procesos) } }
  }

  if (metodo !== 'PUT') throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')
  if (!puedeEditar) throw new ErrorApi(403, 'forbidden', 'Sin permiso para editar el scope de este proyecto.')

  const limpio = validarScope(await cuerpo())
  const previo = ALMACEN.get(espacio.id) ?? { scope: null, analisis: null, ultimoAnalisisMs: 0 }

  ALMACEN.set(espacio.id, {
    ...previo,
    scope: {
      ...limpio,
      actualizado_por: autor(actual),
      actualizado_en: ahoraApi(),
      _version: (previo.scope?._version ?? 0) + 1
    }
  })

  return { estado: 200, cuerpo: { data: presentar(espacio.id, puedeEditar, procesos) } }
}

/** Encabezados de seccion que reconoce la interpretacion de texto. */
const SECCIONES = [
  { clave: 'excluye', patron: /^(no incluye|excluye|fuera de(l)? (alcance|scope))\b/i },
  { clave: 'supuestos', patron: /^(supuestos|condiciones|supuestos y condiciones)\b/i },
  { clave: 'incluye', patron: /^(incluye|alcance|entregables)\b/i }
]

/**
 * Parte un texto libre en resumen y listas.
 *
 * Una linea que empieza con un encabezado conocido abre esa seccion; las viñetas se limpian. Lo que
 * viene antes del primer encabezado es el resumen.
 */
function partirTexto (texto) {
  const salida = { resumen: [], incluye: [], excluye: [], supuestos: [] }
  let seccion = 'resumen'

  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.trim().replace(/^[-*•·]\s*/, '').replace(/^\d+[.)]\s*/, '')
    if (linea === '') continue

    const encabezado = SECCIONES.find((s) => s.patron.test(linea))
    if (encabezado) {
      seccion = encabezado.clave
      const resto = linea.replace(encabezado.patron, '').replace(/^[:\s]+/, '').trim()
      if (resto !== '') salida[seccion].push(resto)
      continue
    }

    salida[seccion].push(linea)
  }

  return {
    resumen: salida.resumen.join(' ').slice(0, LIMITES.resumen),
    incluye: salida.incluye.slice(0, LIMITES.items),
    excluye: salida.excluye.slice(0, LIMITES.items),
    supuestos: salida.supuestos.slice(0, LIMITES.items)
  }
}

/** Observaciones verosimiles segun lo que falte. */
function observar (contenido) {
  const observaciones = []

  if (contenido.excluye.length === 0) observaciones.push('El contrato no dice qué queda fuera del alcance: conviene acordarlo por escrito.')
  if (contenido.supuestos.length === 0) observaciones.push('No se indican supuestos ni condiciones (plazos de entrega de insumos, rondas de revisión).')
  if (!contenido.incluye.some((i) => /\d/.test(i))) observaciones.push('Ningún entregable trae cantidades: "diseño de piezas" no dice cuántas.')

  return observaciones
}

/**
 * `POST /ia/proyectos/{id}/scope/interpretar`. No guarda nada.
 *
 * @param {object} entrada `{ fuente, texto, resumen, incluye, excluye, supuestos, archivo }`, ya leida
 *   del JSON o del multipart; `archivo` es `{ nombre, bytes, tipo }` o `null`
 * @returns el `data` del contrato
 * @throws {ErrorApi} 422 si falta el texto o el PDF no sirve
 */
export function interpretarScope (entrada) {
  const fuente = entrada.fuente
  if (!FUENTES.includes(fuente)) {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden interpretar.', { fuente: [fuente === undefined ? 'required' : 'invalid'] })
  }

  const texto = typeof entrada.texto === 'string' ? entrada.texto.trim() : ''
  if (texto.length > LIMITES.texto) {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden interpretar.', { texto: ['too_long'] })
  }

  let contenido

  if (fuente === 'texto') {
    if (texto === '') throw new ErrorApi(422, 'validation_failed', 'Falta el texto del contrato.', { texto: ['required'] })
    contenido = partirTexto(texto)
    if (contenido.resumen === '' && contenido.incluye.length === 0) contenido.resumen = texto.slice(0, 280)
  } else if (fuente === 'pdf') {
    const archivo = entrada.archivo
    if (!archivo) throw new ErrorApi(422, 'validation_failed', 'Falta el PDF del contrato.', { archivo: ['required'] })
    if (archivo.bytes > LIMITES.pdfBytes) throw new ErrorApi(422, 'validation_failed', 'El PDF pesa más de 10 MB.', { archivo: ['too_long'] })
    if (!/\.pdf$/i.test(archivo.nombre) && archivo.tipo !== 'application/pdf') {
      throw new ErrorApi(422, 'validation_failed', 'El archivo no es un PDF.', { archivo: ['invalid'] })
    }
    // El mock no lee PDFs: responde un alcance tipico y suma lo que venga como contexto.
    const contexto = texto === '' ? null : partirTexto(texto)
    contenido = {
      resumen: `Alcance leído de «${archivo.nombre}»: rediseño y mantención del sitio durante el periodo del contrato.`,
      incluye: ['Diseño de la pantalla de acceso', 'Flujo de alta de usuarios', 'Barra lateral y navegación', ...(contexto?.incluye ?? [])],
      excluye: ['Hosting y dominio', 'Migración de datos históricos', ...(contexto?.excluye ?? [])],
      supuestos: ['El cliente entrega los textos y las imágenes', ...(contexto?.supuestos ?? [])]
    }
  } else {
    const limpiar = (lista) => (Array.isArray(lista) ? lista : []).filter((i) => typeof i === 'string' && i.trim() !== '').map((i) => i.trim())
    contenido = {
      resumen: typeof entrada.resumen === 'string' ? entrada.resumen.trim() : '',
      incluye: limpiar(entrada.incluye),
      excluye: limpiar(entrada.excluye),
      supuestos: limpiar(entrada.supuestos)
    }
    if (contenido.resumen === '' && contenido.incluye.length === 0) {
      throw new ErrorApi(422, 'validation_failed', 'Falta el resumen o lo que incluye.', { resumen: ['required'] })
    }
    if (contenido.resumen === '') contenido.resumen = `Contrato que incluye ${contenido.incluye.length} entregables.`
  }

  return { ...contenido, observaciones: observar(contenido) }
}

/** Palabras con peso de un texto: minusculas, sin tildes, de 5 letras o mas. */
function palabras (texto) {
  return new Set(
    texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .split(/[^a-z0-9]+/).filter((p) => p.length >= 5)
  )
}

/** El primer item de la lista que comparte una palabra con el nombre, o `null`. */
function coincidencia (nombre, items) {
  const delNombre = palabras(nombre)

  return items.find((item) => [...palabras(item)].some((p) => delNombre.has(p))) ?? null
}

/**
 * Clasifica una Tarea contra el Scope.
 *
 * Primero lo excluido, despues lo incluido; sin coincidencia el veredicto sale del id, para que el
 * mock siempre muestre los tres grupos.
 */
function clasificar (proceso, scope) {
  const fuera = coincidencia(proceso.name, scope.excluye)
  if (fuera) return { veredicto: 'fuera', motivo: 'El contrato lo deja explícitamente fuera del alcance.', referencia: fuera }

  const dentro = coincidencia(proceso.name, scope.incluye)
  if (dentro) return { veredicto: 'dentro', motivo: 'Corresponde a un entregable declarado en el contrato.', referencia: dentro }

  const resto = proceso.id % 4
  if (resto === 0) return { veredicto: 'fuera', motivo: 'No aparece en ningún entregable y parece un pedido adicional.', referencia: null }
  if (resto === 1) return { veredicto: 'dudoso', motivo: 'Podría entrar en un entregable general, pero el contrato no lo detalla.', referencia: scope.supuestos[0] ?? null }

  return { veredicto: 'dentro', motivo: 'Es trabajo de soporte de los entregables contratados.', referencia: scope.incluye[0] ?? null }
}

/**
 * `POST /ia/proyectos/{id}/scope/analizar`.
 *
 * @param {object} opciones
 * @param {object} opciones.espacio el Proyecto
 * @param {object[]} opciones.procesos sus Tareas (se toman hasta 600)
 * @param {object} opciones.actual staff de la sesion
 * @param {number} [opciones.ahora] reloj, para las pruebas
 * @returns el analisis nuevo, con la forma del `GET`
 * @throws {ErrorApi} 409 sin Scope, 429 dentro del freno
 */
export function analizarScope ({ espacio, procesos, actual, ahora = Date.now() }) {
  const guardado = ALMACEN.get(espacio.id)
  if (!guardado || guardado.scope === null) {
    throw new ErrorApi(409, 'conflict', 'El Proyecto no tiene scope cargado.')
  }

  const transcurrido = (ahora - (guardado.ultimoAnalisisMs ?? 0)) / 1000
  if (transcurrido < FRENO_ANALISIS_S) {
    const espera = Math.ceil(FRENO_ANALISIS_S - transcurrido)
    throw new ErrorApi(429, 'rate_limited', `Este proyecto se analizó hace poco. Espera ${espera} s.`, { retry_after: espera })
  }

  const tareas = procesos.slice(0, 600)
    .map((p) => ({ task_id: p.id, nombre: p.name, estado: p.status, ...clasificar(p, guardado.scope) }))
    .sort((a, b) => ORDEN[a.veredicto] - ORDEN[b.veredicto])
  const conteo = contar(tareas)

  guardado.ultimoAnalisisMs = ahora
  guardado.analisis = {
    id: siguienteAnalisis++,
    creado_en: ahoraApi(ahora),
    creado_por: autor(actual),
    resumen: conteo.total === 0
      ? 'El proyecto no tiene tareas que analizar.'
      : `De ${conteo.total} tareas, ${conteo.fuera} quedan fuera del scope y ${conteo.dudoso} son dudosas. Conviene conversar las de afuera con el cliente antes de seguir.`,
    conteo,
    tareas,
    _version: guardado.scope._version
  }

  return presentar(espacio.id, true, procesos).analisis
}
