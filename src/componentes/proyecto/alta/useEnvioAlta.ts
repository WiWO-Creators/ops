import { useRouter } from 'next/navigation'
import { useRef, useState, type RefObject } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import {
  cuerpoDeCamposPersonalizados, esquemaDeCamposPersonalizados, valoresPorDefecto,
  type ErroresDeCampos, type ValoresDeCampos
} from '@/dominio/campos-personalizados'
import { GLOSARIO } from '@/dominio/glosario'
import type { DefinicionCampoPersonalizado } from '@/datos/recursos'
import { RUTA_MULTI, type ParteMulti, type ResumenParcial } from './modelo'

interface OpcionesEnvio {
  definiciones: DefinicionCampoPersonalizado[]
  personalizados: ValoresDeCampos
  cargando: boolean
  errorCarga: string | null
  /** El nombre del Espacio para el parte del alta múltiple. */
  nombreDeEspacio: (id: number) => string
  /** Lleva a la persona al modo donde están los campos personalizados con error. */
  alFallarPersonalizados: () => void
  /** Cierra el alta tras crear; con mensaje avisa el éxito. */
  alCrear: (mensaje?: string) => void
  /** Deja elegidos solo los Espacios que hay que reintentar. */
  alQuedarPendientes: (pendientes: number[]) => void
  onOcupado?: (ocupado: boolean) => void
}

/** El estado del envío y los errores que muestra el formulario. */
export interface EnvioDelAlta {
  /** Hay un envío en vuelo. Se lee en eventos, no al pintar. */
  enviando: RefObject<boolean>
  enCurso: boolean
  error: string | null
  mostrarError: (mensaje: string | null) => void
  /**
   * El error de la descripcion va aparte del `error` del formulario.
   *
   * La descripcion es obligatoria, y el cartel generico de arriba del boton Crear no sirve para
   * un campo que esta a media pantalla de distancia: hay que verlo donde se escribe y hay que
   * quedar parado ahi. Por eso no es un `alert()`, que ademas se lleva el foco a un boton de
   * Aceptar y lo devuelve al body.
   */
  errorDescripcion: string | null
  mostrarErrorDescripcion: (mensaje: string | null) => void
  /**
   * El parte del último alta múltiple que salió a medias.
   *
   * Va aparte de `error` y no se borra al reintentar hasta tener uno nuevo: cuando se crean tres de
   * cinco, lo que la persona necesita saber es cuáles tres —para no volver a crearlas— y por qué
   * fallaron las otras dos. Un cartel genérico que además vacíe el formulario obliga a reescribir
   * todo y adivinar dónde quedó la tarea.
   */
  parcial: ResumenParcial | null
  olvidarParcial: () => void
  /** La tarea ya creada cuyos campos personalizados faltan guardar; `null` si no hay. */
  creadaId: number | null
  erroresCampos: ErroresDeCampos
  olvidarErroresCampos: () => void
  enviar: (cuerpo: Record<string, unknown>) => Promise<void>
  enviarEnVariosEspacios: (cuerpo: Record<string, unknown>, destinos: number[]) => Promise<void>
  /** Olvida errores, partes y la tarea creada. */
  reiniciar: () => void
}

/**
 * Envía el alta en uno o varios Espacios y guarda sus campos personalizados.
 *
 * @param opciones los campos personalizados, el estado de la carga y cómo reaccionar al resultado
 * @returns el estado del envío y las dos rutas de alta
 */
export function useEnvioAlta (opciones: OpcionesEnvio): EnvioDelAlta {
  const { definiciones, personalizados, onOcupado } = opciones
  const router = useRouter()
  const enviando = useRef(false)
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDescripcion, setErrorDescripcion] = useState<string | null>(null)
  const [parcial, setParcial] = useState<ResumenParcial | null>(null)
  const [creadaId, setCreadaId] = useState<number | null>(null)
  const [erroresCampos, setErroresCampos] = useState<ErroresDeCampos>({})

  /**
   * Lo que las dos rutas de alta comprueban antes de escribir nada.
   *
   * @returns `true` si se puede enviar; si no, ya dejó el motivo a la vista.
   */
  function puedeEnviar (): boolean {
    if (enviando.current || opciones.cargando || opciones.errorCarga !== null) return false

    const fallos = esquemaDeCamposPersonalizados(definiciones).validar(personalizados, valoresPorDefecto(definiciones))

    setErroresCampos(fallos)
    if (Object.keys(fallos).length > 0) {
      setError('Revisa los campos personalizados marcados.')
      opciones.alFallarPersonalizados()

      return false
    }

    return true
  }

  /**
   * Guarda los campos personalizados de una tarea recién creada.
   *
   * Van en un PATCH aparte porque `POST /tasks` no los acepta: necesitan el id de la tarea. Con
   * varios destinos se repite el mismo PATCH con los mismos valores, uno por tarea.
   *
   * @param id id de la tarea creada
   * @returns `null` si se guardaron o si no había nada que guardar; el mensaje del fallo si no.
   */
  async function guardarPersonalizados (id: number): Promise<string | null> {
    const parche = cuerpoDeCamposPersonalizados('tasks', id, definiciones, valoresPorDefecto(definiciones), personalizados)

    if (parche === null) return null

    const guardados = await escribirEnBff('custom-fields/values', 'PATCH', parche)

    return guardados.ok ? null : guardados.mensaje
  }

  /**
   * Corre un envío marcando el formulario como ocupado mientras dura.
   *
   * @param tarea el envío propiamente dicho
   */
  async function conEnvioEnCurso (tarea: () => Promise<void>): Promise<void> {
    enviando.current = true
    onOcupado?.(true)
    setEnCurso(true)
    setError(null)
    try {
      await tarea()
    } finally {
      enviando.current = false
      onOcupado?.(false)
      setEnCurso(false)
    }
  }

  /**
   * Manda el alta de UNA tarea. Es el camino de todos los días y no cambió.
   *
   * @param cuerpo el cuerpo de `POST /tasks`, ya sin campos vacios
   */
  async function enviar (cuerpo: Record<string, unknown>): Promise<void> {
    if (!puedeEnviar()) return
    await conEnvioEnCurso(async () => {
      let id = creadaId
      if (id === null) {
        const resultado = await escribirEnBff<{ id: number }>('tasks', 'POST', cuerpo)
        if (!resultado.ok) { setError(resultado.mensaje); return }
        if (!Number.isInteger(resultado.datos?.id)) {
          setError('El servidor no devolvió el identificador. Revisa la lista antes de volver a crear la tarea.')
          return
        }
        id = resultado.datos.id
        setCreadaId(id)
      }
      const falloDeCampos = await guardarPersonalizados(id)
      if (falloDeCampos !== null) {
        setError(`La tarea #${id} ya está creada. Reintenta guardar sus campos personalizados: ${falloDeCampos}`)
        return
      }
      opciones.alCrear(`«${String(cuerpo.name)}» se creó.`)
    })
  }

  /**
   * Arma el parte de un alta múltiple y guarda los campos personalizados de lo que se creó.
   *
   * @param parte lo que devolvió `POST /tasks/multi-espacio`
   * @returns qué pasó en cada Espacio y cuáles hay que reintentar
   */
  async function resumirParte (parte: ParteMulti): Promise<ResumenParcial> {
    const hechos: ResumenParcial['hechos'] = []
    const pendientes: number[] = []

    for (const creado of parte.creados) {
      const falloDeCampos = await guardarPersonalizados(creado.task_id)

      hechos.push({
        espacioId: creado.espacio_id,
        nombre: opciones.nombreDeEspacio(creado.espacio_id),
        detalle: falloDeCampos === null
          ? `Tarea #${creado.task_id} creada.`
          : `Tarea #${creado.task_id} creada, pero sus campos personalizados no se guardaron: ${falloDeCampos}`,
        ok: falloDeCampos === null
      })
    }

    for (const fallido of parte.fallidos) {
      hechos.push({
        espacioId: fallido.espacio_id,
        nombre: opciones.nombreDeEspacio(fallido.espacio_id),
        detalle: fallido.motivo,
        ok: false
      })
      pendientes.push(fallido.espacio_id)
    }

    return { hechos, pendientes }
  }

  /**
   * Manda el alta de la MISMA tarea en varios Espacios, en una sola petición.
   *
   * Una petición y no una por Espacio: `POST /tasks/multi-espacio` valida el cuerpo compartido antes
   * de crear la primera tarea, así que un error de tipeo no deja tres tareas creadas y dos sin
   * crear. Lo que puede salir a medias de ahí para adelante —un Espacio que alguien eliminó, un
   * choque de la base— vuelve en el parte, destino por destino.
   *
   * Si algo falla NO se toca el formulario: se muestra qué pasó en cada Espacio y la selección queda
   * reducida a los que faltan, para que el siguiente clic no duplique los que ya se crearon.
   *
   * @param cuerpo el cuerpo compartido, sin `rel_type`, `rel_id`, `milestone` ni `task_type`
   * @param destinos ids de los Espacios donde crear la tarea
   */
  async function enviarEnVariosEspacios (cuerpo: Record<string, unknown>, destinos: number[]): Promise<void> {
    if (!puedeEnviar()) return
    await conEnvioEnCurso(async () => {
      const respuesta = await escribirEnBff<ParteMulti>(RUTA_MULTI, 'POST', { ...cuerpo, espacios: destinos })

      if (!respuesta.ok) {
        // Incluye la caída de red: `escribirEnBff` no lanza. No se creó nada o no se sabe, y por eso
        // el formulario queda intacto con su selección completa.
        setError(respuesta.mensaje)

        return
      }

      const parte = respuesta.datos

      if (!Array.isArray(parte?.creados) || !Array.isArray(parte.fallidos)) {
        setError(`El servidor no devolvió en qué ${GLOSARIO.espacio.plural.toLowerCase()} quedó la tarea. Revísalos antes de volver a crearla.`)

        return
      }

      const resumen = await resumirParte(parte)

      if (resumen.hechos.length > 0 && resumen.hechos.every((hecho) => hecho.ok)) {
        opciones.alCrear(`«${String(cuerpo.name)}» se creó en ${resumen.hechos.length} ${GLOSARIO.espacio.plural.toLowerCase()}.`)

        return
      }

      setParcial(resumen)
      // Solo se recorta la selección cuando queda algo que reintentar. Dejarla vacía convertiría el
      // siguiente clic en una tarea sin Espacio.
      if (resumen.pendientes.length > 0) opciones.alQuedarPendientes(resumen.pendientes)
      // Las que sí se crearon ya existen: la lista de atrás tiene que mostrarlas aunque el diálogo
      // siga abierto.
      if (parte.creados.length > 0) router.refresh()
    })
  }

  return {
    enviando,
    enCurso,
    error,
    mostrarError: setError,
    errorDescripcion,
    mostrarErrorDescripcion: setErrorDescripcion,
    parcial,
    olvidarParcial: () => { setParcial(null) },
    creadaId,
    erroresCampos,
    olvidarErroresCampos: () => { setErroresCampos({}) },
    enviar,
    enviarEnVariosEspacios,
    reiniciar: () => {
      setError(null)
      setErrorDescripcion(null)
      setParcial(null)
      setCreadaId(null)
      setErroresCampos({})
    }
  }
}
