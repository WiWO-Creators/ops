'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoSelector, DisparadorSelector, Opcion, Selector } from '@/componentes/formularios/Selector'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { Espacio, PlantillaEspacio, PlantillaEspacioDetallada } from '@/datos/recursos'
import type { OpcionFiltro } from '@/definiciones/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { formatearFecha, hoyLocal } from '@/lib/fechas'
import { entregaPrevista, factorDeEscalado, previsualizarPlantilla } from '@/lib/plantillas'
import { cn } from '@/lib/clases'
import { useRecurso } from './carga'

/**
 * Alta de un {espacio} a partir de una plantilla.
 *
 * Lo que distingue a esta pantalla del alta normal es que **casi nada se escribe**: la plantilla trae
 * los hitos y los {procesos}, y la duracion esperada mueve todas las fechas a la vez. El unico dato
 * de mas es esa duracion.
 *
 * Por eso la vista previa no es un adorno: crear cuarenta {procesos} mal fechados y descubrirlo
 * despues cuesta mucho mas que leer una lista antes de confirmar. Las fechas que se muestran salen de
 * la misma formula que declara el contrato, pero **quien manda es el backend**: esto es lo que va a
 * pasar, no lo que se guarda.
 */

interface PropsDialogo {
  /** `true` abre el dialogo. */
  abierto: boolean
  /** Plantillas visibles, tal como las devuelve `GET /project-templates`. */
  plantillas: PlantillaEspacio[]
  clientes: OpcionFiltro[]
  onCerrar: () => void
}

export function DialogoDesdePlantilla ({ abierto, plantillas, clientes, onCerrar }: PropsDialogo) {
  if (!abierto) return null

  return (
    <Dialogo open onOpenChange={(sigue) => { if (!sigue) onCerrar() }}>
      <ContenidoDialogo
        titulo={`Nuevo ${GLOSARIO.espacio.singular.toLowerCase()} desde plantilla`}
        ancho="grande"
      >
        {plantillas.length === 0
          ? (
            <Vacio
              titulo="Todavía no hay plantillas"
              descripcion={`Arma una en Plantillas de ${GLOSARIO.espacio.singular} y vuelve acá.`}
            />
            )
          : <Formulario plantillas={plantillas} clientes={clientes} onCerrar={onCerrar} />}
      </ContenidoDialogo>
    </Dialogo>
  )
}

interface PropsFormulario {
  plantillas: PlantillaEspacio[]
  clientes: OpcionFiltro[]
  onCerrar: () => void
}

function Formulario ({ plantillas, clientes, onCerrar }: PropsFormulario) {
  const router = useRouter()
  const [plantillaId, setPlantillaId] = useState(String(plantillas[0]?.id ?? ''))
  const [nombre, setNombre] = useState('')
  const [cliente, setCliente] = useState('')
  const [inicio, setInicio] = useState(hoyLocal())
  const [duracion, setDuracion] = useState('')
  const [creando, setCreando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  const elegida = plantillas.find((p) => String(p.id) === plantillaId)

  // El detalle trae los `items`, que el listado no incluye. Se pide al elegir la plantilla porque es
  // exactamente cuando hace falta: sin plantilla elegida no hay nada que previsualizar.
  const { estado, recargar } = useRecurso<PlantillaEspacioDetallada>(
    `project-templates/${plantillaId}`,
    'No se pudo cargar la plantilla.'
  )

  const duracionPedida = duracion.trim() === '' ? null : Number(duracion)
  const factor = factorDeEscalado(duracionPedida, elegida?.duration_days)

  const previsualizacion = useMemo(
    () => (estado.fase === 'listo' ? previsualizarPlantilla(inicio, estado.datos.items, factor) : []),
    [estado, inicio, factor]
  )

  const entrega = entregaPrevista(inicio, duracionPedida, previsualizacion)

  /**
   * Crea el {espacio} entero en una sola peticion.
   *
   * `deadline` no viaja: el contrato lo rechaza con `422 no_editable` porque lo deriva del maximo
   * entre la duracion y el ultimo item. La vista previa lo muestra, pero no lo manda.
   */
  async function crear (evento: React.FormEvent) {
    evento.preventDefault()

    if (nombre.trim() === '') {
      setFallo('El nombre es obligatorio.')
      return
    }

    if (cliente === '') {
      setFallo(`Elige un ${GLOSARIO.cliente.singular.toLowerCase()}.`)
      return
    }

    setCreando(true)
    setFallo(null)

    const resultado = await escribirEnBff<Espacio>('projects/from-template', 'POST', {
      template_id: Number(plantillaId),
      name: nombre.trim(),
      clientid: Number(cliente),
      start_date: inicio,
      ...(duracionPedida === null ? {} : { duration_days: duracionPedida })
    })

    setCreando(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    onCerrar()
    // Al {espacio} recien creado y no de vuelta al listado: lo que sigue es mirar los hitos que
    // acaban de nacer, y volver a una lista obliga a buscarlo entre los demas.
    router.push(`/espacios/${resultado.datos.id}`)
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(evento) => { void crear(evento) }}>
      <Campo
        etiqueta="Plantilla"
        requerido
        {...(elegida?.description === null || elegida?.description === undefined
          ? {}
          : { ayuda: elegida.description })}
      >
        {(props) => (
          <Selector value={plantillaId} onValueChange={setPlantillaId}>
            <DisparadorSelector id={props.id} marcador="Elige una plantilla" />
            <ContenidoSelector>
              {plantillas.map((plantilla) => (
                <Opcion key={plantilla.id} value={String(plantilla.id)}>{plantilla.name}</Opcion>
              ))}
            </ContenidoSelector>
          </Selector>
        )}
      </Campo>

      <Campo etiqueta="Nombre" requerido>
        {(props) => <Entrada {...props} value={nombre} onChange={(e) => { setNombre(e.target.value) }} />}
      </Campo>

      <Campo etiqueta={GLOSARIO.cliente.singular} requerido>
        {(props) => (
          <Selector value={cliente} onValueChange={setCliente}>
            <DisparadorSelector id={props.id} marcador={`Elige un ${GLOSARIO.cliente.singular.toLowerCase()}`} />
            <ContenidoSelector>
              {clientes.map((opcion) => (
                <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
              ))}
            </ContenidoSelector>
          </Selector>
        )}
      </Campo>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Fecha de inicio" requerido>
          {(props) => (
            <Entrada {...props} type="date" value={inicio} onChange={(e) => { setInicio(e.target.value) }} />
          )}
        </Campo>

        <Campo
          etiqueta="Duración esperada (días)"
          ayuda={
            elegida?.duration_days === null || elegida?.duration_days === undefined || elegida.duration_days === 0
              ? 'La plantilla no declara duración: las fechas van tal cual.'
              : `La plantilla declara ${elegida.duration_days} días.`
          }
        >
          {(props) => (
            <Entrada
              {...props}
              type="number"
              min={1}
              value={duracion}
              onChange={(e) => { setDuracion(e.target.value) }}
            />
          )}
        </Campo>
      </div>

      <VistaPrevia
        estado={estado}
        recargar={recargar}
        factor={factor}
        entrega={entrega}
        previsualizacion={previsualizacion}
      />

      {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}

      <div className="flex justify-end gap-2">
        <CerrarDialogo asChild>
          <Boton variante="sutil">Cancelar</Boton>
        </CerrarDialogo>
        <Boton type="submit" variante="primario" cargando={creando}>
          Crear {GLOSARIO.espacio.singular.toLowerCase()}
        </Boton>
      </div>
    </form>
  )
}

interface PropsVistaPrevia {
  estado: ReturnType<typeof useRecurso<PlantillaEspacioDetallada>>['estado']
  recargar: () => void
  factor: number
  entrega: string | null
  previsualizacion: ReturnType<typeof previsualizarPlantilla>
}

/**
 * Lo que va a quedar, antes de confirmar.
 *
 * El factor se muestra explicito porque es lo unico que explica por que un hito que la plantilla
 * declara en 5 dias aparece con 10: sin el numero a la vista, la lista parece equivocada.
 */
function VistaPrevia ({ estado, recargar, factor, entrega, previsualizacion }: PropsVistaPrevia) {
  if (estado.fase === 'cargando') {
    return <Cargando alto="min-h-32" mensaje="Calculando las fechas…" />
  }

  if (estado.fase === 'error') {
    return <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />
  }

  return (
    <section className="border-linea bg-superficie-elevada rounded-tarjeta border p-4">
      <div className="border-linea-suave mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
        <h3 className="text-texto font-titular text-sm font-semibold">Cómo va a quedar</h3>
        <p className="text-texto-sutil text-xs tabular-nums">
          Escala ×{factor.toFixed(2).replace(/\.?0+$/, '')} · Entrega {formatearFecha(entrega)}
        </p>
      </div>

      {previsualizacion.length === 0
        ? (
          <p className="text-texto-sutil text-sm">
            La plantilla no tiene ítems: se crea el {GLOSARIO.espacio.singular.toLowerCase()} vacío.
          </p>
          )
        : (
          <ol className="divide-linea-suave divide-y">
            {previsualizacion.map((fila) => (
              <li
                key={fila.indice}
                className={cn('flex items-baseline justify-between gap-3 py-1.5', fila.esHija && 'pl-5')}
              >
                <span className="text-texto min-w-0 truncate text-sm" title={fila.nombre}>
                  {fila.nombre === '' ? 'Sin nombre' : fila.nombre}
                  <span className="text-texto-sutil ml-2 text-xs">
                    {fila.tipo === 'milestone' ? GLOSARIO.hito.singular : GLOSARIO.proceso.singular}
                  </span>
                </span>
                <span className="text-texto-tenue shrink-0 text-xs tabular-nums">
                  {formatearFecha(fila.inicio)} → {formatearFecha(fila.vence)}
                </span>
              </li>
            ))}
          </ol>
          )}
    </section>
  )
}
