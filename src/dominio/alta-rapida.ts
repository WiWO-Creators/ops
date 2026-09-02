import { hoyLocal } from '../lib/fechas.ts'

/**
 * Alta rapida de un Proceso: de una linea de texto a un cuerpo de `POST /tasks`.
 *
 * El punto de esto no es ahorrar clics sino **quitar la decision previa**. Hoy hay que saber a que
 * Espacio pertenece una tarea antes de poder anotarla, y por eso las tareas terminan en un chat.
 * Aca se escribe primero y se ordena despues: todo lo que no se reconoce **queda en el titulo**, y
 * nada se pierde en silencio.
 *
 * Vive fuera de React a proposito. Es la parte con reglas —fechas relativas, nombres ambiguos— y
 * tiene que poder probarse sin montar un componente.
 */

export interface CatalogosAlta {
  personas: ReadonlyArray<{ id: number, full_name: string }>
  espacios: ReadonlyArray<{ id: number, name: string }>
  prioridades: ReadonlyArray<{ id: number, name: string }>
}

export interface AltaRapida {
  name: string
  due_date: string | null
  priority: number | null
  assignees: number[]
  rel_type: 'project' | null
  rel_id: number | null
  /** Lo que se escribio con prefijo y no se pudo resolver. Sigue estando en `name`. */
  sinResolver: string[]
}

/** Dias de la semana en el orden de `Date.getDay()`, ya normalizados. */
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

/** Parte `YYYY-MM-DD` en sus tres numeros. Devuelve una tupla para que el tipo no traiga `undefined`. */
function partesDeFecha (fecha: string): [number, number, number] {
  const [anio = 0, mes = 1, dia = 1] = fecha.split('-').map(Number)

  return [anio, mes, dia]
}

/** Minusculas y sin acentos: `Colbún` y `colbun` tienen que ser la misma palabra. */
function normalizar (texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/**
 * Suma dias a una fecha `YYYY-MM-DD` sin corrimiento de huso.
 *
 * `new Date('2026-08-24')` se interpreta como UTC y en cualquier huso al oeste de Greenwich devuelve
 * el 23. Construyendo con componentes locales, no.
 */
function sumarDias (fecha: string, dias: number): string {
  const [anio, mes, dia] = partesDeFecha(fecha)
  const base = new Date(anio, mes - 1, dia)

  base.setDate(base.getDate() + dias)

  return hoyLocal(base)
}

/**
 * Resuelve una palabra suelta a una fecha de entrega, si es que lo es.
 *
 * @returns La fecha en `YYYY-MM-DD`, o `null` si la palabra no era una fecha.
 */
function comoFecha (palabra: string, hoy: string): string | null {
  const limpia = normalizar(palabra)

  if (limpia === 'hoy') return hoy
  if (limpia === 'manana') return sumarDias(hoy, 1)
  if (limpia === 'pasado') return sumarDias(hoy, 2)

  // `viernes` dicho un viernes significa hoy, no dentro de una semana.
  const indice = DIAS_SEMANA.indexOf(limpia)
  if (indice !== -1) {
    const [anio, mes, dia] = partesDeFecha(hoy)
    const actual = new Date(anio, mes - 1, dia).getDay()

    return sumarDias(hoy, (indice - actual + 7) % 7)
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(limpia)) return limpia

  // `30/9` y `30-9`: dia y mes, con el año en curso. Si ya paso, se entiende el del año que viene.
  const corta = limpia.match(/^(\d{1,2})[/-](\d{1,2})$/)
  if (corta) {
    const dia = Number(corta[1])
    const mes = Number(corta[2])
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null

    const anio = Number(hoy.slice(0, 4))
    const candidata = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

    return candidata < hoy
      ? `${anio + 1}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
      : candidata
  }

  return null
}

/**
 * Busca una fila del catalogo por nombre, sin acentos y por prefijo.
 *
 * Una coincidencia ambigua devuelve `null` a proposito: es preferible dejar `@juan` en el titulo y
 * que la persona elija, antes que asignarle la tarea al Juan equivocado.
 */
function buscarUnico<T extends { id: number, [clave: string]: unknown }> (
  filas: ReadonlyArray<T>,
  campo: keyof T,
  texto: string
): T | null {
  const buscado = normalizar(texto)
  const nombre = (fila: T): string => normalizar(String(fila[campo]))

  const exactas = filas.filter((f) => nombre(f) === buscado)
  if (exactas.length === 1) return exactas[0] ?? null

  // Por prefijo, y tambien por prefijo de cualquier palabra: `@franz` encuentra a "Franz Molina",
  // y `#dia` encuentra a "Campaña Día del Niño".
  const parciales = filas.filter((f) => nombre(f).split(/\s+/).some((p) => p.startsWith(buscado)))

  return parciales.length === 1 ? parciales[0] ?? null : null
}

/**
 * Interpreta una linea de alta rapida.
 *
 * `Grilla Colbún septiembre mañana @franz #Colbún !alta`
 *
 * @param texto  Lo que se escribio.
 * @param catalogos Personas, Espacios y prioridades contra los que resolver.
 * @param ahora  Instante de referencia; parametro para poder probarlo.
 * @returns El cuerpo listo para `POST /tasks`, con lo no resuelto declarado.
 */
export function interpretarAltaRapida (
  texto: string,
  catalogos: CatalogosAlta,
  ahora: Date = new Date()
): AltaRapida {
  const hoy = hoyLocal(ahora)
  const sinResolver: string[] = []
  const assignees: number[] = []

  let prioridad: number | null = null
  let espacio: number | null = null

  // `@"Ana Rivas"` para nombres con espacio; `@ana` para el caso normal.
  const resto = texto.replace(
    /([@#!])(?:"([^"]*)"|([^\s"]+))/g,
    (completo, prefijo: string, entrecomillado: string | undefined, suelto: string | undefined) => {
      const valor = entrecomillado ?? suelto ?? ''
      if (valor === '') return completo

      if (prefijo === '@') {
        const persona = buscarUnico(catalogos.personas, 'full_name', valor)
        if (!persona) { sinResolver.push(completo); return completo }
        if (!assignees.includes(persona.id)) assignees.push(persona.id)
        return ''
      }

      if (prefijo === '#') {
        const encontrado = buscarUnico(catalogos.espacios, 'name', valor)
        if (!encontrado) { sinResolver.push(completo); return completo }
        espacio = encontrado.id
        return ''
      }

      const nivel = buscarUnico(catalogos.prioridades, 'name', valor)
      if (!nivel) { sinResolver.push(completo); return completo }
      prioridad = nivel.id
      return ''
    }
  )

  // La fecha se saca despues de los prefijos para no confundir `#30/9` con una fecha.
  let due: string | null = null
  const palabras = resto.split(/\s+/).filter((p) => p !== '')
  const titulo: string[] = []

  for (const palabra of palabras) {
    const fecha: string | null = due === null ? comoFecha(palabra, hoy) : null
    if (fecha !== null) due = fecha
    else titulo.push(palabra)
  }

  return {
    name: titulo.join(' ').trim(),
    due_date: due,
    priority: prioridad,
    assignees,
    rel_type: espacio === null ? null : 'project',
    rel_id: espacio,
    sinResolver
  }
}
