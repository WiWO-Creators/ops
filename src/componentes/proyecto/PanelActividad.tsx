'use client'

import { useState, type ReactElement } from 'react'
import { PaginacionTabla } from '@/componentes/datos/ControlesTabla'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { mensajeDeRespuesta } from '@/datos/cliente'
import type { Capacidad } from '@/datos/tipos'
import { conConsulta, type FuenteDeProyecto } from '@/dominio/fuente-proyecto'
import { LineaDeActividad } from './LineaDeActividad'
import type { EntradaDeActividad } from './actividad'
import { useRecurso } from './carga'

/**
 * Pestaña Actividad del Proyecto, como linea de tiempo.
 *
 * **No es una tabla.** El feed es una sucesion de momentos, no un conjunto de filas comparables: no
 * tiene filtros, no tiene busqueda y su unico orden es el cronologico (ver `ACTIVIDAD` en
 * `definiciones/discusiones.ts`). Puesto en el motor de tabla, el encabezado ofrecia ordenar por lo
 * unico por lo que ya venia ordenado y la fecha se repetia entera en cada fila. Agrupado por dia, la
 * fecha se escribe una vez y cada entrada se queda con su hora.
 *
 * Es **solo presentacion**: los mismos datos, la misma ruta y la misma paginacion que antes. No hay
 * ninguna peticion nueva.
 *
 * `description` y `additional_data` llegan ya traducidas y con los pseudo-tags `<seconds>` y `<lang>`
 * resueltos por la API. Rehacer esa sustitucion aca seria duplicar logica del backend.
 *
 * **La misma linea de tiempo la abren el equipo y el cliente.** Lo unico que cambia es de donde
 * bajan las entradas —`fuente`— y que manda cada contrato. El interruptor de "Visible para el
 * cliente" se dibuja **solo cuando la entrada trae esa clave**, que es lo que el contrato dice: el
 * del contacto no la emite —al portal solo llegan las visibles, y el campo seria siempre "Sí"— y
 * entonces la fila no lleva control. Sobre esa clave, `create projects` decide si ademas se puede
 * cambiar.
 */

/**
 * Lo minimo que la linea de tiempo pinta de una entrada.
 *
 * Se declara lo que se usa y no `ActividadEspacio`: la misma pestaña la abre el contacto, y su
 * contrato no publica `visible_to_customer`. Clave ausente = interruptor que no se dibuja.
 */
interface EntradaDeProyecto extends EntradaDeActividad {
  id: number
  visible_to_customer?: boolean
}

interface PropsPanelActividad {
  /** De donde baja la actividad de este Proyecto. Ver `dominio/fuente-proyecto.ts`. */
  fuente: FuenteDeProyecto
  /** Capacidades sobre `projects`. */
  capacidades: Capacidad[]
}

/** Cuantas entradas trae cada pagina. Es el mismo tope por defecto que usa el motor de tabla. */
const POR_PAGINA = 25

export function PanelActividad ({ fuente, capacidades }: PropsPanelActividad): ReactElement {
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(POR_PAGINA)
  const puedeCambiarVisibilidad = capacidades.includes('create')

  const { estado, recargar } = useRecurso<EntradaDeProyecto[]>(
    conConsulta(fuente.actividad, `page=${pagina}&per_page=${porPagina}`),
    'No se pudo cargar la actividad del proyecto.'
  )

  if (estado.fase === 'cargando') return <Cargando alto="min-h-60" mensaje="Cargando la actividad…" />
  if (estado.fase === 'error') return <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />

  return (
    <div className="flex flex-col gap-4">
      <LineaDeActividad
        entradas={estado.datos}
        accion={(entrada) => (
          entrada.visible_to_customer === undefined
            ? null
            : (
              <InterruptorVisibilidad
                entrada={entrada}
                visible={entrada.visible_to_customer}
                ruta={fuente.actividad}
                habilitado={puedeCambiarVisibilidad}
                recargar={recargar}
              />
              )
        )}
      />

      <PaginacionTabla
        paginacion={estado.meta?.pagination}
        onCambiar={(parcial) => {
          if (parcial.porPagina !== undefined) setPorPagina(parcial.porPagina)
          if (parcial.pagina !== undefined) setPagina(parcial.pagina)
        }}
      />
    </div>
  )
}

interface PropsInterruptor {
  entrada: EntradaDeProyecto
  /** El valor que trae la entrada, ya comprobado por quien lo monta: acá nunca es `undefined`. */
  visible: boolean
  /** Ruta del feed de este Proyecto; la entrada cuelga de ella. */
  ruta: string
  habilitado: boolean
  recargar: () => void
}

/**
 * Interruptor de visibilidad de una entrada de actividad.
 *
 * Es optimista: pinta el cambio y lo revierte si el `PATCH` falla. Sin permiso queda deshabilitado
 * pero visible, para que se lea el valor actual.
 */
function InterruptorVisibilidad ({
  entrada,
  visible: inicial,
  ruta,
  habilitado,
  recargar
}: PropsInterruptor): ReactElement {
  const [visible, setVisible] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  /** Cambia la visibilidad. Nunca lanza: el fallo vuelve el interruptor a su valor anterior. */
  async function cambiar (siguiente: boolean): Promise<void> {
    const previo = visible

    setVisible(siguiente)
    setGuardando(true)
    setFallo(null)

    try {
      const respuesta = await fetch(`/api/bff/${ruta}/${entrada.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ visible_to_customer: siguiente })
      })

      if (!respuesta.ok) {
        setVisible(previo)
        setFallo(await mensajeDeRespuesta(respuesta))
        return
      }

      recargar()
    } catch {
      setVisible(previo)
      setFallo('No se pudo cambiar: revisa la conexión.')
    } finally {
      setGuardando(false)
    }
  }

  /*
   * Sin orbe a proposito. El cambio es optimista: la casilla ya se pinto en su valor nuevo, asi que
   * no hay nada que esperar en pantalla. Lo unico que falta comunicar es que todavia no esta
   * confirmado, y eso lo dice `aria-busy` con la casilla deshabilitada. Un indicador de carga al lado
   * de un valor que ya cambio es el orbe puesto sin logica, que es justo lo que se saco del producto.
   */
  return (
    <span className="flex shrink-0 items-center gap-2" aria-busy={guardando}>
      {fallo !== null && <span role="alert" className="text-texto-peligro text-xs">{fallo}</span>}

      {/* La etiqueta dice la frase entera y no "Sí"/"No": en la tabla el sentido lo daba el
          encabezado de la columna, y en una linea de tiempo no hay encabezado que lo de. */}
      <label className="text-texto-sutil flex items-center gap-1.5 py-1 text-[0.6875rem] whitespace-nowrap">
        <input
          type="checkbox"
          checked={visible}
          disabled={!habilitado || guardando}
          onChange={(evento) => { void cambiar(evento.target.checked) }}
          className="accent-acento size-4"
        />
        Visible para el cliente
      </label>
    </span>
  )
}
