'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, CLASES_CASILLA, Entrada } from '@/componentes/formularios/Entrada'
import {
  ChevronSelector,
  CLASES_DISPARADOR,
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenuMarcable,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { leerError } from '@/datos/errores'
import type { PlantillaEspacio, PlantillaEspacioDetallada } from '@/datos/recursos'
import type { OpcionFiltro } from '@/definiciones/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import {
  erroresDeItems,
  filasDeItems,
  itemsParaGuardar,
  padresPosibles,
  textoDeMotivo,
  type FilaEditor
} from '@/lib/plantillas'
import { cn } from '@/lib/clases'
import { useRecurso } from './carga'

/**
 * Armado y edicion de una plantilla de Espacio.
 *
 * Una plantilla es una lista ordenada de hitos con sus {procesos} colgando, y lo unico que guarda de
 * cada uno es **donde cae respecto del inicio**, no una fecha. Por eso el editor no muestra ningun
 * calendario: muestra "empieza a los N dias" y "dura N dias", que es lo que la plantilla sabe.
 *
 * La jerarquia viaja por posicion (`parent_index`), no por id: la escritura manda la lista entera de
 * una vez y los ids nuevos todavia no existen. Mientras se edita, cada fila apunta a la **clave
 * local** de su hito y la posicion se calcula recien al guardar — asi mover una fila no rompe nada.
 *
 * La logica pura vive en `lib/plantillas.ts`; aca solo esta la pantalla.
 */

/** Radix Select no acepta un item con valor vacio, y "sin hito" tiene que ser elegible. */
const SIN_PADRE = '__sin_hito__'

/** Lo mismo para el tipo de {proceso}, que es opcional. */
const SIN_TIPO = '__sin_tipo__'

interface PropsEditor {
  /** `null` cierra el dialogo. `'nueva'` abre el alta; una plantilla abre su edicion. */
  destino: PlantillaEspacio | 'nueva' | null
  /** Tipos de {proceso} ya deduplicados por nombre. */
  tiposDeProceso: OpcionFiltro[]
  /** Personas del equipo, para elegir responsables. */
  equipo: OpcionFiltro[]
  onCerrar: () => void
  onGuardado: () => void
}

export function EditorPlantilla ({ destino, tiposDeProceso, equipo, onCerrar, onGuardado }: PropsEditor) {
  if (destino === null) return null

  const esAlta = destino === 'nueva'

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo
        titulo={esAlta ? 'Nueva plantilla' : 'Editar plantilla'}
        descripcion={esAlta ? undefined : destino.name}
        ancho="grande"
      >
        {esAlta
          ? (
            <Formulario
              plantilla={null}
              tiposDeProceso={tiposDeProceso}
              equipo={equipo}
              onGuardado={onGuardado}
            />
            )
          : (
            <CargaDeItems
              // `key` remonta al cambiar de plantilla: sin esto, editar una despues de otra arranca
              // con los items de la anterior a la vista.
              key={destino.id}
              id={destino.id}
              tiposDeProceso={tiposDeProceso}
              equipo={equipo}
              onGuardado={onGuardado}
            />
            )}
      </ContenidoDialogo>
    </Dialogo>
  )
}

interface PropsCarga {
  id: number
  tiposDeProceso: OpcionFiltro[]
  equipo: OpcionFiltro[]
  onGuardado: () => void
}

/**
 * Trae la plantilla completa antes de dibujar el formulario.
 *
 * El listado no incluye `items` —alimenta un selector, no un editor—, asi que editar exige el
 * detalle. Se pide al abrir y no al montar la pantalla: la mayoria de las visitas no edita nada.
 */
function CargaDeItems ({ id, tiposDeProceso, equipo, onGuardado }: PropsCarga) {
  const { estado, recargar } = useRecurso<PlantillaEspacioDetallada>(
    `project-templates/${id}`,
    'No se pudo cargar la plantilla.'
  )

  if (estado.fase === 'cargando') return <Cargando alto="min-h-40" mensaje="Cargando la plantilla…" />
  if (estado.fase === 'error') return <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />

  return (
    <Formulario
      plantilla={estado.datos}
      tiposDeProceso={tiposDeProceso}
      equipo={equipo}
      onGuardado={onGuardado}
    />
  )
}

interface PropsFormulario {
  /** Plantilla a editar con sus items, o `null` para un alta. */
  plantilla: PlantillaEspacioDetallada | null
  tiposDeProceso: OpcionFiltro[]
  equipo: OpcionFiltro[]
  onGuardado: () => void
}

/** Contador de claves locales. No viaja a la API: solo distingue filas nuevas entre si. */
let proximaClave = 0

/** Fila vacia del tipo pedido, con una clave local que no se repite. */
function filaNueva (tipo: FilaEditor['type']): FilaEditor {
  proximaClave += 1

  return {
    clave: `nueva-${proximaClave}`,
    type: tipo,
    name: '',
    padre: null,
    offset_days: '0',
    duration_days: '0',
    task_type_id: '',
    assignees: []
  }
}

function Formulario ({ plantilla, tiposDeProceso, equipo, onGuardado }: PropsFormulario) {
  const [nombre, setNombre] = useState(plantilla?.name ?? '')
  const [descripcion, setDescripcion] = useState(plantilla?.description ?? '')
  const [duracion, setDuracion] = useState(
    plantilla?.duration_days === null || plantilla?.duration_days === undefined ? '' : String(plantilla.duration_days)
  )
  const [publica, setPublica] = useState(plantilla?.is_public ?? false)
  const [filas, setFilas] = useState<FilaEditor[]>(() => filasDeItems(plantilla?.items ?? []))
  const [erroresPorFila, setErroresPorFila] = useState<Record<number, Record<string, string>>>({})
  const [errorNombre, setErrorNombre] = useState<string | undefined>(undefined)
  const [fallo, setFallo] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  /** Aplica un cambio a una fila sin tocar las demas. */
  function cambiarFila (indice: number, parcial: Partial<FilaEditor>) {
    setFilas((previas) => previas.map((fila, i) => (i === indice ? { ...fila, ...parcial } : fila)))
  }

  /** Mueve una fila un lugar arriba o abajo. Los vinculos se resuelven al guardar, no aca. */
  function mover (indice: number, salto: -1 | 1) {
    const destino = indice + salto

    setFilas((previas) => {
      if (destino < 0 || destino >= previas.length) return previas

      const siguientes = [...previas]
      const [movida] = siguientes.splice(indice, 1)

      if (movida === undefined) return previas

      siguientes.splice(destino, 0, movida)

      return siguientes
    })
  }

  /**
   * Guarda la plantilla entera.
   *
   * `items` viaja siempre, tambien vacio: el contrato dice que la clave presente reemplaza la lista
   * completa y la clave ausente la deja intacta, asi que omitirla haria imposible borrar el ultimo
   * item de una plantilla.
   */
  async function guardar (evento: React.FormEvent) {
    evento.preventDefault()

    if (nombre.trim() === '') {
      setErrorNombre('Este campo es obligatorio.')
      return
    }

    setErrorNombre(undefined)
    setGuardando(true)
    setFallo(null)
    setErroresPorFila({})

    const cuerpo = {
      name: nombre.trim(),
      description: descripcion.trim() === '' ? null : descripcion.trim(),
      duration_days: duracion.trim() === '' ? null : Number(duracion),
      is_public: publica,
      items: itemsParaGuardar(filas)
    }

    let respuesta: Response

    try {
      respuesta = await fetch(
        plantilla === null ? '/api/bff/project-templates' : `/api/bff/project-templates/${plantilla.id}`,
        {
          method: plantilla === null ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cuerpo)
        }
      )
    } catch {
      setGuardando(false)
      setFallo('No se pudo contactar al servidor. Revisá tu conexión.')
      return
    }

    setGuardando(false)

    if (respuesta.ok) {
      onGuardado()
      return
    }

    const error = await leerError(respuesta)
    const porFila = erroresDeItems(error.details)

    setErroresPorFila(porFila)
    // Con errores por item, el parrafo al pie repetiria cuarenta veces lo que ya esta marcado en la
    // fila. Se dice donde mirar y el detalle queda al lado del campo que falla.
    setFallo(Object.keys(porFila).length > 0 ? 'Revisá los ítems marcados abajo.' : error.message)
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(evento) => { void guardar(evento) }}>
      <Campo etiqueta="Nombre" requerido {...(errorNombre === undefined ? {} : { error: errorNombre })}>
        {(props) => <Entrada {...props} value={nombre} onChange={(e) => { setNombre(e.target.value) }} />}
      </Campo>

      <Campo etiqueta="Descripción">
        {(props) => (
          <AreaTexto {...props} rows={2} value={descripcion} onChange={(e) => { setDescripcion(e.target.value) }} />
        )}
      </Campo>

      <div className="flex flex-wrap items-end gap-4">
        <Campo
          etiqueta="Duración esperada (días)"
          ayuda="Es contra esta duración que se escalan las fechas. Vacía deja todo tal cual."
          className="w-56"
        >
          {(props) => (
            <Entrada
              {...props}
              type="number"
              min={0}
              value={duracion}
              onChange={(e) => { setDuracion(e.target.value) }}
            />
          )}
        </Campo>

        <label className="text-texto flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={publica}
            onChange={(e) => { setPublica(e.target.checked) }}
            className={CLASES_CASILLA}
          />
          Compartida con el equipo
        </label>
      </div>

      <ListaDeItems
        filas={filas}
        tiposDeProceso={tiposDeProceso}
        equipo={equipo}
        errores={erroresPorFila}
        onCambiar={cambiarFila}
        onMover={mover}
        onQuitar={(indice) => { setFilas((previas) => previas.filter((_, i) => i !== indice)) }}
        onAgregar={(tipo) => { setFilas((previas) => [...previas, filaNueva(tipo)]) }}
      />

      {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}

      <div className="flex justify-end gap-2">
        <CerrarDialogo asChild>
          <Boton variante="sutil">Cancelar</Boton>
        </CerrarDialogo>
        <Boton type="submit" variante="primario" cargando={guardando}>
          {plantilla === null ? 'Crear plantilla' : 'Guardar'}
        </Boton>
      </div>
    </form>
  )
}

interface PropsLista {
  filas: FilaEditor[]
  tiposDeProceso: OpcionFiltro[]
  equipo: OpcionFiltro[]
  errores: Record<number, Record<string, string>>
  onCambiar: (indice: number, parcial: Partial<FilaEditor>) => void
  onMover: (indice: number, salto: -1 | 1) => void
  onQuitar: (indice: number) => void
  onAgregar: (tipo: FilaEditor['type']) => void
}

/** La lista ordenada: hitos, y {procesos} colgando del hito que tienen arriba. */
function ListaDeItems ({
  filas,
  tiposDeProceso,
  equipo,
  errores,
  onCambiar,
  onMover,
  onQuitar,
  onAgregar
}: PropsLista) {
  return (
    <section className="flex flex-col gap-2">
      <div className="border-linea-suave flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <h3 className="text-texto font-titular text-sm font-semibold">
          {GLOSARIO.hito.plural} y {GLOSARIO.proceso.plural.toLowerCase()}
          {filas.length > 0 && <span className="text-texto-sutil ml-2 font-normal">{filas.length}</span>}
        </h3>
        <div className="flex gap-2">
          <Boton tamano="chico" onClick={() => { onAgregar('milestone') }}>
            Agregar {GLOSARIO.hito.singular.toLowerCase()}
          </Boton>
          <Boton tamano="chico" onClick={() => { onAgregar('task') }}>
            Agregar {GLOSARIO.proceso.singular.toLowerCase()}
          </Boton>
        </div>
      </div>

      {filas.length === 0
        ? (
          /* Sin marco: un estado vacio enmarcado se lee como "algo fallo", y una plantilla sin items
             es valida — crea un {espacio} pelado. */
          <p className="text-texto-sutil text-sm">
            Todavía no hay nada. Una plantilla sin ítems crea un {GLOSARIO.espacio.singular.toLowerCase()} vacío.
          </p>
          )
        : (
          <ol className="divide-linea-suave border-linea rounded-tarjeta divide-y border">
            {filas.map((fila, indice) => (
              <FilaDeItem
                key={fila.clave}
                fila={fila}
                indice={indice}
                padres={padresPosibles(filas, indice)}
                tiposDeProceso={tiposDeProceso}
                equipo={equipo}
                errores={errores[indice] ?? {}}
                ultima={indice === filas.length - 1}
                onCambiar={onCambiar}
                onMover={onMover}
                onQuitar={onQuitar}
              />
            ))}
          </ol>
          )}
    </section>
  )
}

interface PropsFila {
  fila: FilaEditor
  indice: number
  padres: OpcionFiltro[]
  tiposDeProceso: OpcionFiltro[]
  equipo: OpcionFiltro[]
  errores: Record<string, string>
  ultima: boolean
  onCambiar: (indice: number, parcial: Partial<FilaEditor>) => void
  onMover: (indice: number, salto: -1 | 1) => void
  onQuitar: (indice: number) => void
}

/** Una fila del editor: que es, como se llama, donde cae y quien la hace. */
function FilaDeItem ({
  fila,
  indice,
  padres,
  tiposDeProceso,
  equipo,
  errores,
  ultima,
  onCambiar,
  onMover,
  onQuitar
}: PropsFila) {
  const esTarea = fila.type === 'task'
  const elegidos = equipo.filter((persona) => fila.assignees.includes(persona.valor))

  return (
    <li className={cn('flex flex-col gap-2 p-3', esTarea && 'pl-8')}>
      <div className="flex flex-wrap items-center gap-2">
        <Selector
          value={fila.type}
          onValueChange={(valor) => {
            // Al pasar a hito se sueltan los datos que solo tiene una tarea: el contrato los rechaza
            // en un `milestone`, y dejarlos escondidos haria fallar el guardado sin nada a la vista.
            onCambiar(indice, valor === 'milestone'
              ? { type: 'milestone', padre: null, task_type_id: '', assignees: [] }
              : { type: 'task' })
          }}
        >
          <DisparadorSelector aria-label="Tipo de ítem" className="w-32 shrink-0" />
          <ContenidoSelector>
            <Opcion value="milestone">{GLOSARIO.hito.singular}</Opcion>
            <Opcion value="task">{GLOSARIO.proceso.singular}</Opcion>
          </ContenidoSelector>
        </Selector>

        <Entrada
          aria-label="Nombre del ítem"
          placeholder="Nombre"
          value={fila.name}
          onChange={(e) => { onCambiar(indice, { name: e.target.value }) }}
          className="min-w-40 flex-1"
          {...(errores.name === undefined ? {} : { 'aria-invalid': true })}
        />

        <div className="flex shrink-0 items-center gap-1">
          <Boton
            variante="sutil"
            tamano="chico"
            soloIcono
            aria-label="Subir"
            disabled={indice === 0}
            onClick={() => { onMover(indice, -1) }}
          >
            <ArrowUp size={14} aria-hidden />
          </Boton>
          <Boton
            variante="sutil"
            tamano="chico"
            soloIcono
            aria-label="Bajar"
            disabled={ultima}
            onClick={() => { onMover(indice, 1) }}
          >
            <ArrowDown size={14} aria-hidden />
          </Boton>
          <Boton
            variante="sutil"
            tamano="chico"
            soloIcono
            aria-label="Quitar ítem"
            onClick={() => { onQuitar(indice) }}
          >
            <Trash2 size={14} aria-hidden />
          </Boton>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {esTarea && padres.length > 0 && (
          <Campo etiqueta={`${GLOSARIO.hito.singular} del que cuelga`} className="w-52">
            {(props) => (
              <Selector
                value={fila.padre ?? SIN_PADRE}
                onValueChange={(valor) => { onCambiar(indice, { padre: valor === SIN_PADRE ? null : valor }) }}
              >
                <DisparadorSelector id={props.id} />
                <ContenidoSelector>
                  <Opcion value={SIN_PADRE}>Sin {GLOSARIO.hito.singular.toLowerCase()}</Opcion>
                  {padres.map((opcion) => (
                    <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>
        )}

        <Campo etiqueta="Empieza a los (días)" className="w-36">
          {(props) => (
            <Entrada
              {...props}
              type="number"
              min={0}
              value={fila.offset_days}
              onChange={(e) => { onCambiar(indice, { offset_days: e.target.value }) }}
            />
          )}
        </Campo>

        <Campo etiqueta="Dura (días)" className="w-28">
          {(props) => (
            <Entrada
              {...props}
              type="number"
              min={0}
              value={fila.duration_days}
              onChange={(e) => { onCambiar(indice, { duration_days: e.target.value }) }}
            />
          )}
        </Campo>

        {esTarea && tiposDeProceso.length > 0 && (
          <Campo etiqueta={`Tipo de ${GLOSARIO.proceso.singular.toLowerCase()}`} className="w-44">
            {(props) => (
              <Selector
                value={fila.task_type_id === '' ? SIN_TIPO : fila.task_type_id}
                onValueChange={(valor) => { onCambiar(indice, { task_type_id: valor === SIN_TIPO ? '' : valor }) }}
              >
                <DisparadorSelector id={props.id} />
                <ContenidoSelector>
                  <Opcion value={SIN_TIPO}>Sin tipo</Opcion>
                  {tiposDeProceso.map((opcion) => (
                    <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>
        )}

        {esTarea && equipo.length > 0 && (
          <div className="flex w-52 flex-col gap-1.5">
            <span className="text-texto text-sm font-medium">Responsables</span>
            <MenuContextual>
              <DisparadorMenu className={cn(CLASES_DISPARADOR, fila.assignees.length === 0 && 'text-texto-sutil')}>
                <span className="flex min-w-0 items-baseline gap-1">
                  <span className="truncate">{elegidos[0]?.etiqueta ?? 'Sin responsables'}</span>
                  {/* El conteo no se recorta: es lo unico que dice que hay mas de una persona. */}
                  {elegidos.length > 1 && (
                    <span className="text-texto-tenue shrink-0">+{elegidos.length - 1}</span>
                  )}
                </span>
                <ChevronSelector />
              </DisparadorMenu>
              <ContenidoMenu align="start">
                {equipo.map((persona) => (
                  <ItemMenuMarcable
                    key={persona.valor}
                    checked={fila.assignees.includes(persona.valor)}
                    onCheckedChange={() => {
                      onCambiar(indice, {
                        assignees: fila.assignees.includes(persona.valor)
                          ? fila.assignees.filter((id) => id !== persona.valor)
                          : [...fila.assignees, persona.valor]
                      })
                    }}
                  >
                    {persona.etiqueta}
                  </ItemMenuMarcable>
                ))}
              </ContenidoMenu>
            </MenuContextual>
          </div>
        )}
      </div>

      {Object.entries(errores).length > 0 && (
        <p role="alert" className="text-texto-peligro text-xs">
          {Object.entries(errores).map(([, motivo]) => textoDeMotivo(motivo)).join(' ')}
        </p>
      )}
    </li>
  )
}
