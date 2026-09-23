'use client'

import Link from 'next/link'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { camposDeLicitacion } from '@/componentes/licitacion/campos'
import { ControlDeCampo } from '@/componentes/proyecto/FormularioRecurso'
import { cuerpoDelFormulario, validarFormulario, valoresIniciales, type CampoFormulario, type OpcionCampo } from '@/componentes/proyecto/formulario'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { mensajeDeRespuesta, pedirSobre } from '@/datos/cliente'
import type { ContactoProspecto, Prospecto, ProspectoDetalle } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { claveBorrador, crearBorrador, eliminarBorrador, guardarBorrador, leerBorrador, type BorradorLicitacion } from '@/dominio/flujo-licitacion'
import { cn } from '@/lib/clases'
import { CAMPOS_DE_CONTACTO, camposDeProspecto } from './campos'
import { SugerenciasDeProspecto } from './SugerenciasDeProspecto'

const PASOS = ['Prospecto', 'Contacto', 'Licitación'] as const
/* El unico paso que se puede saltar. El dia que se abre una licitacion no siempre se sabe a quien
   llamar, y exigirlo terminaba en contactos inventados para poder seguir. Lo que quede vacio lo
   reclama la ficha despues (`dominio/pendientes-licitacion.ts`). */
const PASO_OMITIBLE = 1
/* Lo urgente va en caja roja y no en texto rojo suelto: un párrafo del color del error se pierde
   entre los campos, y estos tres avisos —sin permiso, creación sin confirmar y fallo del servidor—
   son justo los que detienen el alta. Mismo aspecto que los avisos de los formularios de acceso. */
const ALERTA_URGENTE = 'rounded-chico border border-relleno-peligro/40 bg-superficie-peligro text-texto-peligro px-4 py-3 text-base'
const GRUPOS = ['valoresProspecto', 'valoresContacto', 'valoresLicitacion'] as const

interface PropsFlujo {
  usuarioId: number
  capacidades: Capacidad[]
  paises: OpcionCampo[]
  /** Catalogo `areas` de `GET /lookups` (las areas del equipo), para el campo Área del paso 3. */
  areas: OpcionCampo[]
  /** Catalogo `staff` de `GET /lookups`, para los campos Owner y Focal del paso 3. */
  staff: OpcionCampo[]
  prospecto?: Pick<Prospecto, 'id' | 'empresa' | 'cliente'>
  contactos?: ContactoProspecto[]
  onCerrar: () => void
  onGuardado: () => void
}

/** Recupera el avance local sin impedir abrir el formulario si el almacenamiento está bloqueado. */
function cargarBorrador (clave: string, inicial: BorradorLicitacion) {
  try {
    const guardado = leerBorrador(window.localStorage, clave)
    return { borrador: guardado ?? inicial, aviso: null as string | null, recuperado: guardado !== null }
  } catch (error) {
    return { borrador: inicial, aviso: error instanceof Error ? error.message : 'No se pudo recuperar el borrador.', recuperado: false }
  }
}

/**
 * Guía el alta comercial en tres formularios y conserva campos e IDs confirmados por usuario.
 * Cada avance guarda su entidad; volver atrás actualiza el mismo registro.
 * Las respuestas ambiguas detienen los reintentos para evitar crear registros duplicados.
 *
 * El paso Contacto se puede omitir: la licitación cuelga del prospecto y no del contacto, así que
 * exigirlo sólo conseguía que se inventara una persona para poder seguir. Lo mismo vale para el Focal
 * del tercer paso, que nunca fue obligatorio. Lo que quede vacío no se pierde: `PendientesLicitacion`
 * lo reclama en la ficha hasta que alguien lo complete.
 */
export function FlujoLicitacion ({ usuarioId, capacidades, paises, areas, staff, prospecto, contactos = [], onCerrar, onGuardado }: PropsFlujo) {
  const router = useRouter()
  const clave = claveBorrador(usuarioId, prospecto?.id)
  const camposEmpresa = useMemo(() => camposDeProspecto(paises), [paises])
  // `prospecto_id` se quita porque el prospecto ya quedó elegido en el paso 1. Los catalogos van en
  // las dependencias: sin ellas los selectores se congelarían con lo que hubiera en el primer render.
  const camposLicitacion = useMemo(
    () => camposDeLicitacion([], areas, staff).filter((campo) => campo.clave !== 'prospecto_id'),
    [areas, staff]
  )
  const [carga] = useState(() => cargarBorrador(clave, crearBorrador(prospecto?.id ?? null,
    valoresIniciales(camposEmpresa, prospecto ? { cliente: prospecto.cliente } : null))))
  const [borrador, setBorrador] = useState(carga.borrador)
  const [aviso, setAviso] = useState(carga.aviso)
  const [guardadoLocal, setGuardadoLocal] = useState(carga.recuperado)
  const [fallo, setFallo] = useState<string | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  // Los contactos del prospecto elegido. Arrancan con los de la ficha desde la que se abrió el flujo y
  // se reemplazan si en el paso 1 se elige un prospecto que ya existía.
  const [contactosDelProspecto, setContactosDelProspecto] = useState(contactos)
  const enviando = useRef(false)
  const puedeEditar = capacidades.includes('edit')
  const paso = borrador.paso
  const grupo = GRUPOS[paso]
  const campos = paso === 0 ? camposEmpresa : paso === 1 ? CAMPOS_DE_CONTACTO : camposLicitacion
  const soloLectura = paso === 0 && (prospecto !== undefined || (borrador.prospectoId !== null && !puedeEditar)) || paso === 1 && !puedeEditar
  const sinPermiso = !capacidades.includes('create') || (!puedeEditar && borrador.prospectoId === null)
  // Escribir un contacto nuevo sigue exigiendo permiso de edicion. Lo que ya no pasa es que eso frene
  // el alta entera: sin ese permiso el paso se omite, que es la salida que ahora existe.
  const sinPermisoDeContacto = paso === PASO_OMITIBLE && !puedeEditar && borrador.contactoId === null
  const sinContacto = borrador.contactoId === null
  const rutaRevision = borrador.prospectoId === null ? '/prospectos' : `/prospectos/${borrador.prospectoId}?tab=${paso === 2 ? 'licitaciones' : 'contactos'}`
  // Mientras hay una escritura en vuelo, o ya se creó la licitación, ni el indicador ni los botones
  // pueden mover de paso: es la misma condición que ya apagaba el `fieldset` y el botón «Atrás».
  const bloqueado = guardando || borrador.pendiente !== null || borrador.licitacionId !== null

  /** Escribe inmediatamente para conservar también los IDs recibidos antes de cerrar o recargar. */
  function actualizar (siguiente: BorradorLicitacion): boolean {
    setBorrador(siguiente)
    try {
      guardarBorrador(window.localStorage, clave, siguiente)
      setGuardadoLocal(true)
      setAviso(null)
      return true
    } catch (error) {
      setGuardadoLocal(false)
      setAviso(error instanceof Error ? error.message : 'No se pudo guardar el borrador. Mantén esta ventana abierta.')
      return false
    }
  }

  /** Cierra únicamente cuando el avance quedó guardado en el navegador. */
  function guardarYSalir (): void {
    if (enviando.current || !actualizar(borrador)) return
    onGuardado()
    onCerrar()
  }

  /** Descarta sólo el avance local; los registros confirmados en la aplicación permanecen. */
  function descartar (): void {
    if (!window.confirm('¿Descartar este borrador? Los prospectos y contactos ya guardados permanecerán en la aplicación.')) return
    try {
      eliminarBorrador(window.localStorage, clave)
      onGuardado()
      onCerrar()
    } catch (error) {
      setAviso(error instanceof Error ? error.message : 'No se pudo descartar el borrador.')
    }
  }

  /** Cambia de etapa sin borrar sus campos ni los identificadores ya confirmados. */
  function cambiarPaso (siguiente: 0 | 1 | 2): void {
    setErrores({})
    setFallo(null)
    actualizar({ ...borrador, paso: siguiente })
  }

  /**
   * Toma un prospecto que ya existe en vez de crear otro con la misma empresa.
   *
   * Se pide la ficha y no se usa la fila de la búsqueda: hacen falta los datos de la empresa —volver
   * al paso 1 y guardar los reescribiría con lo que hubiera en el formulario— y sus contactos, para
   * poder elegir uno en el paso 2. No hay nada que crear, así que no pasa por `pendiente`.
   */
  async function usarProspectoExistente ({ id }: { id: number }): Promise<void> {
    if (enviando.current || bloqueado) return
    enviando.current = true
    setGuardando(true)
    setFallo(null)
    setErrores({})
    try {
      const { data: ficha } = await pedirSobre<ProspectoDetalle>(`prospectos/${id}`, new AbortController().signal)
      setContactosDelProspecto(Array.isArray(ficha.contactos) ? ficha.contactos : [])
      actualizar({ ...borrador, paso: 1, prospectoId: ficha.id, contactoId: null, valoresContacto: {},
        valoresProspecto: valoresIniciales(camposEmpresa, { cliente: ficha.cliente }) })
    } catch (error) {
      setFallo(error instanceof Error ? error.message : 'No se pudo abrir el prospecto elegido.')
    } finally {
      enviando.current = false
      setGuardando(false)
    }
  }

  /** Selecciona un contacto existente o prepara uno nuevo, manteniendo el mismo prospecto. */
  function elegirContacto (valor: string | boolean | string[]): void {
    const contacto = contactosDelProspecto.find((item) => String(item.id) === valor)
    setErrores({})
    actualizar({ ...borrador, contactoId: contacto?.id ?? null, valoresContacto: valoresIniciales(CAMPOS_DE_CONTACTO, contacto?.contacto ? { ...contacto.contacto } : null) })
  }

  /**
   * Salta el paso Contacto sin crear a nadie.
   *
   * Descarta lo tecleado a medias además de avanzar: dejarlo guardado en el borrador haría que
   * «Atrás» mostrara media persona cargada y que el siguiente «Guardar y continuar» la creara sin
   * que nadie lo pidiera. Omitir significa que no hay contacto, no que hay uno a medio escribir.
   */
  function omitirContacto (): void {
    setErrores({})
    setFallo(null)
    actualizar({ ...borrador, contactoId: null, valoresContacto: {}, paso: 2 })
  }

  /** Valida la etapa, guarda o actualiza su recurso y avanza sólo tras recibir un ID válido. */
  async function continuar (evento: FormEvent): Promise<void> {
    evento.preventDefault()
    if (enviando.current || borrador.pendiente !== null || borrador.licitacionId !== null || sinPermiso || sinPermisoDeContacto) return
    const encontrados = validarFormulario(campos, borrador[grupo])
    if (paso === 1 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(borrador.valoresContacto.email ?? ''))) encontrados.email = 'Escribe un correo válido.'
    setErrores(encontrados)
    if (Object.keys(encontrados).length > 0) return
    if (soloLectura) { cambiarPaso(paso === 0 ? 1 : 2); return }

    const id = paso === 0 ? borrador.prospectoId : paso === 1 ? borrador.contactoId : null
    const metodo = id === null ? 'POST' : 'PATCH'
    const ruta = paso === 0 ? `prospectos${id === null ? '' : `/${id}`}`
      : paso === 1 ? `prospectos/${borrador.prospectoId}/contactos${id === null ? '' : `/${id}`}` : 'licitaciones'
    const cuerpo = cuerpoDelFormulario(campos, borrador[grupo])
    if (paso === 2) cuerpo.prospecto_id = borrador.prospectoId
    const pendiente = metodo === 'POST' ? (paso === 0 ? 'prospecto' : paso === 1 ? 'contacto' : 'licitacion') : null
    // Sin un checkpoint durable, una recarga tras el POST podría repetir el alta.
    if (!actualizar({ ...borrador, pendiente })) return
    enviando.current = true
    setGuardando(true)
    setFallo(null)
    try {
      const respuesta = await fetch(`/api/bff/${ruta}`, { method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
      if (!respuesta.ok) {
        if (respuesta.status >= 400 && respuesta.status < 500) actualizar({ ...borrador, pendiente: null })
        setFallo(await mensajeDeRespuesta(respuesta))
        return
      }
      const sobre = await respuesta.json() as { data?: { id?: number } }
      const confirmado = sobre.data?.id ?? (metodo === 'PATCH' ? id : null)
      if (!Number.isSafeInteger(confirmado) || (confirmado ?? 0) <= 0) throw new Error('El servidor no confirmó el registro guardado.')
      if (paso === 2) {
        actualizar({ ...borrador, pendiente: null, licitacionId: confirmado as number })
        eliminarBorrador(window.localStorage, clave)
        onGuardado()
        onCerrar()
        router.push(`/licitaciones/${confirmado}`)
        return
      }
      actualizar({ ...borrador, pendiente: null, paso: paso === 0 ? 1 : 2,
        ...(paso === 0 ? { prospectoId: confirmado as number } : { contactoId: confirmado as number }) })
    } catch {
      setFallo('No se pudo confirmar el guardado. Revisa la conexión y los registros antes de reintentar.')
    } finally {
      enviando.current = false
      setGuardando(false)
    }
  }

  /**
   * Dibuja una etapa del indicador de progreso.
   *
   * Las ya completadas son un botón real y devuelven a su formulario; la actual y las que faltan son
   * texto. Se prefiere un `span` a un botón deshabilitado porque un control apagado se anuncia como
   * «no disponible», y el paso en el que estás parado no es algo que se te haya negado.
   */
  function dibujarPaso (nombre: string, indice: number) {
    const hecho = indice < paso
    const actual = indice === paso
    const rotulo = `Paso ${indice + 1} de ${PASOS.length}: ${nombre}${hecho ? ' (completado)' : ''}`
    const interior = (
      <>
        <span aria-hidden="true" className={cn('grid size-9 shrink-0 place-items-center rounded-full border text-base font-semibold',
          hecho ? 'bg-relleno-exito text-relleno-exito-contenido border-transparent'
            : actual ? 'bg-acento text-acento-contenido border-transparent'
              : 'border-linea text-texto-sutil')}>{hecho ? '✓' : indice + 1}</span>
        <span aria-hidden="true" className={cn('hidden truncate text-base sm:inline',
          actual ? 'text-texto font-semibold' : hecho ? 'text-texto' : 'text-texto-sutil')}>{nombre}</span>
      </>
    )
    return (
      <li key={nombre} aria-current={actual ? 'step' : undefined} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {hecho && !bloqueado
          ? (
            <button type="button" aria-label={`Volver al ${rotulo}`} onClick={() => { cambiarPaso(indice as 0 | 1 | 2) }}
              className="rounded-control hover:bg-hover -mx-1 flex min-w-0 items-center gap-2 px-1 py-1 transition-colors duration-150">
              {interior}
            </button>
            )
          : (
            <span className="flex min-w-0 items-center gap-2 px-1 py-1">
              <span className="sr-only">{rotulo}</span>
              {interior}
            </span>
            )}
        {indice < PASOS.length - 1 && (
          <span aria-hidden="true" className={cn('h-1 min-w-3 flex-1 rounded-full', hecho ? 'bg-gradiente-marca' : 'bg-linea')} />
        )}
      </li>
    )
  }

  /** Reutiliza los controles existentes con validación y valores independientes para cada paso. */
  function dibujarCampo (campo: CampoFormulario) {
    return <ControlDeCampo key={campo.clave} campo={campo} valor={borrador[grupo][campo.clave]} error={errores[campo.clave]}
      alCambiar={(valor) => { actualizar({ ...borrador, [grupo]: { ...borrador[grupo], [campo.clave]: valor } }) }} />
  }

  const opcionesContacto = contactosDelProspecto.map((contacto) => ({ valor: String(contacto.id), etiqueta: `${contacto.contacto?.firstname ?? ''} ${contacto.contacto?.lastname ?? ''}`.trim() || `Contacto #${contacto.id}` }))
  if (borrador.contactoId !== null && !contactosDelProspecto.some((contacto) => contacto.id === borrador.contactoId)) opcionesContacto.push({ valor: String(borrador.contactoId), etiqueta: 'Contacto guardado en este flujo' })

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) guardarYSalir() }}>
      <ContenidoDialogo titulo="Preparar licitación" descripcion="Completa cada paso. Puedes guardar y continuar después." ancho="grande">
        {/* Los nombres de las etapas se esconden bajo `sm`: tres rótulos y tres círculos no entran en
            un panel de 320px sin encogerse hasta ser ilegibles. El número de paso queda igual bajo el
            título, así que en angosto no se pierde ni dónde estás ni cuánto falta. */}
        <ol aria-label="Pasos de la licitación" className="mb-6 flex items-center gap-2 sm:gap-3">
          {PASOS.map(dibujarPaso)}
        </ol>
        <form onSubmit={(evento) => { void continuar(evento) }} className="asistente-licitacion flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-texto-tenue text-sm font-medium">Paso {paso + 1} de {PASOS.length}</p>
            {/* Mismo degradado de marca que los títulos del panel: la clase y el ciclo de brillo ya
                viven en `globals.css`, acá sólo se los usa. */}
            <h2 className="font-titular text-seccion font-extrabold tracking-tight">
              <span className="texto-gradiente-animado">{PASOS[paso]}</span>
            </h2>
            <span aria-hidden="true" className="bg-gradiente-marca h-1 w-16 shrink-0 rounded-full" />
          </div>
          {paso > 0 && <p className="text-texto-tenue text-base">{String(borrador.valoresProspecto['cliente.company'] ?? prospecto?.empresa ?? '')}</p>}
          {paso === PASO_OMITIBLE && (
            <p className="text-texto-tenue text-sm">
              La persona de contacto es opcional: si todavía no sabes a quién llamar, omite este paso y
              la ficha de la licitación lo recordará hasta que se cargue.
            </p>
          )}
          {paso === 1 && opcionesContacto.length > 0 && (
            <fieldset disabled={bloqueado}>
              <ControlDeCampo campo={{ clave: 'contacto_elegido', etiqueta: 'Usar contacto', tipo: 'seleccion', opciones: [...(puedeEditar ? [{ valor: 'nuevo', etiqueta: 'Nuevo contacto' }] : []), ...opcionesContacto] }}
                valor={borrador.contactoId === null ? (puedeEditar ? 'nuevo' : '') : String(borrador.contactoId)} error={undefined} alCambiar={elegirContacto} />
            </fieldset>
          )}
          <fieldset disabled={bloqueado || soloLectura} className="grid gap-5 sm:grid-cols-2">
            {(paso === 0 ? campos.slice(0, 1) : campos).map(dibujarCampo)}
            {paso === 0 && prospecto === undefined && borrador.prospectoId === null && (
              <SugerenciasDeProspecto texto={String(borrador.valoresProspecto['cliente.company'] ?? '')} deshabilitado={bloqueado}
                alUsarExistente={(elegido) => { void usarProspectoExistente(elegido) }} />
            )}
            {paso === 0 && <details className="sm:col-span-2" open={campos.slice(1).some((campo) => errores[campo.clave]) || undefined}>
              <summary className="text-texto-tenue cursor-pointer">Datos adicionales de la empresa (opcional)</summary>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">{campos.slice(1).map(dibujarCampo)}</div>
            </details>}
          </fieldset>
          {sinPermiso && <p role="alert" className={ALERTA_URGENTE}>Necesitas permiso de creación de proyectos para dar de alta esta licitación.</p>}
          {sinPermisoDeContacto && <p role="status" className="text-texto-tenue text-sm">No tienes permiso de edición para añadir un contacto. Puedes omitir este paso: quedará pendiente en la ficha.</p>}
          {paso === 2 && sinContacto && (
            <p role="status" className="text-texto-tenue text-sm">
              Esta licitación se va a crear sin persona de contacto. Queda pendiente y se avisa en su
              ficha hasta que se cargue en el prospecto.
            </p>
          )}
          {borrador.licitacionId !== null && <p role="status" className="text-base">La licitación ya está creada. <Link href={`/licitaciones/${borrador.licitacionId}`} className="text-acento underline">Abrir licitación</Link></p>}
          {borrador.pendiente !== null && !guardando && <div role="alert" className={cn(ALERTA_URGENTE, 'flex flex-col items-start gap-3')}>
            <p>No se pudo confirmar la última creación. Revisa si se guardó antes de reintentar para evitar duplicados.</p>
            <Link href={rutaRevision} target="_blank" className="underline">Revisar registros</Link>
            <Boton type="button" variante="sutil" onClick={() => { actualizar({ ...borrador, pendiente: null }); setFallo(null) }}>Ya revisé; permitir reintento</Boton>
          </div>}
          {fallo !== null && <p role="alert" className={ALERTA_URGENTE}>{fallo}</p>}
          {aviso !== null ? <p role="alert" className={ALERTA_URGENTE}>{aviso}</p>
            : <p role="status" className="text-texto-tenue text-sm">{guardadoLocal ? 'Borrador guardado en este navegador.' : 'El avance se guarda automáticamente en este navegador.'} Los pasos completados ya están guardados en la aplicación.</p>}
          <div className="flex flex-wrap justify-end gap-3">
            <Boton type="button" variante="sutil" disabled={guardando} onClick={descartar}>Descartar borrador</Boton>
            {aviso !== null && <Boton type="button" variante="sutil" disabled={guardando} onClick={() => {
              if (window.confirm('¿Cerrar sin guardar los últimos cambios del borrador?')) onCerrar()
            }}>Cerrar sin guardar</Boton>}
            {paso > 0 && <Boton type="button" variante="sutil" disabled={bloqueado} onClick={() => { cambiarPaso(paso === 2 ? 1 : 0) }}>Atrás</Boton>}
            {paso === PASO_OMITIBLE && sinContacto && <Boton type="button" variante="sutil" disabled={bloqueado} onClick={omitirContacto}>Omitir por ahora</Boton>}
            <Boton type="button" variante="secundario" disabled={guardando} onClick={guardarYSalir}>Guardar y salir</Boton>
            {/* La accion que cierra el paso es la unica del pie con relleno: con cuatro botones
                todos iguales, «Guardar y salir» pesaba lo mismo que «Crear licitacion». */}
            <Boton type="submit" variante="primario" cargando={guardando} disabled={sinPermiso || sinPermisoDeContacto || borrador.pendiente !== null || borrador.licitacionId !== null}>
              {paso === 2 ? 'Crear licitación' : soloLectura ? 'Continuar' : 'Guardar y continuar'}
            </Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}
