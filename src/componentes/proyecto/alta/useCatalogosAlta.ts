import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { cargarAsignables } from '@/datos/asignables'
import { cargarClientesDestino, cargarEspaciosDestino } from '@/datos/espacios-destino'
import { pedirSobre } from '@/datos/cliente'
import { camposOrdenados } from '@/dominio/campos-personalizados'
import { asignadosIniciales, type CatalogosAlta } from '@/dominio/alta-rapida'
import type { EspaciosDestino } from '@/dominio/espacios-destino'
import type { DefinicionCampoPersonalizado, Lookups, Referencia } from '@/datos/recursos'
import type { StaffReferencia, Yo } from '@/datos/tipos'

const CATALOGOS_VACIOS: CatalogosAlta = { personas: [], espacios: [], prioridades: [] }
const ETIQUETAS_VACIAS: Referencia[] = []

/** Mientras el catalogo no llega no hay ninguna Licitacion ni Upsell que separar. */
const SIN_OPORTUNIDADES: ReadonlySet<number> = new Set<number>()
const SIN_CLIENTES: Referencia[] = []

/** Lo que el alta necesita saber cuando terminan de llegar los catálogos. */
export interface CargaDelAlta {
  /** Los campos personalizados de las tareas, ya en su orden. */
  definiciones: DefinicionCampoPersonalizado[]
  destinos: EspaciosDestino
  /** Quién arranca como responsable: quien está creando, si es asignable. */
  asignados: number[]
}

interface OpcionesCatalogos {
  abierto: boolean
  proyectoId?: number
  catalogosRecibidos?: CatalogosAlta
  etiquetasRecibidas?: Referencia[]
  /** Se llama una vez por carga exitosa, para que el borrador tome sus valores iniciales. */
  alCargar: (carga: CargaDelAlta) => void
}

/** Los catálogos del alta y el estado de su carga. */
export interface CatalogosDelAlta {
  catalogos: CatalogosAlta
  lookups: Lookups | null
  /**
   * Cuales de los Espacios del catalogo son Licitaciones y cuales Upsells.
   *
   * Solo para ofrecer cada catalogo por su lado: la Tarea se crea igual que en un Proyecto
   * —`rel_type` `project` y el id del Espacio—, porque una Licitacion o un Upsell **es** un Espacio.
   */
  licitaciones: ReadonlySet<number>
  upsells: ReadonlySet<number>
  definiciones: DefinicionCampoPersonalizado[]
  etiquetas: Referencia[]
  nombresDelCatalogo: string[]
  personas: StaffReferencia[]
  opcionesDeClientes: Array<{ valor: string, etiqueta: string }>
  /** Quien esta creando. Arranca como responsable y vuelve a serlo al limpiar el alta (WIW-0444). */
  yoId: number | null
  cargando: boolean
  errorCarga: string | null
  /** Vuelve a pedir los catálogos tras un fallo. */
  reintentar: () => void
  /** Deja la carga como pendiente, para la próxima apertura. */
  reiniciarCarga: () => void
}

/**
 * Trae los catálogos del alta cada vez que se abre.
 *
 * No se habilita el alta hasta conocer también los campos personalizados obligatorios.
 *
 * @param opciones si el alta está abierta, el Espacio fijado, los catálogos que ya trae la
 *   pantalla y qué hacer con el borrador cuando la carga termina
 * @returns los catálogos, sus derivados para los selectores y el estado de la carga
 */
export function useCatalogosAlta (opciones: OpcionesCatalogos): CatalogosDelAlta {
  const { abierto, proyectoId, catalogosRecibidos, etiquetasRecibidas } = opciones
  const [catalogos, setCatalogos] = useState<CatalogosAlta>(catalogosRecibidos ?? CATALOGOS_VACIOS)
  const [lookups, setLookups] = useState<Lookups | null>(null)
  const [licitaciones, setLicitaciones] = useState<ReadonlySet<number>>(SIN_OPORTUNIDADES)
  const [upsells, setUpsells] = useState<ReadonlySet<number>>(SIN_OPORTUNIDADES)
  const [clientes, setClientes] = useState<Referencia[]>(SIN_CLIENTES)
  const [definiciones, setDefiniciones] = useState<DefinicionCampoPersonalizado[]>([])
  const [yoId, setYoId] = useState<number | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [intentoCarga, setIntentoCarga] = useState(0)
  const alCargar = useEffectEvent(opciones.alCargar)

  useEffect(() => {
    if (!abierto) return
    const control = new AbortController()
    const cargar = async (): Promise<void> => {
      try {
        const [campos, respuestaLookups, personas, destinos, cartera, yo] = await Promise.all([
          pedirSobre<DefinicionCampoPersonalizado[]>('custom-fields?para=tasks', control.signal),
          pedirSobre<Lookups>('lookups', control.signal),
          cargarAsignables(),
          cargarEspaciosDestino(control.signal),
          cargarClientesDestino(control.signal),
          // Sin `/me` el alta sigue funcionando, solo que sin responsable preelegido.
          pedirSobre<Yo>('me', control.signal).then((sobre) => sobre.data.id, () => null)
        ])
        if (control.signal.aborted) return
        const ordenadas = camposOrdenados(campos.data)
        const iniciales = asignadosIniciales(yo, personas)
        setDefiniciones(ordenadas)
        setLookups(respuestaLookups.data)
        setLicitaciones(destinos.licitaciones)
        setUpsells(destinos.upsells)
        setClientes(cartera)
        setCatalogos({ personas, espacios: destinos.espacios, prioridades: respuestaLookups.data.task_priorities })
        setYoId(iniciales[0] ?? null)
        alCargar({ definiciones: ordenadas, destinos, asignados: iniciales })
        setErrorCarga(null)
      } catch (fallo) {
        if (!control.signal.aborted) setErrorCarga(fallo instanceof Error ? fallo.message : 'No se pudieron cargar los campos de la tarea.')
      } finally {
        if (!control.signal.aborted) setCargando(false)
      }
    }
    void cargar()
    return () => { control.abort() }
  }, [abierto, intentoCarga, proyectoId])

  const etiquetas = etiquetasRecibidas ?? lookups?.tags ?? ETIQUETAS_VACIAS
  const nombresDelCatalogo = useMemo(() => etiquetas.map((etiqueta) => etiqueta.name), [etiquetas])
  const opcionesDeClientes = useMemo(
    () => clientes.map((cliente) => ({ valor: String(cliente.id), etiqueta: cliente.name })),
    [clientes]
  )

  // `SelectorPersonas` pinta el avatar de cada persona y los catalogos del alta pueden venir sin la
  // foto: se completa aca para no obligar a cada pantalla que monta el alta a traerla.
  const personas: StaffReferencia[] = useMemo(
    () => catalogos.personas.map((persona) => ({
      id: persona.id,
      full_name: persona.full_name,
      profile_image_url: persona.profile_image_url ?? null
    })),
    [catalogos.personas]
  )

  return {
    catalogos,
    lookups,
    licitaciones,
    upsells,
    definiciones,
    etiquetas,
    nombresDelCatalogo,
    personas,
    opcionesDeClientes,
    yoId,
    cargando,
    errorCarga,
    reintentar: () => { setCargando(true); setIntentoCarga((valor) => valor + 1) },
    reiniciarCarga: () => { setCargando(true); setErrorCarga(null) }
  }
}
