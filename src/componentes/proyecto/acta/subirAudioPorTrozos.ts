import { escribirEnBff, leerDelBff } from '@/componentes/datos/mutaciones'
import { cuantosTrozos } from '@/dominio/actas'
import type { Acta } from '@/datos/recursos'

/**
 * Meeting Paper desde audio como trabajo asíncrono: sube por trozos y espera el resultado.
 *
 * === POR QUÉ ASÍ ===
 *
 * Un audio de decenas de MB en una sola petición cruza Apache y el BFF, que lo bufferiza entero, y
 * después el servidor tarda minutos en transcribir. Cualquier proxy que corte esa petición larga
 * devuelve un 502 y el acta se pierde. Acá ninguna petición dura más que unos segundos: se declara el
 * trabajo, se sube en trozos pequeños que se pueden repetir, se cierra la subida y se pregunta el
 * estado cada pocos segundos. El servidor sigue trabajando aunque se cierre la pestaña.
 */

/** Cuántos trozos viajan a la vez. */
const SIMULTANEOS = 3

/** Veces que se reintenta un trozo antes de rendirse. */
const REINTENTOS = 4

/** Milisegundos entre una consulta de estado y la siguiente. */
const ESPERA_ENTRE_CONSULTAS = 3000

/** Consultas seguidas que pueden fallar antes de dar el trabajo por inalcanzable. */
const FALLAS_TOLERADAS = 20

/** Espera base de un reintento; crece con cada intento. */
const ESPERA_REINTENTO = 800

/** Lo que `onProgreso` informa. */
export interface ProgresoDelTrabajo {
  fase: 'subiendo' | 'procesando'
  /** Bytes ya recibidos por el servidor; solo en la fase de subida. */
  subidos: number
  total: number
  /** Lo que el servidor dice que está haciendo; solo en la fase de proceso. */
  etiqueta: string | null
}

interface PlanDeSubida {
  trabajo: string
  trozo_bytes: number
  archivos: Array<{ nombre: string, bytes: number, trozos: number }>
}

interface EstadoDelTrabajo {
  estado: 'subiendo' | 'en_cola' | 'procesando' | 'listo' | 'error'
  etiqueta: string | null
  acta_id: number | null
  error: { code: string | null, message: string | null } | null
}

/** Resultado de generar: el acta, o el motivo legible por el que no hubo. */
export type ResultadoDelTrabajo =
  | { ok: true, acta: Acta }
  | { ok: false, mensaje: string, cancelado: boolean }

interface OpcionesDelTrabajo {
  proyectoId: number
  archivos: File[]
  /** Campos de cabecera del formulario (cliente, fecha, lugar...). */
  campos: Record<string, string>
  senal: AbortSignal
  onProgreso: (progreso: ProgresoDelTrabajo) => void
}

/**
 * Sube el audio, lo manda a procesar y espera el Meeting Paper.
 *
 * Nunca lanza: todo fallo vuelve como valor con un mensaje que la pantalla puede mostrar.
 *
 * @param opciones el proyecto, los archivos, los campos del formulario, la señal y el avance
 * @returns el acta ya guardada, o el mensaje del fallo
 */
export async function generarActaDeAudio (opciones: OpcionesDelTrabajo): Promise<ResultadoDelTrabajo> {
  const { proyectoId, archivos, campos, senal, onProgreso } = opciones
  const base = `ia/proyectos/${proyectoId}/acta-audio`
  const total = archivos.reduce((suma, a) => suma + a.size, 0)

  const abierto = await escribirEnBff<PlanDeSubida>(
    base,
    'POST',
    { archivos: archivos.map((a) => ({ nombre: a.name, bytes: a.size })) },
    senal
  )

  if (!abierto.ok) return { ok: false, mensaje: abierto.mensaje, cancelado: senal.aborted }

  const { trabajo, trozo_bytes: tamano } = abierto.datos
  const ruta = `${base}/${trabajo}`
  let subidos = 0

  onProgreso({ fase: 'subiendo', subidos, total, etiqueta: null })

  const pendientes: Array<{ archivo: number, trozo: number, blob: Blob }> = []

  archivos.forEach((archivo, indice) => {
    for (let n = 0; n < cuantosTrozos(archivo.size, tamano); n++) {
      pendientes.push({ archivo: indice, trozo: n, blob: archivo.slice(n * tamano, (n + 1) * tamano) })
    }
  })

  let falla: string | null = null

  async function trabajador (): Promise<void> {
    while (falla === null && !senal.aborted) {
      const siguiente = pendientes.shift()

      if (siguiente === undefined) return

      const error = await subirTrozo(`${ruta}/${siguiente.archivo}/${siguiente.trozo}`, siguiente.blob, senal)

      if (error !== null) {
        falla = error

        return
      }

      subidos += siguiente.blob.size
      onProgreso({ fase: 'subiendo', subidos, total, etiqueta: null })
    }
  }

  await Promise.all(Array.from({ length: SIMULTANEOS }, trabajador))

  if (senal.aborted) return { ok: false, mensaje: 'Cancelado.', cancelado: true }
  if (falla !== null) return { ok: false, mensaje: falla, cancelado: false }

  const cerrado = await cerrarSubida(`${ruta}/procesar`, campos, senal)

  if (!cerrado.ok) return { ok: false, mensaje: cerrado.mensaje, cancelado: senal.aborted }

  onProgreso({ fase: 'procesando', subidos: total, total, etiqueta: cerrado.datos.etiqueta })

  return await esperarElActa(proyectoId, ruta, total, senal, onProgreso)
}

/**
 * Sube un trozo, reintentando si falla.
 *
 * Repetir un trozo es seguro: el servidor lo reescribe. Un 4xx no se reintenta, porque repetirlo
 * daría lo mismo.
 *
 * @returns `null` si llegó, o el mensaje del último intento
 */
async function subirTrozo (ruta: string, blob: Blob, senal: AbortSignal): Promise<string | null> {
  let ultimo = 'No se pudo subir el audio.'

  for (let intento = 0; intento < REINTENTOS; intento++) {
    if (senal.aborted) return 'Cancelado.'

    const cuerpo = new FormData()
    cuerpo.append('trozo', blob, 'trozo.bin')

    const respuesta = await escribirEnBff<undefined>(ruta, 'POST', cuerpo, senal)

    if (respuesta.ok) return null

    ultimo = respuesta.mensaje

    if (respuesta.estado !== undefined && respuesta.estado >= 400 && respuesta.estado < 500) return ultimo

    await esperar(ESPERA_REINTENTO * (intento + 1), senal)
  }

  return ultimo
}

/** Cierra la subida. Repetirlo es seguro: el servidor solo toma el trabajo una vez. */
async function cerrarSubida (ruta: string, campos: Record<string, string>, senal: AbortSignal) {
  let ultima = await escribirEnBff<EstadoDelTrabajo>(ruta, 'POST', { campos }, senal)

  for (let intento = 1; !ultima.ok && intento < REINTENTOS && !senal.aborted; intento++) {
    if (ultima.estado !== undefined && ultima.estado >= 400 && ultima.estado < 500) break

    await esperar(ESPERA_REINTENTO * intento, senal)
    ultima = await escribirEnBff<EstadoDelTrabajo>(ruta, 'POST', { campos }, senal)
  }

  return ultima
}

/**
 * Pregunta el estado hasta que el trabajo termina y trae el acta.
 *
 * Un fallo suelto de la consulta no es un fallo del trabajo: el servidor sigue procesando aunque una
 * respuesta se pierda. Solo se rinde tras `FALLAS_TOLERADAS` consultas seguidas sin respuesta.
 */
async function esperarElActa (
  proyectoId: number,
  ruta: string,
  total: number,
  senal: AbortSignal,
  onProgreso: (progreso: ProgresoDelTrabajo) => void
): Promise<ResultadoDelTrabajo> {
  let seguidas = 0

  while (!senal.aborted) {
    await esperar(ESPERA_ENTRE_CONSULTAS, senal)

    const consulta = await leerDelBff<EstadoDelTrabajo>(ruta)

    if (!consulta.ok) {
      seguidas++

      if (consulta.estado !== undefined && consulta.estado >= 400 && consulta.estado < 500) {
        return { ok: false, mensaje: consulta.mensaje, cancelado: false }
      }

      if (seguidas >= FALLAS_TOLERADAS) {
        return {
          ok: false,
          mensaje: 'Se perdió la conexión con el servidor. El Meeting Paper puede haberse guardado: revisa la lista.',
          cancelado: false
        }
      }

      continue
    }

    seguidas = 0

    const estado = consulta.datos

    if (estado.estado === 'error') {
      return {
        ok: false,
        mensaje: estado.error?.message ?? 'No se pudo generar el Meeting Paper.',
        cancelado: false
      }
    }

    if (estado.estado === 'listo' && estado.acta_id !== null) {
      return await traerElActa(proyectoId, estado.acta_id)
    }

    onProgreso({ fase: 'procesando', subidos: total, total, etiqueta: estado.etiqueta })
  }

  return { ok: false, mensaje: 'Cancelado.', cancelado: true }
}

/** Lee el acta ya guardada. Si no se puede, el mensaje manda a la lista: el acta existe igual. */
async function traerElActa (proyectoId: number, actaId: number): Promise<ResultadoDelTrabajo> {
  const acta = await leerDelBff<Acta>(`projects/${proyectoId}/actas/${actaId}`)

  if (acta.ok) return { ok: true, acta: acta.datos }

  return {
    ok: false,
    mensaje: 'El Meeting Paper se generó pero no se pudo abrir. Búscalo en la lista.',
    cancelado: false
  }
}

/** Espera `ms`, o menos si se cancela. */
async function esperar (ms: number, senal: AbortSignal): Promise<void> {
  await new Promise<void>((resolver) => {
    const temporizador = setTimeout(resolver, ms)

    senal.addEventListener('abort', () => {
      clearTimeout(temporizador)
      resolver()
    }, { once: true })
  })
}
