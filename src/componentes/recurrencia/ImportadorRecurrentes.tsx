'use client'

import { CircleAlert, CircleCheck, Download, FileUp, TriangleAlert } from 'lucide-react'
import { useId, useMemo, useState, type ChangeEvent, type ReactElement } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import type { Referencia } from '@/datos/recursos'
import { descargar } from '@/dominio/exportar-acta'
import {
  leerPlanilla, mensajesDeFila, plantillaCsv, resolverNombres, type FilaPlanilla, type FilaValidada,
  type ParteDeValidacion
} from '@/dominio/recurrencia'
import { formatearFecha } from '@/lib/fechas'
import { cn } from '@/lib/clases'
import './recurrencia.css'

/** Lo que se aceptan como archivo: el CSV de la plantilla o un texto con tabuladores. */
const TIPOS_DE_ARCHIVO = '.csv,.tsv,.txt,text/csv,text/plain'

/** Tope de filas por importacion, el mismo que la API (`ImportarRecurrentes::MAXIMO_FILAS`). */
const MAXIMO_FILAS = 200

/**
 * El importador de la planilla Tarea | Frecuencia | Responsable | Proyecto.
 *
 * Tres pasos, siempre en este orden: pegar o subir, **revisar** (la API valida fila por fila sin
 * crear nada) y confirmar (la API crea todo en una transaccion). El boton de crear solo se enciende
 * cuando la ultima revision salio limpia y el texto no cambio despues de ella: crear lo que no se
 * reviso es justo el error que este paso existe para evitar.
 *
 * Nada de la regla se decide aca. La frecuencia la interpreta la API, que es la que despues copia
 * las tareas; este componente solo parte la planilla en celdas y traduce los nombres escritos a mano
 * a los ids que ya conoce la pantalla (`resolverNombres`).
 *
 * @param proyectos Proyectos visibles, para leer nombres y mostrar la previsualizacion
 * @param personas personas asignables, idem
 * @param onTerminar se llama al cerrar, con cuantas tareas se crearon (0 si se cancelo)
 */
export function ImportadorRecurrentes ({ proyectos, personas, onTerminar }: {
  proyectos: Referencia[]
  personas: Referencia[]
  onTerminar: (creadas: number) => void
}): ReactElement {
  const idTexto = useId()
  const [texto, setTexto] = useState('')
  const [parte, setParte] = useState<{ texto: string, datos: ParteDeValidacion } | null>(null)
  const [revisando, setRevisando] = useState(false)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creadas, setCreadas] = useState<number | null>(null)

  const filas = useMemo(() => leerPlanilla(texto), [texto])
  const vigente = parte !== null && parte.texto === texto ? parte.datos : null
  const listaParaCrear = vigente !== null && vigente.invalidas === 0 && vigente.validas > 0

  /** El cuerpo que se manda: las filas con los nombres ya traducidos a id. */
  function cuerpo (modo: 'validar' | 'aplicar'): { modo: string, filas: FilaPlanilla[] } {
    return { modo, filas: filas.map((fila) => resolverNombres(fila, proyectos, personas)) }
  }

  /** Paso 2: la API revisa cada fila y contesta el parte, sin crear nada. */
  async function revisar (): Promise<void> {
    setError(null)
    if (filas.length === 0) {
      setError('Pega al menos una fila de tu planilla.')
      return
    }
    if (filas.length > MAXIMO_FILAS) {
      setError(`Se pueden importar hasta ${MAXIMO_FILAS} filas por vez. Parte la planilla en dos.`)
      return
    }

    setRevisando(true)
    const revisado = texto
    const resultado = await escribirEnBff<ParteDeValidacion>('tasks/recurrentes/importar', 'POST', cuerpo('validar'))
    setRevisando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }
    setParte({ texto: revisado, datos: resultado.datos })
  }

  /** Paso 3: crea todas las reglas de una vez. */
  async function crear (): Promise<void> {
    setError(null)
    setCreando(true)
    const resultado = await escribirEnBff<{ creadas: Array<{ indice: number, task_id: number }> }>(
      'tasks/recurrentes/importar', 'POST', cuerpo('aplicar')
    )
    setCreando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }
    setCreadas(resultado.datos.creadas.length)
  }

  /** Quita del texto las filas que la ultima revision rechazo, para poder crear el resto. */
  function quitarConErrores (): void {
    if (vigente === null) return
    const malas = new Set(vigente.filas.filter((fila) => !fila.valida).map((fila) => fila.indice))
    const lineas = texto.split(/\r?\n/).filter((linea) => linea.trim() !== '')
    const conEncabezado = lineas.length > filas.length
    const cabeza = conEncabezado ? [lineas[0]] : []
    const cuerpoDeLineas = conEncabezado ? lineas.slice(1) : lineas

    setTexto([...cabeza, ...cuerpoDeLineas.filter((_, indice) => !malas.has(indice))].join('\n'))
  }

  /** Lee el archivo elegido y lo pone en el cuadro de texto, como si se hubiera pegado. */
  async function subir (evento: ChangeEvent<HTMLInputElement>): Promise<void> {
    const archivo = evento.target.files?.[0]
    evento.target.value = ''
    if (archivo === undefined) return

    try {
      setTexto(await archivo.text())
      setError(null)
    } catch {
      setError('No se pudo leer el archivo. Prueba abriéndolo y pegando las celdas.')
    }
  }

  if (creadas !== null) {
    return (
      <div role="status" className="border-linea bg-superficie rounded-tarjeta animate-entrar-escala flex flex-col items-center gap-3 border px-6 py-10 text-center">
        <CircleCheck size={36} aria-hidden="true" className="text-texto-exito" />
        <p className="font-titular text-lg font-extrabold">
          {creadas === 1 ? 'Se creó 1 tarea recurrente' : `Se crearon ${creadas} tareas recurrentes`}
        </p>
        <p className="text-texto-tenue max-w-prose text-sm">Ops genera cada copia sola en su fecha, a las 9:00.</p>
        <Boton variante="primario" onClick={() => { onTerminar(creadas) }}>Ver las reglas</Boton>
      </div>
    )
  }

  return (
    <section aria-labelledby={`${idTexto}-titulo`} className="border-linea bg-superficie rounded-tarjeta flex flex-col gap-4 border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-prose flex-col gap-1">
          <h2 id={`${idTexto}-titulo`} className="font-titular text-lg font-extrabold">Importar desde una planilla</h2>
          <p className="text-texto-tenue text-sm">
            Copia las celdas de tu planilla y pégalas, o sube un CSV. Columnas: Tarea, Frecuencia,
            Responsable (correo), Proyecto (nombre exacto o número) y, si quieres, Inicio, Plazo días y Fin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Boton variante="sutil" tamano="chico" onClick={() => { descargar(new Blob(['\uFEFF', plantillaCsv()], { type: 'text/csv;charset=utf-8' }), 'plantilla-tareas-recurrentes.csv') }}>
            <Download size={14} aria-hidden="true" /> Plantilla CSV
          </Boton>
          <label className="bg-control text-texto border-control-borde hover:bg-hover rounded-control inline-flex h-8 cursor-pointer items-center gap-2 border px-3 text-xs font-semibold transition-colors duration-150 has-[:focus-visible]:outline-2">
            <FileUp size={14} aria-hidden="true" /> Subir CSV
            <input type="file" accept={TIPOS_DE_ARCHIVO} className="sr-only" onChange={(evento) => { void subir(evento) }} />
          </label>
        </div>
      </div>

      <label htmlFor={idTexto} className="sr-only">Filas de la planilla</label>
      <AreaTexto
        id={idTexto}
        rows={6}
        value={texto}
        onChange={(evento) => { setTexto(evento.target.value) }}
        placeholder={'Tarea\tFrecuencia\tResponsable\tProyecto\nInforme de pauta\tMensual\tnombre@wiwo.me\tSAC Contact Center'}
        className="font-mono text-xs"
        spellCheck={false}
      />

      {filas.length > 0 && (
        <TablaDePrevia
          filas={filas}
          parte={vigente}
          proyectos={proyectos}
          personas={personas}
        />
      )}

      {error !== null && <p role="alert" className="text-texto-peligro animate-entrar-abajo text-sm">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Resumen filas={filas.length} parte={vigente} desactualizado={parte !== null && vigente === null} />
        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" onClick={() => { onTerminar(0) }} disabled={creando}>Cancelar</Boton>
          {vigente !== null && vigente.invalidas > 0 && vigente.validas > 0 && (
            <Boton variante="secundario" onClick={quitarConErrores}>Quitar filas con errores</Boton>
          )}
          <Boton variante={listaParaCrear ? 'secundario' : 'primario'} cargando={revisando} disabled={creando || filas.length === 0} onClick={() => { void revisar() }}>
            Revisar
          </Boton>
          <Boton variante="primario" cargando={creando} disabled={!listaParaCrear || revisando} onClick={() => { void crear() }}>
            {vigente === null || vigente.validas === 0 ? 'Crear tareas' : `Crear ${vigente.validas} ${vigente.validas === 1 ? 'tarea' : 'tareas'}`}
          </Boton>
        </div>
      </div>
    </section>
  )
}

/** Cuantas filas hay y como salio la ultima revision, en una linea que se anuncia al cambiar. */
function Resumen ({ filas, parte, desactualizado }: { filas: number, parte: ParteDeValidacion | null, desactualizado: boolean }): ReactElement {
  let mensaje = filas === 0 ? 'Sin filas todavía.' : `${filas} ${filas === 1 ? 'fila leída' : 'filas leídas'}. Revísalas antes de crear.`
  if (desactualizado) mensaje = 'Cambiaste el texto: vuelve a revisar.'
  if (parte !== null) {
    mensaje = parte.invalidas === 0
      ? `Todo en orden: ${parte.validas} ${parte.validas === 1 ? 'fila lista' : 'filas listas'}.`
      : `${parte.validas} ${parte.validas === 1 ? 'lista' : 'listas'} y ${parte.invalidas} con errores.`
  }

  return <p aria-live="polite" className="text-texto-tenue text-sm">{mensaje}</p>
}

/**
 * La previsualizacion: una fila por linea de la planilla, con su resultado cuando ya se reviso.
 *
 * Antes de revisar muestra lo leido tal cual —asi se nota enseguida si las columnas cayeron donde
 * no eran—. Despues de revisar, cada fila buena se asienta con su marca y cada mala tiembla una vez
 * y muestra el motivo debajo, en la columna que hay que corregir.
 */
function TablaDePrevia ({ filas, parte, proyectos, personas }: {
  filas: FilaPlanilla[]
  parte: ParteDeValidacion | null
  proyectos: Referencia[]
  personas: Referencia[]
}): ReactElement {
  const nombreDe = (lista: Referencia[], id: number | undefined, crudo: string): string =>
    lista.find((elemento) => elemento.id === id)?.name ?? crudo

  return (
    <div className="border-linea rounded-tarjeta overflow-x-auto border" data-lenis-prevent>
      <table className="w-full min-w-[44rem] text-left text-sm">
        <caption className="sr-only">Previsualización de la importación</caption>
        <thead className="bg-superficie-hundida text-texto-tenue text-xs">
          <tr>
            <th scope="col" className="w-10 px-3 py-2 font-medium">#</th>
            <th scope="col" className="px-3 py-2 font-medium">Tarea</th>
            <th scope="col" className="px-3 py-2 font-medium">Frecuencia</th>
            <th scope="col" className="px-3 py-2 font-medium">Responsable</th>
            <th scope="col" className="px-3 py-2 font-medium">Proyecto</th>
            <th scope="col" className="px-3 py-2 font-medium">Inicio</th>
            <th scope="col" className="px-3 py-2 font-medium">Fin</th>
            <th scope="col" className="w-10 px-3 py-2 font-medium"><span className="sr-only">Resultado</span></th>
          </tr>
        </thead>
        {filas.map((fila, indice) => {
          const resultado: FilaValidada | undefined = parte?.filas.find((f) => f.indice === indice)
          const errores = resultado?.errores ?? {}
          const vista = resultado?.vista ?? null
          const celda = (columna: string): string => cn('px-3 py-2 align-top', errores[columna] !== undefined && 'text-texto-peligro font-medium')
          const mensajes = [...mensajesDeFila(resultado?.errores ?? null), ...mensajesDeFila(resultado?.avisos ?? null)]
          const animacion = resultado === undefined ? '' : resultado.valida ? 'rec-fila-ok' : 'rec-fila-error'

          return (
            // Un `tbody` por fila: agrupa la fila con su linea de mensajes, y la animacion de la fila
            // mueve a las dos juntas. La `key` lleva el resultado para que revisar de nuevo la repita.
            <tbody
              key={`${indice}-${resultado === undefined ? 'sin' : resultado.valida ? 'ok' : 'mal'}`}
              style={{ '--i': indice } as React.CSSProperties}
              className={cn('border-linea border-t', animacion, resultado !== undefined && !resultado.valida && 'bg-superficie-peligro')}
            >
              <tr>
                <td className="text-texto-sutil px-3 py-2 align-top tabular-nums">{indice + 1}</td>
                <td className={celda('tarea')}>{fila.tarea === '' ? <Falta /> : fila.tarea}</td>
                <td className={celda('frecuencia')}>{vista?.frecuencia ?? (fila.frecuencia === '' ? <Falta /> : fila.frecuencia)}</td>
                <td className={celda('responsable')}>{vista === null ? (fila.responsable === '' ? <Falta /> : fila.responsable) : nombreDe(personas, vista.responsable_id, fila.responsable)}</td>
                <td className={celda('proyecto_id')}>{vista === null ? (fila.proyecto_id === '' ? <Falta /> : fila.proyecto_id) : nombreDe(proyectos, vista.proyecto_id, fila.proyecto_id)}</td>
                <td className={celda('fecha_inicio')}>{vista === null ? (fila.fecha_inicio === '' ? 'Hoy' : fila.fecha_inicio) : formatearFecha(vista.fecha_inicio)}</td>
                <td className={celda('fin')}>{vista === null ? (fila.fin === '' ? 'Nunca' : fila.fin) : textoDeFinDeFila(vista)}</td>
                <td className="px-3 py-2 align-top">
                  {resultado !== undefined && (
                    <span className="rec-marca inline-flex" style={{ '--i': indice } as React.CSSProperties}>
                      {resultado.valida
                        ? resultado.avisos === null
                          ? <CircleCheck size={18} aria-label="Lista" className="text-texto-exito" />
                          : <TriangleAlert size={18} aria-label="Lista, con un aviso" className="text-texto-aviso" />
                        : <CircleAlert size={18} aria-label="Con errores" className="text-texto-peligro" />}
                    </span>
                  )}
                </td>
              </tr>
              {mensajes.length > 0 && (
                <tr>
                  <td />
                  <td colSpan={7} className="px-3 pb-2">
                    <ul className="flex flex-col gap-0.5 text-xs">
                      {mensajes.map((mensaje) => (
                        <li key={`${mensaje.columna}-${mensaje.mensaje}`} className={resultado?.valida === true ? 'text-texto-aviso' : 'text-texto-peligro'}>
                          {mensaje.mensaje}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}

/** Celda obligatoria vacia: se nota antes de revisar. */
function Falta (): ReactElement {
  return <span className="text-texto-sutil italic">falta</span>
}

/** Como termina una fila ya revisada, con el mismo vocabulario que la lista de reglas. */
function textoDeFinDeFila (vista: NonNullable<FilaValidada['vista']>): string {
  if (vista.hasta !== null) return `El ${formatearFecha(vista.hasta)}`
  if (vista.ciclos > 0) return `Tras ${vista.ciclos} ${vista.ciclos === 1 ? 'vez' : 'veces'}`

  return 'Nunca'
}
