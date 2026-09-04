'use client'

import { useMemo, useState, type FormEvent, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo,
  DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { leerError } from '@/datos/errores'
import { interpretarAltaRapida } from '@/dominio/alta-rapida'
import { GLOSARIO } from '@/dominio/glosario'
import {
  fusionarInterpretacion,
  leerCamposTarea,
  type CampoDeTarea,
  type CatalogosTarea,
  type TareaFusionada
} from '@/dominio/ia-tarea'
import { formatearFecha } from '@/lib/fechas'
import { VistaPreviaAlta, type MarcaPrevia } from './VistaPreviaAlta'
import type { CamposTarea } from '@/dominio/ia'
import type { OpcionFiltro } from '@/definiciones/tipos'
import type { Referencia } from '@/datos/recursos'

/**
 * Alta de una tarea dentro de un proyecto.
 *
 * Pide lo minimo que hace falta para que la tarea exista y sea encontrable; el resto —asignados,
 * seguidores, checklist, adjuntos, recurrencia— se completa en el detalle, que es donde el panel
 * viejo tambien termina llevando a todo el mundo. Asignar a varias personas de una vez ya lo resuelve
 * la accion masiva.
 *
 * El proyecto no es un campo: viaja como `rel_type`/`rel_id` y no se elige, porque el formulario se
 * abre desde la pestaña de ese proyecto.
 *
 * Arriba de todo hay un texto libre: se escribe la tarea como se hablaria y "Completar campos" la
 * convierte en campos, que despues se corrigen a mano. **Nada se crea sin confirmacion**: el
 * `POST /tasks` sigue saliendo solo con "Crear". Convive con el alta rapida en vez de reemplazarla:
 * quien ya sabe `@ # !` tiene su atajo instantaneo y gratis, quien escribe en prosa usa esto.
 */

/** Id del `datalist` de etiquetas. Uno solo: el formulario se monta una vez por pestaña. */
const LISTA_ETIQUETAS = 'etiquetas-existentes'

/** Los campos del formulario tal como estaban antes de una interpretacion, para poder deshacerla. */
interface CamposFormulario {
  nombre: string
  prioridad: string
  inicio: string
  vencimiento: string
  etiquetas: string
  descripcion: string
}

interface PropsFormulario {
  proyectoId: number
  prioridades: OpcionFiltro[]
  /**
   * Etiquetas que ya existen. La API rechaza con `422` cualquier otra —crear catalogo desde un alta
   * es como se llena la tabla de variantes con typo—, asi que el formulario avisa antes de mandar.
   */
  etiquetasDisponibles: Referencia[]
  /**
   * Si la capa de IA esta encendida. Apagada, el campo de texto libre y su boton no se pintan: la
   * API responde 404 a `/ia/*` y ofrecer un boton que falla es peor que no ofrecerlo.
   */
  conIa: boolean
  /** Se llama con la tarea ya creada, para que la tabla vuelva a pedir los datos. */
  onCreada: () => void
}

export function FormularioTarea (
  { proyectoId, prioridades, etiquetasDisponibles, conIa, onCreada }: PropsFormulario
): ReactElement {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [prioridad, setPrioridad] = useState('2')
  const [inicio, setInicio] = useState('')
  const [vencimiento, setVencimiento] = useState('')
  const [facturable, setFacturable] = useState(true)
  const [etiquetas, setEtiquetas] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [textoLibre, setTextoLibre] = useState('')
  const [interpretando, setInterpretando] = useState(false)
  const [avisoIa, setAvisoIa] = useState<string | null>(null)
  const [fusion, setFusion] = useState<TareaFusionada | null>(null)
  const [previo, setPrevio] = useState<CamposFormulario | null>(null)

  /*
   * Personas y Espacios van vacios a proposito: aca no se eligen, el proyecto viaja fijo por
   * `rel_id`. Un `@alguien` escrito en el texto queda sin resolver y se va al titulo —que es lo
   * correcto: nada se pierde en silencio— y cualquier responsable que proponga el modelo se descarta
   * por no estar en catalogo, en vez de mandar un id que esta pantalla no sabe nombrar.
   */
  const catalogos: CatalogosTarea = useMemo(() => ({
    personas: [],
    espacios: [],
    prioridades: prioridades.map((opcion) => ({ id: Number(opcion.valor), name: opcion.etiqueta })),
    etiquetas: etiquetasDisponibles
  }), [prioridades, etiquetasDisponibles])

  /** Vacia el formulario para que la proxima alta no arranque con los datos de la anterior. */
  function limpiar (): void {
    setNombre('')
    setPrioridad('2')
    setInicio('')
    setVencimiento('')
    setFacturable(true)
    setEtiquetas('')
    setDescripcion('')
    setError(null)
    setTextoLibre('')
    setAvisoIa(null)
    setFusion(null)
    setPrevio(null)
  }

  /**
   * Vuelca en los campos lo que resolvio la fusion.
   *
   * Solo escribe lo que tiene valor: un campo que quedo en `null` no borra lo que la persona ya
   * habia escrito a mano antes de apretar el boton.
   */
  function volcar (resultado: TareaFusionada): void {
    if (resultado.name !== '') setNombre(resultado.name)
    if (resultado.priority !== null) setPrioridad(String(resultado.priority))
    if (resultado.start_date !== null) setInicio(resultado.start_date)
    if (resultado.due_date !== null) setVencimiento(resultado.due_date)
    if (resultado.tags.length > 0) setEtiquetas(resultado.tags.join(', '))
    if (resultado.description !== null) setDescripcion(resultado.description)
  }

  /**
   * Interpreta el texto libre y rellena el formulario. No crea nada.
   *
   * Las dos lecturas corren en el mismo clic: `interpretarAltaRapida()`, que es instantanea y gratis,
   * y el modelo. No hay heuristica que decida si vale la pena llamar: el parser corre igual, y una
   * astucia asi es de las que despues nadie entiende. Si el modelo no responde queda lo del parser
   * con el aviso al lado, porque dejar el formulario vacio por un 503 es peor que llenarlo a medias.
   */
  async function completar (): Promise<void> {
    const limpio = textoLibre.trim()

    if (limpio === '') {
      setAvisoIa('Escribí primero qué hay que hacer.')
      return
    }

    setInterpretando(true)
    setAvisoIa(null)

    const local = interpretarAltaRapida(limpio, catalogos)
    // `project_id` acota la interpretacion al Espacio abierto: sin el, el modelo puede vincular la
    // tarea a otro Espacio que el texto nombre de paso.
    const respuesta = await escribirEnBff<CamposTarea>(
      'ia/tareas/interpretar', 'POST', { texto: limpio, project_id: proyectoId }
    )
    const delModelo = respuesta.ok ? leerCamposTarea(respuesta.datos) : null
    const resultado = fusionarInterpretacion(local, delModelo, catalogos)

    setPrevio({ nombre, prioridad, inicio, vencimiento, etiquetas, descripcion })
    volcar(resultado)
    setFusion(resultado)
    setInterpretando(false)

    if (!respuesta.ok) setAvisoIa(`${respuesta.mensaje} Quedó sólo lo que se entendió del texto.`)
    else if (delModelo === null) setAvisoIa('El modelo respondió algo que no se entendió. Quedó sólo lo que se entendió del texto.')
  }

  /** Restaura los campos tal como estaban justo antes de la ultima interpretacion. */
  function deshacer (): void {
    if (previo === null) return

    setNombre(previo.nombre)
    setPrioridad(previo.prioridad)
    setInicio(previo.inicio)
    setVencimiento(previo.vencimiento)
    setEtiquetas(previo.etiquetas)
    setDescripcion(previo.descripcion)
    setPrevio(null)
    setFusion(null)
    setAvisoIa(null)
  }

  /** El nombre de la prioridad para la vista previa; el id pelado si el catalogo no la tiene. */
  function nombrePrioridad (id: number): string {
    return prioridades.find((opcion) => opcion.valor === String(id))?.etiqueta ?? `Prioridad #${id}`
  }

  // Cada marca declara de donde salio: lo que propuso el modelo no puede verse igual que lo que
  // escribio la persona, porque lo primero hay que revisarlo y lo segundo no.
  const marcas: MarcaPrevia[] = []

  if (fusion !== null) {
    const origen = (campo: CampoDeTarea): 'texto' | 'ia' => fusion.deIa.includes(campo) ? 'ia' : 'texto'

    if (fusion.due_date !== null) marcas.push({ texto: `Vence ${formatearFecha(fusion.due_date)}`, origen: origen('due_date') })
    if (fusion.start_date !== null) marcas.push({ texto: `Empieza ${formatearFecha(fusion.start_date)}`, origen: origen('start_date') })
    if (fusion.priority !== null) marcas.push({ texto: nombrePrioridad(fusion.priority), origen: origen('priority') })
    if (fusion.description !== null) marcas.push({ texto: 'Con descripción', origen: origen('description') })
    for (const etiqueta of fusion.tags) marcas.push({ texto: etiqueta, origen: origen('tags') })
  }

  /** Crea la tarea. El nombre es lo unico obligatorio; el resto viaja solo si se completo. */
  async function enviar (evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()

    if (nombre.trim() === '') {
      setError('La tarea necesita un nombre.')
      return
    }

    // Las etiquetas se comparan sin distinguir mayusculas porque la colacion de `tbltags` es `_ci`:
    // "urgente" y "Urgente" son la misma fila para la API, y rechazar una de las dos aca seria
    // inventar una regla que el backend no tiene.
    const pedidas = etiquetas.split(',').map((t) => t.trim()).filter((t) => t !== '')
    const conocidas = new Set(etiquetasDisponibles.map((e) => e.name.toLowerCase()))
    const desconocidas = pedidas.filter((t) => !conocidas.has(t.toLowerCase()))

    if (desconocidas.length > 0) {
      setError(
        desconocidas.length === 1
          ? `La etiqueta «${desconocidas[0]}» no existe: elegí una ya creada.`
          : `Estas etiquetas no existen: ${desconocidas.join(', ')}. Elegí etiquetas ya creadas.`
      )
      return
    }

    setEnCurso(true)
    setError(null)

    const cuerpo = {
      name: nombre.trim(),
      rel_type: 'project',
      rel_id: proyectoId,
      priority: Number(prioridad),
      billable: facturable,
      ...(inicio === '' ? {} : { start_date: inicio }),
      ...(vencimiento === '' ? {} : { due_date: vencimiento }),
      ...(descripcion.trim() === '' ? {} : { description: descripcion.trim() }),
      ...(pedidas.length === 0 ? {} : { tags: pedidas })
    }

    try {
      const respuesta = await fetch('/api/bff/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(cuerpo)
      })

      if (!respuesta.ok) {
        setError((await leerError(respuesta)).message)
        return
      }

      limpiar()
      setAbierto(false)
      onCreada()
    } catch {
      setError('No se pudo crear: revisá la conexión.')
    } finally {
      setEnCurso(false)
    }
  }

  return (
    <Dialogo open={abierto} onOpenChange={setAbierto}>
      <DisparadorDialogo asChild>
        <Boton variante="primario" tamano="chico">
          Nueva {GLOSARIO.proceso.singular.toLowerCase()}
        </Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo={`Nueva ${GLOSARIO.proceso.singular.toLowerCase()}`}
        descripcion="Sólo lo indispensable; el resto se completa en el detalle."
      >
        <form className="flex flex-col gap-4" onSubmit={(evento) => { void enviar(evento) }}>
          {conIa && (
          <div className="border-borde flex flex-col gap-2 border-b pb-4">
            <Campo
              etiqueta="Escribilo como lo dirías"
              ayuda="Se convierte en campos y los corregís antes de crear. Nada se crea solo."
            >
              {(props) => (
                <AreaTexto
                  value={textoLibre}
                  onChange={(evento) => setTextoLibre(evento.target.value)}
                  placeholder="Hay que rehacer la grilla de septiembre para el viernes, es urgente."
                  {...props}
                />
              )}
            </Campo>

            <div className="flex flex-wrap items-center gap-2">
              <Boton
                variante="secundario"
                tamano="chico"
                cargando={interpretando}
                onClick={() => { void completar() }}
              >
                Completar campos
              </Boton>

              {previo !== null && (
                <Boton variante="sutil" tamano="chico" onClick={deshacer}>Deshacer</Boton>
              )}
            </div>

            {fusion !== null && (
              <VistaPreviaAlta
                titulo={fusion.name}
                origenTitulo={fusion.deIa.includes('name') ? 'ia' : 'texto'}
                marcas={marcas}
                sinResolver={fusion.noResuelto}
              />
            )}

            {avisoIa !== null && (
              <p role="status" className="text-texto-tenue text-xs">{avisoIa}</p>
            )}
          </div>
          )}

          <Campo etiqueta="Nombre" requerido>
            {(props) => (
              <Entrada
                value={nombre}
                onChange={(evento) => setNombre(evento.target.value)}
                placeholder="Revisar el contrato"
                {...props}
              />
            )}
          </Campo>

          <Campo etiqueta="Prioridad">
            {(props) => (
              <Selector value={prioridad} onValueChange={setPrioridad}>
                <DisparadorSelector marcador="Elegí una" id={props.id} />
                <ContenidoSelector>
                  {prioridades.map((opcion) => (
                    <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Fecha de inicio">
              {(props) => (
                <Entrada
                  type="date"
                  value={inicio}
                  onChange={(evento) => setInicio(evento.target.value)}
                  {...props}
                />
              )}
            </Campo>
            <Campo etiqueta="Fecha de vencimiento">
              {(props) => (
                <Entrada
                  type="date"
                  value={vencimiento}
                  onChange={(evento) => setVencimiento(evento.target.value)}
                  {...props}
                />
              )}
            </Campo>
          </div>

          <Campo etiqueta="Etiquetas" ayuda="Separadas por coma. Sólo etiquetas que ya existen.">
            {(props) => (
              <>
                <Entrada
                  value={etiquetas}
                  onChange={(evento) => setEtiquetas(evento.target.value)}
                  placeholder="urgente, cliente-clave"
                  list={LISTA_ETIQUETAS}
                  {...props}
                />
                {/* `datalist` es la sugerencia nativa: no valida ni obliga, y con una sola etiqueta
                    escrita evita el error antes de que ocurra. */}
                <datalist id={LISTA_ETIQUETAS}>
                  {etiquetasDisponibles.map((e) => <option key={e.id} value={e.name} />)}
                </datalist>
              </>
            )}
          </Campo>

          <Campo etiqueta="Descripción">
            {(props) => (
              <AreaTexto
                value={descripcion}
                onChange={(evento) => setDescripcion(evento.target.value)}
                {...props}
              />
            )}
          </Campo>

          <label className="text-texto flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={facturable}
              onChange={(evento) => setFacturable(evento.target.checked)}
            />
            Facturable
          </label>

          {error !== null && <p role="alert" className="text-texto-peligro text-xs">{error}</p>}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil" type="button">Cancelar</Boton>
            </CerrarDialogo>
            <Boton variante="primario" type="submit" cargando={enCurso}>Crear</Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}
