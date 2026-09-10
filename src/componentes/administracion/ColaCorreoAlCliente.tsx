'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from '@/componentes/datos/Tabla'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Vacio } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, CLASES_CONTROL, Entrada } from '@/componentes/formularios/Entrada'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import { CerrarDialogo, ContenidoDialogo, Dialogo, DisparadorDialogo } from '@/componentes/superposiciones/Dialogo'
import { VisorColaCorreo, type ContadorDeCola } from './VisorColaCorreo'
import { pedirSobre } from '@/datos/cliente'
import { avisoDelMotor } from '@/dominio/correo-cliente'
import { nombrar } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import type { Cliente, ContactoCompleto, EstadoCorreoCliente, FilaColaCorreoCliente } from '@/datos/recursos'
import type { ResumenColaCorreoCliente } from '@/datos/tipos'

/** Rótulo y tono de cada estado de `tblwiwo_correo_cliente_cola`. */
const ESTADOS: Record<EstadoCorreoCliente, { etiqueta: string, tono: TonoInsignia }> = {
  pendiente: { etiqueta: 'Pendiente', tono: 'neutro' },
  enviado: { etiqueta: 'Enviado', tono: 'exito' },
  error: { etiqueta: 'Falló', tono: 'peligro' }
}

/** Nombre legible de cada plantilla. Espeja `CorreoAlCliente::PLANTILLAS`. */
const PLANTILLAS: Record<string, string> = {
  enlace_acceso_portal: 'Enlace de acceso al portal'
}

/** Ruta del recurso en el BFF. Sin barra inicial: la pone `escribirEnBff`. */
const RUTA = 'notifications/client-mail-queue'

/** Claves que la API acepta en `payload`. Espeja `CorreoAlCliente::CLAVES_PAYLOAD`. */
const CLAVES_PAYLOAD = ['expires_at', 'generado_por', 'nota'] as const

/** Tope de la nota. Espeja `CorreoAlCliente::TEXTO_MAXIMO`. */
const TOPE_NOTA = 500

/** La única plantilla escrita. Espeja `CorreoAlCliente::PLANTILLA_ENLACE_ACCESO`. */
const PLANTILLA_INICIAL = 'enlace_acceso_portal'

/** Letras mínimas antes de salir a buscar clientes: con una sola la lista no discrimina nada. */
const MINIMO_BUSQUEDA = 2

/**
 * El payload de una fila, recortado a lo que la API acepta.
 *
 * Editar reemplaza el payload entero, así que hay que devolver también lo que ya estaba. Y se filtra
 * porque una fila vieja con una clave que la lista blanca no conoce haría rebotar la edición con un
 * 422 que quien la escribe no puede arreglar desde la pantalla.
 */
function payloadEditable (fila: FilaColaCorreoCliente): Record<string, unknown> {
  const actual = fila.payload ?? {}

  return Object.fromEntries(
    CLAVES_PAYLOAD.filter((clave) => clave in actual).map((clave) => [clave, actual[clave]])
  )
}

/** La nota de una fila, o cadena vacía si no tiene. */
function notaDe (fila: FilaColaCorreoCliente): string {
  const nota = fila.payload?.nota

  return typeof nota === 'string' ? nota : ''
}

interface PropsColaCorreoAlCliente {
  filas: FilaColaCorreoCliente[]
  resumen: ResumenColaCorreoCliente
}

/**
 * El visor de `tblwiwo_correo_cliente_cola` (`/notifications/client-mail-queue`).
 *
 * Ya no es solo mirar: un superadministrador encola a mano, corrige lo pendiente, reintenta lo que
 * falló y descarta lo que sobra. **Nada de eso manda un correo**: el motor sigue en `apagado` y no
 * hay proceso que vacíe la cola, así que el aviso de arriba —y el `engine_enabled: false` del
 * resumen— siguen siendo la prueba de que no salió ninguno.
 *
 * Lo `enviado` no se toca: es un hecho registrado, no un borrador. La API lo rechaza con 409 y acá
 * ni siquiera se ofrece el botón, para no invitar a un error que va a volver.
 *
 * Es una tabla estática, sin filtros ni paginación, a diferencia de la de Perfex: `TablaRecurso`
 * guarda el estado de la vista en la query de la URL sin espacio de nombres, así que dos en la misma
 * pantalla se pisarían el `page` y el `filter[status]` —y los estados de las dos colas ni siquiera se
 * llaman igual—. Muestra la primera página que trajo el servidor; el número real de filas lo dice el
 * resumen, que sí es de la cola entera.
 */
export function ColaCorreoAlCliente ({ filas, resumen }: PropsColaCorreoAlCliente): ReactElement {
  const router = useRouter()
  const { titulo, detalle } = avisoDelMotor(resumen)
  const [error, setError] = useState<string | null>(null)

  /** Tras cualquier escritura: el servidor vuelve a resolver la cola y el resumen. */
  function refrescar (): void {
    setError(null)
    router.refresh()
  }

  const contadores: ContadorDeCola[] = [
    { clave: 'pendiente', etiqueta: 'pendientes', valor: resumen.pendiente, tono: 'neutro' },
    { clave: 'enviado', etiqueta: 'enviados', valor: resumen.enviado, tono: 'exito' },
    { clave: 'error', etiqueta: 'fallidos', valor: resumen.error, tono: 'peligro' }
  ]

  const aviso = (
    <div
      role="status"
      className="border-linea-fuerte bg-superficie-aviso text-texto-aviso rounded-tarjeta border-l-4 p-3 text-sm"
    >
      <p className="font-semibold">{titulo}</p>
      <p className="mt-1">{detalle}</p>
    </div>
  )

  return (
    <VisorColaCorreo
      contadores={contadores}
      total={resumen.total}
      aviso={aviso}
      acciones={<Compositor onListo={refrescar} />}
    >
      {error !== null && (
        <p role="alert" className="text-texto-peligro text-sm">{error}</p>
      )}

      {filas.length === 0
        ? (
          <Vacio
            titulo="Todavía no hay nada anotado"
            descripcion={`Acá aparece cada vez que alguien genera el enlace de acceso al portal de un ${nombrar('cliente')}, y lo que se encole a mano desde «Encolar un correo». Se anota la intención de escribirle; el correo no sale.`}
          />
          )
        : (
          <Tabla>
            <EncabezadoTabla>
              <tr>
                <CeldaEncabezado>Contacto</CeldaEncabezado>
                <CeldaEncabezado>Motivo</CeldaEncabezado>
                <CeldaEncabezado>Estado</CeldaEncabezado>
                <CeldaEncabezado>Anotada</CeldaEncabezado>
                <CeldaEncabezado>Acciones</CeldaEncabezado>
              </tr>
            </EncabezadoTabla>
            <CuerpoTabla>
              {filas.map((fila) => (
                <FilaTabla key={fila.id}>
                  <CeldaTabla>
                    {fila.contact === null
                      // El contacto se borró después de encolar: la fila se queda, con el hueco a la
                      // vista. Desaparecer sería perder la única constancia de lo que se anotó.
                      ? <span className="text-texto-sutil">Contacto borrado</span>
                      : (
                        <>
                          <span className="text-texto">{fila.contact.name}</span>
                          <span className="text-texto-tenue block text-xs">{fila.contact.email}</span>
                        </>
                        )}
                  </CeldaTabla>
                  <CeldaTabla>
                    {PLANTILLAS[fila.template] ?? fila.template}
                    {notaDe(fila) !== '' && (
                      <span className="text-texto-tenue block text-xs">{notaDe(fila)}</span>
                    )}
                  </CeldaTabla>
                  <CeldaTabla>
                    <Insignia tono={ESTADOS[fila.status].tono}>{ESTADOS[fila.status].etiqueta}</Insignia>
                    {fila.error !== null && (
                      <span className="text-texto-peligro mt-1 block text-xs">{fila.error}</span>
                    )}
                  </CeldaTabla>
                  <CeldaTabla><Fecha valor={fila.created_at} conHora /></CeldaTabla>
                  <CeldaTabla>
                    <AccionesDeFila fila={fila} onListo={refrescar} onError={setError} />
                  </CeldaTabla>
                </FilaTabla>
              ))}
            </CuerpoTabla>
          </Tabla>
          )}
    </VisorColaCorreo>
  )
}

/** Lo que necesita un botón de fila que muestra su propio error dentro de un diálogo. */
interface PropsDeFila {
  fila: FilaColaCorreoCliente
  onListo: () => void
}

/** El reintento no abre diálogo: su error se muestra arriba de la tabla, con `onError`. */
interface PropsAcciones extends PropsDeFila {
  onError: (mensaje: string) => void
}

/**
 * Lo que se puede hacer con una fila, según su estado.
 *
 * `enviado` no ofrece nada: la API lo rechaza con 409 y un botón que siempre falla es peor que
 * ninguno. `error` ofrece reintentar antes que editar, porque la API exige ese orden — el contenido
 * de una fila fallida se corrige recién después de volverla a poner pendiente.
 */
function AccionesDeFila ({ fila, onListo, onError }: PropsAcciones): ReactElement {
  const [ocupado, setOcupado] = useState(false)

  async function reintentar (): Promise<void> {
    setOcupado(true)
    const resultado = await escribirEnBff(`${RUTA}/${fila.id}`, 'PATCH', { status: 'pendiente' })
    setOcupado(false)

    if (!resultado.ok) {
      onError(resultado.mensaje)
      return
    }

    onListo()
  }

  if (fila.status === 'enviado') {
    return <span className="text-texto-sutil text-xs">Ya salió: no se edita ni se borra</span>
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {fila.status === 'error'
        ? (
          <Boton
            tamano="chico"
            variante="secundario"
            cargando={ocupado}
            onClick={() => { void reintentar() }}
          >
            Reintentar
          </Boton>
          )
        : <EditorDeNota fila={fila} onListo={onListo} />}

      <ConfirmarDescarte fila={fila} onListo={onListo} />
    </div>
  )
}

/**
 * Edita la nota de una fila pendiente.
 *
 * Solo la nota: el resto del payload es contexto que escribió quien la produjo —cuándo vence el
 * enlace, quién lo generó— y reescribirlo a mano no arregla nada. Se manda igual, entero, porque la
 * API reemplaza el campo completo y no lo parchea.
 */
function EditorDeNota ({ fila, onListo }: PropsDeFila): ReactElement {
  const [abierto, setAbierto] = useState(false)
  const [nota, setNota] = useState(() => notaDe(fila))
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  async function guardar (): Promise<void> {
    setGuardando(true)
    setErrorForm(null)

    // Una nota vacía se quita del payload en vez de guardarse como cadena vacía: la ausencia de
    // nota y una nota en blanco son lo mismo, y la API no tiene por qué distinguirlas.
    const { nota: _viejo, ...resto } = payloadEditable(fila)
    const payload = nota.trim() === '' ? resto : { ...resto, nota: nota.trim() }

    const resultado = await escribirEnBff(`${RUTA}/${fila.id}`, 'PATCH', { payload })
    setGuardando(false)

    if (!resultado.ok) {
      setErrorForm(resultado.mensaje)
      return
    }

    setAbierto(false)
    onListo()
  }

  return (
    <Dialogo
      open={abierto}
      onOpenChange={(valor) => { setAbierto(valor); setNota(notaDe(fila)); setErrorForm(null) }}
    >
      <DisparadorDialogo asChild>
        <Boton tamano="chico" variante="secundario">Editar</Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo="Editar la nota de la fila"
        descripcion="Es el contexto que va a leer quien mande este correo el día que exista el envío. Guardar no manda nada."
        ancho="medio"
      >
        <div className="flex flex-col gap-4">
          <Campo etiqueta="Nota" ayuda={`Opcional, hasta ${TOPE_NOTA} caracteres.`}>
            {(props) => (
              <AreaTexto
                {...props}
                value={nota}
                maxLength={TOPE_NOTA}
                onChange={(evento) => { setNota(evento.target.value) }}
              />
            )}
          </Campo>

          {errorForm !== null && (
            <p role="alert" className="text-texto-peligro text-sm">{errorForm}</p>
          )}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="secundario">Cancelar</Boton>
            </CerrarDialogo>
            <Boton variante="primario" cargando={guardando} onClick={() => { void guardar() }}>
              Guardar
            </Boton>
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}

/**
 * Descartar una fila, con confirmación.
 *
 * Con confirmación porque es un `DELETE` de verdad: la fila no pasa a un cuarto estado, desaparece.
 * La migración `0130` cerró el enum en tres valores para no tener que hacer un ALTER, así que
 * descartar es borrar, y borrar no tiene deshacer.
 */
function ConfirmarDescarte ({ fila, onListo }: PropsDeFila): ReactElement {
  const [abierto, setAbierto] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  async function descartar (): Promise<void> {
    setBorrando(true)
    setErrorForm(null)

    const resultado = await escribirEnBff(`${RUTA}/${fila.id}`, 'DELETE')
    setBorrando(false)

    if (!resultado.ok) {
      setErrorForm(resultado.mensaje)
      return
    }

    setAbierto(false)
    onListo()
  }

  return (
    <Dialogo open={abierto} onOpenChange={(valor) => { setAbierto(valor); setErrorForm(null) }}>
      <DisparadorDialogo asChild>
        <Boton tamano="chico" variante="sutil">Descartar</Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo="Descartar esta fila"
        descripcion="Se borra de la cola y no se puede deshacer. Queda registrada en la actividad con tu nombre."
        ancho="chico"
      >
        <div className="flex flex-col gap-4">
          <p className="text-texto-tenue text-sm">
            {fila.contact === null
              ? 'La fila del contacto borrado'
              : `El correo anotado para ${fila.contact.name}`}
            {' · '}
            {PLANTILLAS[fila.template] ?? fila.template}
          </p>

          {errorForm !== null && (
            <p role="alert" className="text-texto-peligro text-sm">{errorForm}</p>
          )}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="secundario">Cancelar</Boton>
            </CerrarDialogo>
            <Boton variante="peligro" cargando={borrando} onClick={() => { void descartar() }}>
              Descartar
            </Boton>
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}

/**
 * El compositor: encola un correo a mano.
 *
 * Se elige primero el cliente y después uno de sus contactos porque la API no tiene un listado plano
 * de contactos —`GET /contacts/{id}` es por id— y pedirle a alguien el id de un contacto no es un
 * formulario, es un acertijo. La búsqueda sale contra `GET /clients?q=`, que es la que ya usa el
 * resto del panel.
 *
 * El motivo es un desplegable de una sola opción hoy: es la única plantilla escrita. Encolar una que
 * nadie sabe renderizar es anotar trabajo que el consumidor va a rebotar, así que la API rechaza
 * cualquier otra y acá directamente no se ofrece.
 */
function Compositor ({ onListo }: { onListo: () => void }): ReactElement {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clienteId, setClienteId] = useState<number | null>(null)
  const [contactos, setContactos] = useState<ContactoCompleto[]>([])
  const [contactoId, setContactoId] = useState<number | null>(null)
  const [plantilla, setPlantilla] = useState(PLANTILLA_INICIAL)
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  // Busca clientes con un respiro de 300 ms: sin él, cada tecla es un viaje al BFF.
  //
  // El efecto solo pide; vaciar la lista lo hace quien escribe en el buscador. Poner un `setState`
  // suelto en el cuerpo del efecto es lo que el lint del proyecto rechaza —dispara un render en
  // cascada— y además acá sería redundante: el estado ya lo limpia el `onChange`.
  useEffect(() => {
    const texto = busqueda.trim()

    if (!abierto || texto.length < MINIMO_BUSQUEDA) return

    const control = new AbortController()
    const espera = setTimeout(() => {
      void pedirSobre<Cliente[]>(`clients?q=${encodeURIComponent(texto)}&per_page=8&sort=company`, control.signal)
        .then((sobre) => { setClientes(sobre.data) })
        .catch((fallo: unknown) => {
          if (control.signal.aborted) return
          setErrorForm(fallo instanceof Error ? fallo.message : 'No se pudo buscar.')
        })
    }, 300)

    return () => { clearTimeout(espera); control.abort() }
  }, [abierto, busqueda])

  // Contactos del cliente elegido. `activos=1` porque encolarle a alguien dado de baja no tiene
  // sentido: el correo iría a una persona que ya no atiende esa cuenta.
  // Mismo reparto que arriba: el efecto solo pide, y vaciar la lista es del `onChange` del selector.
  useEffect(() => {
    if (clienteId === null) return

    const control = new AbortController()

    void pedirSobre<ContactoCompleto[]>(`clients/${clienteId}/contacts?activos=1`, control.signal)
      .then((sobre) => {
        setContactos(sobre.data)
        setContactoId(sobre.data.find((contacto) => contacto.email !== '')?.id ?? null)
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return
        setErrorForm(fallo instanceof Error ? fallo.message : 'No se pudieron leer los contactos.')
      })

    return () => { control.abort() }
  }, [clienteId])

  function limpiar (): void {
    setBusqueda('')
    setClientes([])
    setClienteId(null)
    setContactos([])
    setContactoId(null)
    setNota('')
    setErrorForm(null)
  }

  async function encolar (): Promise<void> {
    if (contactoId === null) {
      setErrorForm('Elegí a quién se le escribiría.')
      return
    }

    setGuardando(true)
    setErrorForm(null)

    const resultado = await escribirEnBff(RUTA, 'POST', {
      contact_id: contactoId,
      template: plantilla,
      ...(nota.trim() === '' ? {} : { payload: { nota: nota.trim() } })
    })

    setGuardando(false)

    if (!resultado.ok) {
      setErrorForm(resultado.mensaje)
      return
    }

    setAbierto(false)
    limpiar()
    onListo()
  }

  return (
    <Dialogo open={abierto} onOpenChange={(valor) => { setAbierto(valor); if (!valor) limpiar() }}>
      <DisparadorDialogo asChild>
        <Boton tamano="chico" variante="primario">Encolar un correo</Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo="Encolar un correo a mano"
        descripcion="Se anota la intención de escribirle a un contacto. Con el motor apagado —como está hoy— no sale ningún correo."
        ancho="medio"
      >
        <div className="flex flex-col gap-4">
          <Campo
            etiqueta={`Buscar ${nombrar('cliente')}`}
            ayuda={`Escribí al menos ${MINIMO_BUSQUEDA} letras del nombre.`}
          >
            {(props) => (
              <Entrada
                {...props}
                type="search"
                value={busqueda}
                placeholder="Nombre de la empresa"
                onChange={(evento) => {
                  const texto = evento.target.value
                  setBusqueda(texto)
                  setClienteId(null)
                  setContactos([])
                  setContactoId(null)
                  if (texto.trim().length < MINIMO_BUSQUEDA) setClientes([])
                }}
              />
            )}
          </Campo>

          {clientes.length > 0 && (
            <Campo etiqueta={nombrar('cliente')} requerido>
              {(props) => (
                <select
                  {...props}
                  className={cn(CLASES_CONTROL, 'h-9 text-sm')}
                  value={clienteId ?? ''}
                  onChange={(evento) => {
                    setContactos([])
                    setContactoId(null)
                    setClienteId(evento.target.value === '' ? null : Number(evento.target.value))
                  }}
                >
                  <option value="">Elegí uno</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>{cliente.company}</option>
                  ))}
                </select>
              )}
            </Campo>
          )}

          {clienteId !== null && (
            <Campo
              etiqueta="Contacto"
              requerido
              ayuda={contactos.length === 0 ? 'Ese cliente no tiene contactos activos.' : undefined}
            >
              {(props) => (
                <select
                  {...props}
                  className={cn(CLASES_CONTROL, 'h-9 text-sm')}
                  value={contactoId ?? ''}
                  disabled={contactos.length === 0}
                  onChange={(evento) => {
                    setContactoId(evento.target.value === '' ? null : Number(evento.target.value))
                  }}
                >
                  <option value="">Elegí uno</option>
                  {contactos.map((contacto) => (
                    // Sin correo no hay a dónde escribir: la API lo rechaza con 422, así que acá se
                    // muestra deshabilitado con el motivo en vez de dejar elegirlo y fallar después.
                    <option key={contacto.id} value={contacto.id} disabled={contacto.email === ''}>
                      {contacto.full_name}{contacto.email === '' ? ' — sin correo' : ` · ${contacto.email}`}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
          )}

          <Campo etiqueta="Motivo" requerido>
            {(props) => (
              <select
                {...props}
                className={cn(CLASES_CONTROL, 'h-9 text-sm')}
                value={plantilla}
                onChange={(evento) => { setPlantilla(evento.target.value) }}
              >
                {Object.entries(PLANTILLAS).map(([clave, etiqueta]) => (
                  <option key={clave} value={clave}>{etiqueta}</option>
                ))}
              </select>
            )}
          </Campo>

          <Campo etiqueta="Nota" ayuda={`Opcional, hasta ${TOPE_NOTA} caracteres. Es para el equipo, no para el contacto.`}>
            {(props) => (
              <AreaTexto
                {...props}
                value={nota}
                maxLength={TOPE_NOTA}
                onChange={(evento) => { setNota(evento.target.value) }}
              />
            )}
          </Campo>

          {errorForm !== null && (
            <p role="alert" className="text-texto-peligro text-sm">{errorForm}</p>
          )}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="secundario">Cancelar</Boton>
            </CerrarDialogo>
            <Boton
              variante="primario"
              cargando={guardando}
              disabled={contactoId === null}
              onClick={() => { void encolar() }}
            >
              Encolar
            </Boton>
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
