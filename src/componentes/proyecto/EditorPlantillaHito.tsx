'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoSelector, DisparadorSelector, Opcion, Selector } from '@/componentes/formularios/Selector'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { leerError } from '@/datos/errores'
import type { PlantillaHito, PlantillaHitoDetallada } from '@/datos/recursos'
import type { OpcionFiltro } from '@/definiciones/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import {
  erroresDeTareas,
  filasDeTareas,
  OFFSET_MAXIMO,
  PRIORIDAD_POR_DEFECTO,
  PRIORIDADES,
  tareasParaGuardar,
  TOPE_TAREAS,
  validarFilas,
  type FilaTarea
} from '@/lib/plantillas-hito'
import { useRecurso } from './carga'

/**
 * Armado y edicion de una plantilla de Hito.
 *
 * Una plantilla de Hito es un nombre y una lista ordenada de tareas, y lo unico que guarda de cada
 * una es **a cuantos dias del inicio del hito cae**, no una fecha. Por eso el editor no muestra
 * ningun calendario: muestra "empieza a los N días" y "vence a los N días", que es lo que la
 * plantilla sabe. Asi la misma "Hito mensual" sirve para enero y para febrero.
 *
 * Los dos campos de dias admiten quedarse vacios, y vacio **no es cero**: significa "la fecha del
 * hito" —su inicio para el arranque, su cierre para el vencimiento—. El texto de ayuda lo dice
 * porque es la unica parte del formulario que no se deduce mirandolo.
 *
 * La logica pura vive en `lib/plantillas-hito.ts`; aca solo esta la pantalla. Sigue la estructura de
 * `EditorPlantilla` (plantillas de Espacio), que resuelve el mismo problema con la misma forma.
 */

/** Radix Select no acepta un item con valor vacio, y "sin tipo" tiene que ser elegible. */
const SIN_TIPO = '__sin_tipo__'

interface PropsEditor {
  /** `null` cierra el dialogo. `'nueva'` abre el alta; una plantilla abre su edicion. */
  destino: PlantillaHito | 'nueva' | null
  /** Tipos de {proceso} ya deduplicados por nombre. */
  tiposDeProceso: OpcionFiltro[]
  onCerrar: () => void
  onGuardado: () => void
}

export function EditorPlantillaHito ({ destino, tiposDeProceso, onCerrar, onGuardado }: PropsEditor) {
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
          ? <Formulario plantilla={null} tiposDeProceso={tiposDeProceso} onGuardado={onGuardado} />
          : (
            <CargaDeTareas
              // `key` remonta al cambiar de plantilla: sin esto, editar una despues de otra arranca
              // con las tareas de la anterior a la vista.
              key={destino.id}
              id={destino.id}
              tiposDeProceso={tiposDeProceso}
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
  onGuardado: () => void
}

/**
 * Trae la plantilla completa antes de dibujar el formulario.
 *
 * El listado no incluye `tasks` —alimenta un selector, no un editor—, asi que editar exige el
 * detalle. Se pide al abrir y no al montar la pantalla: la mayoria de las visitas no edita nada.
 */
function CargaDeTareas ({ id, tiposDeProceso, onGuardado }: PropsCarga) {
  const { estado, recargar } = useRecurso<PlantillaHitoDetallada>(
    `hito-plantillas/${id}`,
    'No se pudo cargar la plantilla.'
  )

  if (estado.fase === 'cargando') return <Cargando alto="min-h-40" mensaje="Cargando la plantilla…" />
  if (estado.fase === 'error') return <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />

  return <Formulario plantilla={estado.datos} tiposDeProceso={tiposDeProceso} onGuardado={onGuardado} />
}

interface PropsFormulario {
  /** Plantilla a editar con sus tareas, o `null` para un alta. */
  plantilla: PlantillaHitoDetallada | null
  tiposDeProceso: OpcionFiltro[]
  onGuardado: () => void
}

/** Contador de claves locales. No viaja a la API: solo distingue filas nuevas entre si. */
let proximaClave = 0

/**
 * Fila vacia, con una clave local que no se repite.
 *
 * Arranca con los dos campos de dias en blanco —"la fecha del hito"— porque es lo que hace una
 * tarea que simplemente acompaña al hito, que es el caso mas comun.
 */
function filaNueva (): FilaTarea {
  proximaClave += 1

  return {
    clave: `nueva-${proximaClave}`,
    name: '',
    description: '',
    start_offset_days: '',
    due_offset_days: '',
    priority: String(PRIORIDAD_POR_DEFECTO),
    task_type_id: ''
  }
}

function Formulario ({ plantilla, tiposDeProceso, onGuardado }: PropsFormulario) {
  const [nombre, setNombre] = useState(plantilla?.name ?? '')
  const [descripcion, setDescripcion] = useState(plantilla?.description ?? '')
  const [filas, setFilas] = useState<FilaTarea[]>(
    () => (plantilla === null ? [filaNueva()] : filasDeTareas(plantilla.tasks))
  )
  const [erroresPorFila, setErroresPorFila] = useState<Record<number, Record<string, string>>>({})
  const [errorNombre, setErrorNombre] = useState<string | undefined>(undefined)
  const [fallo, setFallo] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  /** Aplica un cambio a una fila sin tocar las demas. */
  function cambiarFila (indice: number, parcial: Partial<FilaTarea>) {
    setFilas((previas) => previas.map((fila, i) => (i === indice ? { ...fila, ...parcial } : fila)))
  }

  /** Mueve una fila un lugar arriba o abajo. El orden ES el dato: se guarda como posicion. */
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
   * `tasks` viaja siempre: el contrato dice que la clave presente reemplaza la lista completa y la
   * clave ausente la deja intacta, asi que omitirla haria imposible reordenar o quitar tareas.
   *
   * La lista vacia se corta **antes** de salir: el backend la rechaza con un `422` sobre `tasks`,
   * que es un mensaje al pie y no una instruccion. Aca se dice lo que hay que hacer.
   */
  async function guardar (evento: React.FormEvent) {
    evento.preventDefault()

    if (nombre.trim() === '') {
      setErrorNombre('Este campo es obligatorio.')
      return
    }

    setErrorNombre(undefined)

    if (filas.length === 0) {
      setErroresPorFila({})
      setFallo(`Una plantilla necesita al menos una ${GLOSARIO.proceso.singular.toLowerCase()}.`)
      return
    }

    const invalidas = validarFilas(filas)

    if (Object.keys(invalidas).length > 0) {
      setErroresPorFila(invalidas)
      setFallo(`Revisa las ${GLOSARIO.proceso.plural.toLowerCase()} marcadas abajo.`)
      return
    }

    setGuardando(true)
    setFallo(null)
    setErroresPorFila({})

    const cuerpo = {
      name: nombre.trim(),
      description: descripcion.trim() === '' ? null : descripcion.trim(),
      tasks: tareasParaGuardar(filas)
    }

    let respuesta: Response

    try {
      respuesta = await fetch(
        plantilla === null ? '/api/bff/hito-plantillas' : `/api/bff/hito-plantillas/${plantilla.id}`,
        {
          method: plantilla === null ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cuerpo)
        }
      )
    } catch {
      setGuardando(false)
      setFallo('No se pudo contactar al servidor. Revisa tu conexión.')
      return
    }

    setGuardando(false)

    if (respuesta.ok) {
      onGuardado()
      return
    }

    const error = await leerError(respuesta)
    const porFila = erroresDeTareas(error.details)

    setErroresPorFila(porFila)
    // Con errores por tarea, el parrafo al pie repetiria cien veces lo que ya esta marcado en la
    // fila. Se dice donde mirar y el detalle queda al lado del campo que falla.
    setFallo(Object.keys(porFila).length > 0
      ? `Revisa las ${GLOSARIO.proceso.plural.toLowerCase()} marcadas abajo.`
      : error.message)
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(evento) => { void guardar(evento) }}>
      <Campo etiqueta="Nombre" requerido {...(errorNombre === undefined ? {} : { error: errorNombre })}>
        {(props) => (
          <Entrada
            {...props}
            value={nombre}
            placeholder={`${GLOSARIO.hito.singular} mensual`}
            onChange={(e) => { setNombre(e.target.value) }}
          />
        )}
      </Campo>

      <Campo etiqueta="Descripción">
        {(props) => (
          <AreaTexto {...props} rows={2} value={descripcion} onChange={(e) => { setDescripcion(e.target.value) }} />
        )}
      </Campo>

      <ListaDeTareas
        filas={filas}
        tiposDeProceso={tiposDeProceso}
        errores={erroresPorFila}
        onCambiar={cambiarFila}
        onMover={mover}
        onQuitar={(indice) => { setFilas((previas) => previas.filter((_, i) => i !== indice)) }}
        onAgregar={() => { setFilas((previas) => [...previas, filaNueva()]) }}
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
  filas: FilaTarea[]
  tiposDeProceso: OpcionFiltro[]
  errores: Record<number, Record<string, string>>
  onCambiar: (indice: number, parcial: Partial<FilaTarea>) => void
  onMover: (indice: number, salto: -1 | 1) => void
  onQuitar: (indice: number) => void
  onAgregar: () => void
}

/** La lista ordenada de tareas. El orden es el dato: se guarda como posicion y se aplica asi. */
function ListaDeTareas ({ filas, tiposDeProceso, errores, onCambiar, onMover, onQuitar, onAgregar }: PropsLista) {
  const lleno = filas.length >= TOPE_TAREAS

  return (
    <section className="flex flex-col gap-2">
      <div className="border-linea-suave flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <h3 className="text-texto font-titular text-sm font-semibold">
          {GLOSARIO.proceso.plural} de la plantilla
          {filas.length > 0 && <span className="text-texto-sutil ml-2 font-normal">{filas.length}</span>}
        </h3>
        <Boton tamano="chico" disabled={lleno} onClick={onAgregar}>
          Agregar {GLOSARIO.proceso.singular.toLowerCase()}
        </Boton>
      </div>

      {lleno && (
        <p className="text-texto-tenue text-xs">
          Una plantilla admite hasta {TOPE_TAREAS} {GLOSARIO.proceso.plural.toLowerCase()}.
        </p>
      )}

      {filas.length === 0
        ? (
          /* Sin marco: un estado vacio enmarcado se lee como "algo fallo", y esta lista no es un
             error sino el paso que falta. */
          <p className="text-texto-sutil text-sm">
            Una plantilla sin {GLOSARIO.proceso.plural.toLowerCase()} no se puede guardar: agrega al
            menos una.
          </p>
          )
        : (
          <ol className="divide-linea-suave border-linea rounded-tarjeta divide-y border">
            {filas.map((fila, indice) => (
              <FilaDeTarea
                key={fila.clave}
                fila={fila}
                indice={indice}
                tiposDeProceso={tiposDeProceso}
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
  fila: FilaTarea
  indice: number
  tiposDeProceso: OpcionFiltro[]
  errores: Record<string, string>
  ultima: boolean
  onCambiar: (indice: number, parcial: Partial<FilaTarea>) => void
  onMover: (indice: number, salto: -1 | 1) => void
  onQuitar: (indice: number) => void
}

/** Una fila del editor: como se llama, cuando cae respecto del hito, y con que prioridad. */
function FilaDeTarea ({ fila, indice, tiposDeProceso, errores, ultima, onCambiar, onMover, onQuitar }: PropsFila) {
  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-texto-sutil w-5 shrink-0 text-right text-xs tabular-nums">{indice + 1}</span>

        <Entrada
          aria-label={`Nombre de la ${GLOSARIO.proceso.singular.toLowerCase()}`}
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
            aria-label={`Quitar ${GLOSARIO.proceso.singular.toLowerCase()}`}
            onClick={() => { onQuitar(indice) }}
          >
            <Trash2 size={14} aria-hidden />
          </Boton>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 pl-7">
        <Campo
          etiqueta="Empieza a los (días)"
          ayuda={`Vacío = el día en que empieza el ${GLOSARIO.hito.singular.toLowerCase()}.`}
          className="w-44"
        >
          {(props) => (
            <Entrada
              {...props}
              type="number"
              min={0}
              max={OFFSET_MAXIMO}
              value={fila.start_offset_days}
              onChange={(e) => { onCambiar(indice, { start_offset_days: e.target.value }) }}
            />
          )}
        </Campo>

        <Campo
          etiqueta="Vence a los (días)"
          ayuda={`Vacío = el día en que vence el ${GLOSARIO.hito.singular.toLowerCase()}.`}
          className="w-44"
        >
          {(props) => (
            <Entrada
              {...props}
              type="number"
              min={0}
              max={OFFSET_MAXIMO}
              value={fila.due_offset_days}
              onChange={(e) => { onCambiar(indice, { due_offset_days: e.target.value }) }}
            />
          )}
        </Campo>

        <Campo etiqueta="Prioridad" className="w-36">
          {(props) => (
            <Selector
              value={fila.priority}
              onValueChange={(valor) => { onCambiar(indice, { priority: valor }) }}
            >
              <DisparadorSelector id={props.id} />
              <ContenidoSelector>
                {PRIORIDADES.map((opcion) => (
                  <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
                ))}
              </ContenidoSelector>
            </Selector>
          )}
        </Campo>

        {tiposDeProceso.length > 0 && (
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
      </div>

      <Campo etiqueta="Descripción" className="pl-7">
        {(props) => (
          <AreaTexto
            {...props}
            rows={2}
            value={fila.description}
            onChange={(e) => { onCambiar(indice, { description: e.target.value }) }}
          />
        )}
      </Campo>

      {Object.keys(errores).length > 0 && (
        <p role="alert" className="text-texto-peligro pl-7 text-xs">
          {Object.values(errores).join(' ')}
        </p>
      )}
    </li>
  )
}
