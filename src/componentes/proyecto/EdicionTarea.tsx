'use client'

import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { useAccionPresencia } from '@/componentes/auditoria/accion'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { CamposPersonalizados } from '@/componentes/formularios/CamposPersonalizados'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import { SelectorPersonas } from '@/componentes/formularios/SelectorPersonas'
import {
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
import { CLASES_DISPARADOR } from '@/componentes/formularios/Selector'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { cargarAsignables } from '@/datos/asignables'
import { pedirSobre } from '@/datos/cliente'
import { listaDe } from '@/datos/catalogos'
import {
  camposOrdenados,
  cuerpoDeCamposPersonalizados,
  esquemaDeCamposPersonalizados,
  valoresIniciales,
  type ErroresDeCampos,
  type ValoresDeCampos
} from '@/dominio/campos-personalizados'
import {
  camposDeTarea,
  cuerpoDeParche,
  nombresDeEtiquetas,
  personasElegibles,
  type CamposEdicion
} from '@/dominio/edicion-tarea'
import { GLOSARIO } from '@/dominio/glosario'
import { errorDeHorasEstimadas } from '@/dominio/tiempo-estimado'
import { cn } from '@/lib/clases'
import type { StaffReferencia } from '@/datos/tipos'
import type {
  DefinicionCampoPersonalizado,
  Hito,
  Lookups,
  Proceso,
  ValorCampoPersonalizado
} from '@/datos/recursos'

/** Lista vacia unica: un `[]` nuevo por render volveria a disparar el efecto de las definiciones. */
const SIN_CAMPOS: ValorCampoPersonalizado[] = []

interface PropsEdicionTarea {
  tarea: Proceso
  lookups: Lookups
  /** La descripcion ya en texto plano: la API la guarda como HTML y el detalle la muestra plana. */
  descripcion: string
  /** Cierra el dialogo. El detalle lo desmonta, y con eso se descartan los cambios sin guardar. */
  onCerrar: () => void
  /** Se llama con la tarea ya guardada, para que el detalle vuelva a pedirla. */
  onGuardada: () => void
}

/**
 * Edicion de una Tarea ya creada.
 *
 * El alta pide lo indispensable a proposito, asi que **esta es la unica pantalla donde se completa el
 * resto**: asignados, seguidores, etiquetas, hito, fechas, prioridad y descripcion. Sin ella, una
 * tarea creada con lo minimo se queda asi para siempre.
 *
 * Manda un `PATCH /tasks/{id}` con **solo lo que cambio** (`cuerpoDeParche`). Reenviar el formulario
 * entero no es equivalente: `assignees` reemplaza la lista y cierra los cronometros de quien sale, y
 * `milestone` se valida contra el Espacio, asi que un guardado que solo toca el nombre se llevaria un
 * `422` por un hito que nadie miro.
 *
 * **Se monta solo mientras esta abierto**, y de ahi sale gratis lo que si no habria que programar:
 * el formulario arranca en los valores de la Tarea recien traida, cerrar descarta lo no guardado, y
 * los dos catalogos que dependen de la Tarea —los miembros del Espacio y sus hitos— se piden al
 * abrir y no al montar el detalle, que es una peticion que no le sirve a quien solo vino a mirar.
 *
 * Los campos personalizados van en su propia escritura (`PATCH /custom-fields/values`): `PATCH
 * /tasks/{id}` rechaza con `422` cualquier clave fuera de su lista blanca. Los valores no se piden
 * aparte: llegan en la Tarea, que el detalle trae con `include=custom_fields`. Lo unico que falta
 * son las definiciones, que dicen que campos existen y de que tipo es cada uno.
 *
 * **Las personas salen de `GET /staff/asignables`, la unica fuente del panel.** No de `GET /staff`,
 * que exige el permiso `staff.view` —19 de 184 personas lo tienen— ni de los miembros del Espacio,
 * que dejaban fuera del buscador a quien todavia no era miembro. Se puede elegir a cualquiera: el
 * backend lo agrega al Espacio al guardar.
 */
export function EdicionTarea (
  { tarea, lookups, descripcion, onCerrar, onGuardada }: PropsEdicionTarea
): ReactElement {
  useAccionPresencia('editando_tarea')

  const inicial = camposDeTarea(tarea, descripcion)
  const [campos, setCampos] = useState<CamposEdicion>(inicial)
  const [asignables, setAsignables] = useState<StaffReferencia[]>([])
  const [hitos, setHitos] = useState<Hito[]>([])
  const [avisoCatalogo, setAvisoCatalogo] = useState<string | null>(null)
  /** Lo que se esta escribiendo en el campo de etiqueta nueva, antes de sumarlo a la lista. */
  const [etiquetaNueva, setEtiquetaNueva] = useState('')
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [definiciones, setDefiniciones] = useState<DefinicionCampoPersonalizado[]>([])
  /** Los valores tal como se abrio el formulario, para poder mandar solo lo que cambio. */
  const [personalizadosIniciales, setPersonalizadosIniciales] = useState<ValoresDeCampos>({})
  const [personalizados, setPersonalizados] = useState<ValoresDeCampos>({})
  const [erroresCampos, setErroresCampos] = useState<ErroresDeCampos>({})

  const espacioId = tarea.rel_type === 'project' ? tarea.rel_id : null
  /** Los valores que trajo `include=custom_fields`. Vacio si la Tarea llego sin el include. */
  const valoresDeLaTarea = tarea.custom_fields ?? SIN_CAMPOS

  /*
   * Las personas asignables. Efecto propio y sin `espacioId`: la lista no depende del Espacio, y una
   * Tarea suelta —sin Espacio— tambien necesita poder asignar. `cargarAsignables` cachea, asi que
   * abrir la edicion diez veces es una sola peticion.
   */
  useEffect(() => {
    let vivo = true

    void cargarAsignables()
      .then((personas) => { if (vivo) setAsignables(personas) })
      .catch(() => {
        if (vivo) {
          setAvisoCatalogo('No se pudo traer el equipo: sólo quedan las personas que ya están en la tarea.')
        }
      })

    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (espacioId === null) return

    const control = new AbortController()

    void pedirSobre<Hito[]>(`projects/${espacioId}/milestones`, control.signal)
      .then((listaHitos) => {
        if (!control.signal.aborted) setHitos(listaHitos.data)
      })
      .catch(() => {
        if (!control.signal.aborted) {
          setAvisoCatalogo('No se pudieron traer los hitos del espacio.')
        }
      })

    return () => { control.abort() }
  }, [espacioId])

  /*
   * Definiciones de los campos personalizados. Van en su propio efecto y no en el de arriba porque
   * no dependen del Espacio: una Tarea suelta tambien los tiene.
   *
   * Los valores ya vienen en la Tarea; lo que hace falta pedir es el catalogo, que ademas es lo que
   * decide el orden, el tipo y las opciones de cada campo.
   */
  useEffect(() => {
    const control = new AbortController()

    void pedirSobre<DefinicionCampoPersonalizado[]>('custom-fields?para=tasks', control.signal)
      .then((sobre) => {
        if (control.signal.aborted) return

        const ordenadas = camposOrdenados(sobre.data)
        const valores = valoresIniciales(ordenadas, valoresDeLaTarea)

        setDefiniciones(ordenadas)
        setPersonalizadosIniciales(valores)
        setPersonalizados(valores)
      })
      .catch(() => {
        // Sin definiciones el resto del formulario funciona igual; se dice y no se rompe la edicion.
        if (!control.signal.aborted) {
          setAvisoCatalogo('No se pudieron traer los campos personalizados de la tarea.')
        }
      })

    return () => { control.abort() }
  }, [valoresDeLaTarea])

  const elegibles = personasElegibles(asignables, [...tarea.assignees, ...tarea.followers])
  const prioridades = listaDe(lookups, 'task_priorities')
  const etiquetas = lookups.tags

  /**
   * Guarda los cambios. Un formulario sin cambios cierra sin escribir: no hay nada que mandar.
   *
   * Son dos escrituras porque la API las separa: `PATCH /tasks/{id}` rechaza cualquier clave que no
   * este en su lista blanca, y los campos personalizados van por `PATCH /custom-fields/values`. Los
   * campos se validan antes de la primera para que un `required` vacio no deje la Tarea guardada a
   * medias, y el `422` con el numero del campo por mensaje no llegue nunca a la pantalla.
   */
  async function guardar (evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()

    if (campos.nombre.trim() === '') {
      setError(`La ${GLOSARIO.proceso.singular.toLowerCase()} necesita un nombre.`)
      return
    }

    const horasMal = errorDeHorasEstimadas(campos.horasEstimadas)

    if (horasMal !== null) {
      setError(horasMal)
      return
    }

    const fallos = esquemaDeCamposPersonalizados(definiciones)
      .validar(personalizados, personalizadosIniciales)

    setErroresCampos(fallos)

    if (Object.keys(fallos).length > 0) {
      setError('Revisa los campos marcados.')
      return
    }

    const cuerpo = cuerpoDeParche(inicial, campos)
    const parcheCampos = cuerpoDeCamposPersonalizados(
      'tasks', tarea.id, definiciones, personalizadosIniciales, personalizados
    )

    if (Object.keys(cuerpo).length === 0 && parcheCampos === null) {
      onCerrar()
      return
    }

    setEnCurso(true)
    setError(null)

    if (Object.keys(cuerpo).length > 0) {
      const resultado = await escribirEnBff<Proceso>(`tasks/${tarea.id}`, 'PATCH', cuerpo)

      if (!resultado.ok) {
        setEnCurso(false)
        setError(resultado.mensaje)
        return
      }
    }

    if (parcheCampos !== null) {
      const guardados = await escribirEnBff('custom-fields/values', 'PATCH', parcheCampos)

      if (!guardados.ok) {
        setEnCurso(false)
        setError(`No se guardaron los campos personalizados: ${guardados.mensaje}`)
        // El resto ya se escribio: quien mire el detalle tiene que verlo aunque esto haya fallado.
        onGuardada()
        return
      }
    }

    setEnCurso(false)
    onCerrar()
    onGuardada()
  }

  /** Agrega o saca una etiqueta del catalogo de las elegidas. */
  function alternarEtiqueta (id: number): void {
    setCampos((previos) => ({
      ...previos,
      etiquetas: previos.etiquetas.includes(id)
        ? previos.etiquetas.filter((elegida) => elegida !== id)
        : [...previos.etiquetas, id]
    }))
  }

  /**
   * Suma una etiqueta escrita a mano. Viaja como nombre y la crea la API al guardar.
   *
   * Si el nombre ya esta en el catalogo se agrega el id en vez del texto: mandar el nombre tambien
   * funcionaria —la API lo resuelve sin distinguir mayusculas— pero dejaria la casilla del menu sin
   * marcar y la misma etiqueta se veria dos veces.
   */
  function agregarEtiquetaEscrita (): void {
    const nombre = etiquetaNueva.trim()
    if (nombre === '') return

    const delCatalogo = etiquetas.find((etiqueta) => etiqueta.name.toLowerCase() === nombre.toLowerCase())
    const valor = delCatalogo === undefined ? nombre : delCatalogo.id

    setEtiquetaNueva('')
    setCampos((previos) => (
      previos.etiquetas.some((elegida) => (
        typeof elegida === 'string' && typeof valor === 'string'
          ? elegida.toLowerCase() === valor.toLowerCase()
          : elegida === valor
      ))
        ? previos
        : { ...previos, etiquetas: [...previos.etiquetas, valor] }
    ))
  }

  /** Saca una etiqueta escrita a mano, que no tiene casilla en el menu del catalogo. */
  function quitarEtiquetaEscrita (nombre: string): void {
    setCampos((previos) => ({
      ...previos,
      etiquetas: previos.etiquetas.filter((elegida) => elegida !== nombre)
    }))
  }

  const elegidas = nombresDeEtiquetas(etiquetas, campos.etiquetas)
  const escritas = campos.etiquetas.filter((elegida): elegida is string => typeof elegida === 'string')

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo
        titulo={`Editar ${GLOSARIO.proceso.singular.toLowerCase()}`}
        descripcion="Se guarda sólo lo que cambies."
      >
        <form className="flex flex-col gap-4" onSubmit={(evento) => { void guardar(evento) }}>
          <Campo etiqueta="Nombre" requerido>
            {(props) => (
              <Entrada
                {...props}
                value={campos.nombre}
                onChange={(evento) => setCampos({ ...campos, nombre: evento.target.value })}
              />
            )}
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Prioridad">
              {({ id }) => (
                <Selector
                  value={campos.prioridad}
                  onValueChange={(valor) => setCampos({ ...campos, prioridad: valor })}
                >
                  <DisparadorSelector id={id} />
                  <ContenidoSelector>
                    {prioridades.map((prioridad) => (
                      <Opcion key={prioridad.id} value={String(prioridad.id)}>{prioridad.name}</Opcion>
                    ))}
                  </ContenidoSelector>
                </Selector>
              )}
            </Campo>

            <Campo etiqueta={GLOSARIO.hito.singular} ayuda={espacioId === null ? `Sólo las ${GLOSARIO.proceso.plural.toLowerCase()} de un ${GLOSARIO.espacio.singular.toLowerCase()} tienen ${GLOSARIO.hito.singular.toLowerCase()}.` : undefined}>
              {({ id }) => (
                <Selector
                  value={campos.hito === '' ? SIN_HITO : campos.hito}
                  onValueChange={(valor) => setCampos({ ...campos, hito: valor === SIN_HITO ? '' : valor })}
                  disabled={espacioId === null}
                >
                  <DisparadorSelector id={id} />
                  <ContenidoSelector>
                    <Opcion value={SIN_HITO}>Sin {GLOSARIO.hito.singular.toLowerCase()}</Opcion>
                    {hitos.map((hito) => (
                      <Opcion key={hito.id} value={String(hito.id)}>{hito.name}</Opcion>
                    ))}
                  </ContenidoSelector>
                </Selector>
              )}
            </Campo>

            <Campo etiqueta="Inicio">
              {(props) => (
                <Entrada
                  {...props}
                  type="date"
                  value={campos.inicio}
                  onChange={(evento) => setCampos({ ...campos, inicio: evento.target.value })}
                />
              )}
            </Campo>

            <Campo etiqueta="Entrega">
              {(props) => (
                <Entrada
                  {...props}
                  type="date"
                  value={campos.vencimiento}
                  onChange={(evento) => setCampos({ ...campos, vencimiento: evento.target.value })}
                />
              )}
            </Campo>
          </div>

          <Campo etiqueta="Horas estimadas" ayuda="Acepta decimales. Déjalo vacío si todavía no se estimó.">
            {(props) => (
              <Entrada
                {...props}
                type="number"
                min={0}
                step="0.5"
                value={campos.horasEstimadas}
                onChange={(evento) => setCampos({ ...campos, horasEstimadas: evento.target.value })}
              />
            )}
          </Campo>

          <Campo etiqueta="Asignados">
            {({ id }) => (
              <SelectorPersonas
                id={id}
                personas={elegibles}
                elegidas={campos.asignados}
                onCambiar={(ids) => setCampos({ ...campos, asignados: ids })}
              />
            )}
          </Campo>

          <Campo etiqueta="Seguidores" ayuda="Reciben las novedades sin ser responsables.">
            {({ id }) => (
              <SelectorPersonas
                id={id}
                personas={elegibles}
                elegidas={campos.seguidores}
                onCambiar={(ids) => setCampos({ ...campos, seguidores: ids })}
              />
            )}
          </Campo>

          <Campo etiqueta="Etiquetas" ayuda="Elige de la lista o escribe una nueva: si no existe, se crea al guardar.">
            {({ id }) => (
              <div className="flex flex-col gap-2">
                <MenuContextual>
                  <DisparadorMenu
                    id={id}
                    className={cn(CLASES_DISPARADOR, campos.etiquetas.length === 0 && 'text-texto-sutil')}
                  >
                    <span className="truncate">
                      {elegidas.length === 0 ? 'Elegir etiquetas' : elegidas.join(', ')}
                    </span>
                  </DisparadorMenu>

                  <ContenidoMenu align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                    <div className="max-h-64 overflow-y-auto">
                      {etiquetas.length === 0
                        ? <p className="text-texto-sutil px-2.5 py-3 text-center text-xs">No hay etiquetas creadas.</p>
                        : etiquetas.map((etiqueta) => (
                          <ItemMenuMarcable
                            key={etiqueta.id}
                            checked={campos.etiquetas.includes(etiqueta.id)}
                            onCheckedChange={() => alternarEtiqueta(etiqueta.id)}
                          >
                            {etiqueta.name}
                          </ItemMenuMarcable>
                          ))}
                    </div>
                  </ContenidoMenu>
                </MenuContextual>

                {/* El alta va aparte del menu: el menu marca lo que ya existe y esto suma lo que no.
                    `Enter` no manda el formulario, agrega la etiqueta. */}
                <div className="flex gap-2">
                  <Entrada
                    value={etiquetaNueva}
                    placeholder="Etiqueta nueva"
                    maxLength={100}
                    onChange={(evento) => setEtiquetaNueva(evento.target.value)}
                    onKeyDown={(evento) => {
                      if (evento.key !== 'Enter') return
                      evento.preventDefault()
                      agregarEtiquetaEscrita()
                    }}
                  />
                  <Boton
                    type="button"
                    variante="secundario"
                    disabled={etiquetaNueva.trim() === ''}
                    onClick={agregarEtiquetaEscrita}
                  >
                    Agregar
                  </Boton>
                </div>

                {escritas.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {escritas.map((nombre) => (
                      <li key={nombre}>
                        <button
                          type="button"
                          className="border-borde text-texto-sutil hover:text-texto flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                          onClick={() => quitarEtiquetaEscrita(nombre)}
                        >
                          {nombre}
                          <span aria-hidden="true">×</span>
                          <span className="sr-only">Quitar</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Campo>

          <Campo etiqueta="Descripción">
            {(props) => (
              <AreaTexto
                {...props}
                rows={5}
                value={campos.descripcion}
                onChange={(evento) => setCampos({ ...campos, descripcion: evento.target.value })}
              />
            )}
          </Campo>

          <CamposPersonalizados
            definiciones={definiciones}
            valores={personalizados}
            errores={erroresCampos}
            onCambiar={(valores) => {
              setPersonalizados(valores)
              // El error de un campo deja de tener sentido en cuanto alguien lo toca.
              setErroresCampos({})
            }}
            deshabilitado={enCurso}
          />

          {avisoCatalogo !== null && (
            <p className="text-texto-tenue text-xs">{avisoCatalogo}</p>
          )}

          {error !== null && (
            <p role="alert" className="text-texto-peligro text-sm">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="secundario" type="button" disabled={enCurso}>Cancelar</Boton>
            </CerrarDialogo>
            <Boton variante="primario" type="submit" cargando={enCurso}>Guardar</Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}

/**
 * Valor del "sin hito" en el selector.
 *
 * Radix no acepta `value=""` en una opcion —la cadena vacia es como marca "nada elegido"—, asi que
 * la ausencia viaja con un centinela y se traduce a `''` al guardar.
 */
const SIN_HITO = 'ninguno'
