'use client'

import { useEffect, useState } from 'react'
import { escribirEnBff, leerDelBff } from '@/componentes/datos/mutaciones'
import { useAviso } from '@/componentes/estado/useAviso'
import type {
  ParcheDePropuesta,
  PropuestaDeTarea,
  PropuestasDelActa,
  ResultadoDeCreacion
} from '@/definiciones/actas'
import {
  avisoDeCreadas,
  conCreadas,
  conPropuesta,
  errorDeFallidas,
  sinPropuesta,
  type Carga,
  type EnCurso
} from './modeloPropuestas'

interface OpcionesDePropuestas {
  /** Ruta del recurso, con el id del acta ya resuelto. */
  ruta: string
  /** El Espacio del acta: arma la ruta de la IA. */
  proyectoId: number
  /** El acta de la que salen. Va en el cuerpo de "Analizar buscando tareas". */
  actaId: number
  /** Se llama cuando el modelo devolvió propuestas nuevas, en el mismo paso en que se muestran. */
  onAnalizada: () => void
}

export interface PropuestasDelActaEnPantalla {
  carga: Carga
  pendientes: PropuestaDeTarea[]
  creadas: PropuestaDeTarea[]
  hayPendientes: boolean
  /**
   * Sin ninguna fila —ni pendiente, ni creada, ni descartada— el acta nunca pasó por el análisis:
   * es anterior a él, se escribió a mano o el proveedor falló al generarla. Se distingue de "no
   * salieron tareas" porque lo que corresponde ofrecer es analizarla, no volver a hacerlo.
   */
  sinAnalizar: boolean
  seleccionadas: number[]
  todasSeleccionadas: boolean
  error: string | null
  /** Confirmación de la última creación. Se limpia al empezar otra operación para no mentir. */
  aviso: string | null
  enCurso: EnCurso
  reintentar: () => void
  alternar: (id: number) => void
  alternarTodas: () => void
  parchear: (id: number, parche: ParcheDePropuesta) => Promise<boolean>
  descartar: (propuesta: PropuestaDeTarea) => Promise<void>
  crear: (ids: number[], fila: number | null) => Promise<void>
  analizar: () => Promise<void>
}

/**
 * Las propuestas de un acta: su carga, la selección para crear en tanda y las cuatro escrituras
 * que las cambian.
 *
 * @param opciones la ruta del recurso, el Espacio y el acta, y qué hacer tras analizar
 * @returns la lista, lo derivado de ella y sus acciones
 */
export function usePropuestasDelActa ({
  ruta,
  proyectoId,
  actaId,
  onAnalizada
}: OpcionesDePropuestas): PropuestasDelActaEnPantalla {
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [seleccionadas, setSeleccionadas] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enCurso, setEnCurso] = useState<EnCurso>(null)
  const avisos = useAviso()

  /**
   * Volver a "cargando" en el render y no en el efecto.
   *
   * Es el mismo idiom que `useRecurso` (`componentes/proyecto/carga.ts`): cambiar de acta con las
   * propuestas de la anterior todavia en pantalla mostraria por un instante la lista equivocada, y
   * hacerlo desde un efecto encadena renders —la regla de hooks lo rechaza—. React admite este
   * `setState` durante el render: reinicia el render antes de pintar.
   */
  const peticion = `${ruta}|${intento}`
  const [enVuelo, setEnVuelo] = useState(peticion)

  if (enVuelo !== peticion) {
    setEnVuelo(peticion)
    setCarga({ fase: 'cargando' })
    setSeleccionadas([])
    setError(null)
    setAviso(null)
  }

  useEffect(() => {
    let vivo = true

    void leerDelBff<PropuestasDelActa>(ruta).then((resultado) => {
      if (!vivo) return

      setCarga(resultado.ok
        ? { fase: 'listo', datos: resultado.datos }
        : { fase: 'error', mensaje: resultado.mensaje })
    })

    return () => { vivo = false }
  }, [ruta, intento])

  const items = carga.fase === 'listo' ? carga.datos.items : []
  const pendientes = items.filter((propuesta) => propuesta.estado === 'pendiente')
  const creadas = items.filter((propuesta) => propuesta.estado === 'creada')
  const hayPendientes = pendientes.length > 0
  const todasSeleccionadas = hayPendientes && pendientes.every((propuesta) => seleccionadas.includes(propuesta.id))

  /** Deja la lista como la devolvió la API y suelta lo que estuviera seleccionado de la tanda vieja. */
  function reponer (datos: PropuestasDelActa): void {
    setCarga({ fase: 'listo', datos })
    setSeleccionadas([])
  }

  /** Marca o desmarca una propuesta para la creación en tanda. */
  function alternar (id: number): void {
    setSeleccionadas((previas) => previas.includes(id)
      ? previas.filter((elegida) => elegida !== id)
      : [...previas, id])
  }

  /** "Seleccionar todas": si ya están todas marcadas las suelta, si no marca todas las pendientes. */
  function alternarTodas (): void {
    setSeleccionadas(todasSeleccionadas ? [] : pendientes.map((propuesta) => propuesta.id))
  }

  /**
   * Guarda los campos que se tocaron de una propuesta.
   *
   * @param id la propuesta que se edita
   * @param parche solo lo que cambió; la API deja el resto como estaba
   * @returns `true` si la API lo aceptó, para que el diálogo sepa si puede cerrarse
   */
  async function parchear (id: number, parche: ParcheDePropuesta): Promise<boolean> {
    setError(null)

    const resultado = await escribirEnBff<PropuestaDeTarea>(`${ruta}/${id}`, 'PATCH', parche)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return false
    }

    setCarga((previo) => conPropuesta(previo, resultado.datos))
    avisos.exito(`Cambios de «${resultado.datos.titulo}» guardados.`)

    return true
  }

  /** Saca una propuesta de la lista. No crea ni borra ningún Proceso: nunca llegó a existir. */
  async function descartar (propuesta: PropuestaDeTarea): Promise<void> {
    setEnCurso({ que: 'descartando', id: propuesta.id })
    setError(null)

    const resultado = await escribirEnBff(`${ruta}/${propuesta.id}`, 'DELETE')

    setEnCurso(null)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    setSeleccionadas((previas) => previas.filter((elegida) => elegida !== propuesta.id))
    setCarga((previo) => sinPropuesta(previo, propuesta.id))
    avisos.exito(`«${propuesta.titulo}» se descartó.`)
  }

  /**
   * Convierte en Procesos las propuestas pedidas: una sola desde su fila, o la tanda de abajo.
   *
   * La API contesta con dos listas y las dos importan: crear ocho tareas y que dos fallen no es un
   * error de la operación, y esconder las seis que sí se crearon obligaría a recargar para saber
   * qué pasó. Las creadas bajan a "Ya creadas" y las fallidas se quedan donde estaban, con el motivo
   * a la vista para poder arreglarlas y volver a intentar.
   *
   * @param ids las propuestas a crear; una lista vacía no hace nada
   * @param fila la fila desde la que se pidió, o `null` si fue la tanda
   */
  async function crear (ids: number[], fila: number | null): Promise<void> {
    if (ids.length === 0) return

    setEnCurso({ que: 'creando', fila })
    setError(null)
    setAviso(null)

    const resultado = await escribirEnBff<ResultadoDeCreacion>(
      `${ruta}/crear`, 'POST', { propuestas: ids }
    )

    setEnCurso(null)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    setCarga((previo) => conCreadas(previo, resultado.datos.creadas))

    // Lo que falló queda marcado para reintentarlo; lo que no se pidió conserva su marca, porque
    // crear una fila suelta no es decidir sobre las otras.
    const fallidas = resultado.datos.fallidas.map((fallida) => fallida.propuesta_id)
    setSeleccionadas((previas) => [
      ...previas.filter((elegida) => !ids.includes(elegida)),
      ...fallidas
    ])

    const avisoNuevo = avisoDeCreadas(resultado.datos.creadas.length)
    if (avisoNuevo !== null) setAviso(avisoNuevo)

    const errorNuevo = errorDeFallidas(resultado.datos.fallidas)
    if (errorNuevo !== null) setError(errorNuevo)
  }

  /**
   * Le pide al modelo que vuelva a leer el acta.
   *
   * Quien la llama pregunta antes cuando ya hay propuestas pendientes: lo que se pierde no es lo que
   * escribió el modelo —eso se vuelve a generar— sino las correcciones a mano que alguien ya hizo
   * sobre ellas.
   */
  async function analizar (): Promise<void> {
    setEnCurso({ que: 'proponiendo' })
    setError(null)
    setAviso(null)

    const resultado = await escribirEnBff<PropuestasDelActa>(
      `ia/proyectos/${proyectoId}/acta-tareas`, 'POST', { acta_id: actaId }
    )

    setEnCurso(null)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    reponer(resultado.datos)
    onAnalizada()
  }

  return {
    carga,
    pendientes,
    creadas,
    hayPendientes,
    sinAnalizar: carga.fase === 'listo' && items.length === 0,
    seleccionadas,
    todasSeleccionadas,
    error,
    aviso,
    enCurso,
    reintentar: () => { setIntento((n) => n + 1) },
    alternar,
    alternarTodas,
    parchear,
    descartar,
    crear,
    analizar
  }
}
