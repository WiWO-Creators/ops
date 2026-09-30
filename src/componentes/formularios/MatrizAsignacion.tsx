'use client'

import { useEffect, useEffectEvent, useState, type ReactNode } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { AvisoEnLinea, Cargando, Vacio } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import type { Resultado } from '@/componentes/datos/mutaciones'

/** Un rechazo de `escribirEnBff`, para traducirlo a palabras. */
export type RechazoDeAsignacion = Extract<Resultado<unknown>, { ok: false }>

/** Lo que trae la carga inicial: lo que ofrece el selector y lo que está asignado hoy. */
export interface CargaDeAsignacion<O, A> {
  opciones: O[]
  asignados: A[]
}

/** Los textos de la relación; el éxito nombra la entidad entre «». */
export interface TextosDeAsignacion {
  cargando: string
  falloDeCarga: string
  leyenda: ReactNode
  descripcion: ReactNode
  sinNinguno: ReactNode
  guardar: string
  exito: string
  vacio: { titulo: string, descripcion: string }
}

interface PropsMatrizAsignacion<O extends { id: number }, A> {
  /** Cambia cuando hay que volver a cargar: la entidad mirada y lo que condiciona la carga. */
  clave: string
  puedeEditar: boolean
  cargar: (senal: AbortSignal) => Promise<CargaDeAsignacion<O, A>>
  guardar: (ids: number[]) => Promise<Resultado<A[]>>
  idDe: (asignado: A) => number
  comoOpcion: (asignado: A) => O
  textos: TextosDeAsignacion
  selector: (opciones: O[], elegidos: number[], onCambiar: (ids: number[]) => void) => ReactNode
  chip: (asignado: A) => ReactNode
  /** Chips con avatar o imagen, que piden menos relleno a la izquierda. */
  chipConImagen?: boolean
  /** Explica un rechazo de la API; por omisión, su mensaje tal cual. */
  explicarRechazo?: (rechazo: RechazoDeAsignacion) => string
  /** Va sobre los chips en solo lectura, si hay alguno. */
  antesDeLaLista?: ReactNode
  /** Acompaña al botón y a la lista en solo lectura, si hay algo asignado. */
  extra?: ReactNode
}

/**
 * Los mismos ids, sin importar el orden en que se eligieron.
 *
 * @param unos ids elegidos
 * @param otros ids asignados
 * @returns si son el mismo conjunto
 */
function mismosIds (unos: number[], otros: number[]): boolean {
  if (unos.length !== otros.length) return false

  const ordenados = [...otros].sort((a, b) => a - b)

  return [...unos].sort((a, b) => a - b).every((id, i) => id === ordenados[i])
}

/**
 * Relación N-a-M editable de una entidad con otras: los Focals o Supervisores de un Cliente, o los
 * Clientes de una persona.
 *
 * Carga opciones y asignados en paralelo, ofrece el selector a quien puede editar y guarda la lista
 * entera con un `PUT` (una lista vacía deja la relación vacía). Sin permiso muestra los chips en solo
 * lectura. Lo ya asignado entra al catálogo aunque no venga en él —se dio de baja, bajó de escalón o
 * no entró en la página pedida—: si no, el selector lo mostraría vacío y guardar lo sacaría sin que
 * nadie lo pidiera.
 *
 * @param props relación, textos y dibujo del selector y de cada chip
 * @returns la carga, el error, el formulario o la lista en solo lectura
 */
export function MatrizAsignacion<O extends { id: number }, A> ({
  clave, puedeEditar, cargar, guardar, idDe, comoOpcion, textos, selector, chip,
  chipConImagen = false, explicarRechazo, antesDeLaLista, extra
}: PropsMatrizAsignacion<O, A>) {
  const aviso = useAviso()
  const [opciones, setOpciones] = useState<O[]>([])
  const [asignados, setAsignados] = useState<A[]>([])
  const [elegidos, setElegidos] = useState<number[]>([])
  const [cargando, setCargando] = useState(true)
  const [cargado, setCargado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const alCargar = useEffectEvent((senal: AbortSignal) => cargar(senal))
  const aOpcion = useEffectEvent((asignado: A) => comoOpcion(asignado))
  const aId = useEffectEvent((asignado: A) => idDe(asignado))
  const falloDeCarga = useEffectEvent(() => textos.falloDeCarga)

  useEffect(() => {
    const aborto = new AbortController()

    void alCargar(aborto.signal).then((carga) => {
      if (aborto.signal.aborted) return
      setOpciones([...new Map([...carga.opciones, ...carga.asignados.map(aOpcion)].map((o) => [o.id, o])).values()])
      setAsignados(carga.asignados)
      setElegidos(carga.asignados.map(aId))
      setCargado(true)
    }).catch((fallo: unknown) => {
      if (!aborto.signal.aborted) setError(fallo instanceof Error ? fallo.message : falloDeCarga())
    }).finally(() => {
      if (!aborto.signal.aborted) setCargando(false)
    })

    return () => aborto.abort()
  }, [clave])

  /** Reemplaza la lista entera y lo confirma con un aviso. */
  async function enviar (evento: React.FormEvent) {
    evento.preventDefault()
    if (!cargado || enviando) return

    setEnviando(true)
    setError(null)

    const resultado = await guardar(elegidos)
    setEnviando(false)

    if (!resultado.ok) {
      setError(explicarRechazo ? explicarRechazo(resultado) : resultado.mensaje)
      return
    }

    setAsignados(resultado.datos)
    setElegidos(resultado.datos.map(idDe))
    aviso.exito(textos.exito)
  }

  if (cargando) return <Cargando alto="min-h-36" mensaje={textos.cargando} />

  if (!cargado) {
    return (
      <AvisoEnLinea
        variante="error"
        mensaje={`${error ?? textos.falloDeCarga} Recarga la página si el problema continúa.`}
        className="text-sm"
      />
    )
  }

  const conAlgo = asignados.length > 0

  if (!puedeEditar) {
    if (!conAlgo) return <Vacio titulo={textos.vacio.titulo} descripcion={textos.vacio.descripcion} />

    return (
      <div className="flex flex-col gap-3">
        {antesDeLaLista}
        <ul className="flex flex-wrap gap-2">
          {asignados.map((asignado) => (
            <li
              key={idDe(asignado)}
              className={`bg-relleno-neutro text-relleno-neutro-contenido rounded-control text-sm ${chipConImagen ? 'flex items-center gap-2 py-1 pl-1 pr-3' : 'px-3 py-1'}`}
            >
              {chip(asignado)}
            </li>
          ))}
        </ul>
        {extra !== undefined && <div>{extra}</div>}
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="flex w-full max-w-md flex-col gap-3">
      <fieldset disabled={enviando} className="min-w-0">
        <legend className="mb-1 text-sm font-medium">{textos.leyenda}</legend>
        {textos.descripcion}
        {selector(opciones, elegidos, setElegidos)}
        {elegidos.length === 0 && <p className="text-texto-tenue mt-2 text-xs">{textos.sinNinguno}</p>}
      </fieldset>

      {error !== null && <AvisoEnLinea variante="error" mensaje={error} className="text-sm" />}

      <div className="flex flex-wrap items-center gap-3">
        <Boton
          type="submit"
          tamano="chico"
          variante="primario"
          disabled={enviando || mismosIds(elegidos, asignados.map(idDe))}
          cargando={enviando}
        >
          {textos.guardar}
        </Boton>
        {conAlgo && extra}
      </div>
    </form>
  )
}
