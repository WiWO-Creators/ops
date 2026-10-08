'use client'

import { Lock, MessageCircleQuestion, MessageSquareText } from 'lucide-react'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { EditorRico } from '@/componentes/formularios/EditorRico'
import { Contenido } from '@/componentes/presentadores/Contenido'
import { ContenidoSelector, DisparadorSelector, Opcion, Selector } from '@/componentes/formularios/Selector'
import {
  BuscadorMenu, ContenidoMenu, DisparadorMenu, ItemMenu, MenuContextual, SinResultadosMenu
} from '@/componentes/superposiciones/MenuContextual'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { EstadoLookup, RespuestaPredefinida } from '@/datos/recursos'
import { normalizar } from '@/dominio/busqueda'
import { esHtml, htmlVacio, textoPlano } from '@/dominio/texto-rico'
import { cuerpoConArchivos } from '@/dominio/ticket-adjuntos'
import { contadorDeLargo, topeDeMensaje } from '@/dominio/ticket-limites'
import {
  almacenDeSesion,
  avisoSinRespuesta,
  claveDeBorrador,
  cuerpoDeRespuesta,
  estadoInicialAlResponder,
  estadosParaResponder,
  falloDeTicket,
  guardarBorrador,
  insertarPredefinida,
  leerBorrador,
  nombreDelTicket,
  rutaDeTicket,
  type FuenteDeTicket,
  type NombreDeTicket,
  type TicketVista
} from '@/dominio/ticket-vista'
import { ArchivosParaAdjuntar } from './ArchivosParaAdjuntar'
import { cargarPredefinidas } from './carga-de-ticket'
import { useListaPerezosa, type ListaPerezosa } from './useListaPerezosa'

/** Centinela de «no cambiar el estado al responder». Radix no admite un `value` vacio. */
const SIN_CAMBIO = 'sin-cambio'

/**
 * La caja para sumar una respuesta, o el aviso de por que no se puede.
 *
 * Se monta con `key` por ticket: cambiar de ticket es una caja nueva, y el borrador de uno no puede
 * aparecer en otro. Lo escrito se guarda en `sessionStorage` (`ticket-borrador:{sujeto}:{id}`) a
 * cada tecla, asi cerrar el modal por error, recargar o ir a mirar otra cosa no lo pierde; se borra
 * cuando la API confirma el envio.
 *
 * Los archivos se eligen aca y viajan **con** el mensaje (`multipart/form-data`, ver
 * `cuerpoConArchivos`); sin archivos el envio es JSON, igual que antes. No entran al borrador: se
 * conservan mientras la caja siga montada y se vacian cuando la API confirma.
 *
 * Sin estado optimista: el mensaje aparece en el hilo cuando la API lo confirmo. Un rechazo deja lo
 * escrito intacto, lo explica por su codigo (`falloDeTicket`) y pide la ficha de nuevo: si la regla
 * cambio, la caja se vuelve el aviso que corresponde, con lo escrito todavia a la vista.
 *
 * `Ctrl`/`Cmd` + `Enter` envia. El foco entra al campo al abrir el ticket (sin mover el scroll), que
 * es lo que se viene a hacer a un ticket la mayoria de las veces.
 */
export function CajaDeRespuesta ({
  ticket,
  fuente,
  estados,
  onRespondido,
  onRechazado
}: {
  ticket: TicketVista
  fuente: FuenteDeTicket
  /** Catalogo de estados si quien mira puede cambiarlos. Vacio = no se ofrece cambio. */
  estados: EstadoLookup[]
  /** La API confirmo: recibe su `data` para mostrarla aunque la recarga falle. */
  onRespondido: (datos: unknown) => void
  /** La API rechazo: la ficha se vuelve a pedir. */
  onRechazado: () => void
}): ReactElement {
  const clave = claveDeBorrador(fuente, ticket.id)
  const idCampo = `respuesta-${ticket.id}`
  const ofrecidos = estadosParaResponder(estados, ticket.estado)
  const tope = topeDeMensaje(fuente.sujeto)

  // HTML del editor (o texto plano de un borrador viejo, que el editor convierte al abrirlo).
  const [mensaje, setMensaje] = useState(() => leerBorrador(almacenDeSesion(), clave))
  // Cambia al vaciar o insertar una predefinida: el editor no es controlado y se remonta con `key`.
  const [versionDelEditor, setVersionDelEditor] = useState(0)
  const [elegido, setElegido] = useState<string | null>(null)
  const [archivos, setArchivos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  // Segundos que pidio esperar un 429; mientras no es `null` el envio queda bloqueado.
  const [espera, setEspera] = useState<number | null>(null)
  const enviandoAhora = useRef(false)

  // El tope se mide sobre el texto visible y no sobre el marcado, que la persona no escribio.
  const largo = textoPlano(mensaje).length
  const excedido = tope !== undefined && largo > tope
  const contador = tope === undefined ? null : contadorDeLargo(largo, tope)

  // El estado propuesto sale del estado del ticket mientras la persona no elija otro: si el hilo en
  // vivo trae el ticket cambiado, la propuesta se mueve con el. Lo que ya no se ofrece cae a «sin
  // cambiar» en vez de dejar el selector en blanco.
  const propuesto = estadoInicialAlResponder(ticket.estado, ofrecidos)
  const valorPropuesto = propuesto === null ? SIN_CAMBIO : String(propuesto)
  const valorElegido = elegido !== null && (elegido === SIN_CAMBIO || ofrecidos.some((e) => String(e.id) === elegido))
    ? elegido
    : valorPropuesto

  useEffect(() => {
    if (espera === null) return

    const id = window.setTimeout(() => { setEspera(null) }, espera * 1000)

    return () => { window.clearTimeout(id) }
  }, [espera])

  /**
   * Guarda en pantalla y en el borrador.
   *
   * No recorta: cortar HTML por la mitad deja marcado roto. Si una predefinida pasa el tope, el
   * contador lo marca y el envio queda bloqueado hasta que se acorte.
   */
  function escribir (html: string): void {
    setMensaje(html)
    guardarBorrador(almacenDeSesion(), clave, html)
  }

  /**
   * Manda la respuesta. Nunca lanza: el error del contrato se lee debajo de la caja.
   *
   * La guarda es una ref y no el estado: dos `submit` en el mismo tic (doble clic, `Enter` repetido)
   * verian los dos `enviando === false`, porque el estado recien cambia en el render siguiente.
   */
  async function responder (): Promise<void> {
    if (enviandoAhora.current || espera !== null || excedido) return

    const cuerpo = cuerpoDeRespuesta(mensaje, valorElegido === SIN_CAMBIO ? null : Number(valorElegido), true)

    if (cuerpo === null) return

    enviandoAhora.current = true
    setEnviando(true)
    setFallo(null)

    const resultado = await escribirEnBff<unknown>(
      rutaDeTicket(fuente.responder, ticket.id),
      'POST',
      cuerpoConArchivos(cuerpo, archivos)
    )

    enviandoAhora.current = false
    setEnviando(false)

    if (!resultado.ok) {
      const explicado = falloDeTicket(resultado, 'responder')

      setFallo(explicado.texto)
      if (explicado.esperarSegundos !== null) setEspera(explicado.esperarSegundos)
      if (resultado.estado === 409) onRechazado()

      return
    }

    escribir('')
    setVersionDelEditor((version) => version + 1)
    setElegido(null)
    setArchivos([])
    onRespondido(resultado.datos)
  }

  if (!ticket.respuesta.permitida) {
    return <SinRespuesta ticket={ticket} nombre={nombreDelTicket(fuente)} escrito={mensaje} fallo={fallo} />
  }

  const vacio = htmlVacio(mensaje)

  return (
    <form
      className="border-linea-suave flex flex-col gap-3 border-t pt-4"
      aria-label="Responder"
      onSubmit={(evento) => {
        evento.preventDefault()
        void responder()
      }}
    >
      <div className="flex items-end justify-between gap-2">
        <label htmlFor={idCampo} className="text-texto-tenue text-sm font-semibold">
          Tu respuesta
        </label>
        {fuente.predefinidas !== null && (
          <MenuPredefinidas ruta={fuente.predefinidas} onElegir={(p) => {
            escribir(insertarPredefinida(mensaje, p.message))
            setVersionDelEditor((version) => version + 1)
          }} />
        )}
      </div>
      <EditorRico
        key={versionDelEditor}
        id={idCampo}
        etiqueta="Tu respuesta"
        valorInicial={mensaje}
        maxCaracteres={tope}
        placeholder="Escribe tu respuesta."
        aria-describedby={`${idCampo}-atajo`}
        aria-invalid={fallo !== null || undefined}
        autoenfocar
        onCambio={escribir}
        onEnviar={() => { void responder() }}
      />

      <ArchivosParaAdjuntar archivos={archivos} onCambiar={setArchivos} deshabilitado={enviando} />

      {fallo !== null && <AvisoEnLinea variante="error" mensaje={fallo} className="text-sm" />}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <p id={`${idCampo}-atajo`} className="text-texto-sutil mr-auto text-xs">
          Ctrl o ⌘ + Enter para enviar
        </p>
        {contador !== null && <p className="text-texto-tenue text-xs" aria-live="polite">{contador}</p>}
        {ofrecidos.length > 0 && (
          <Selector value={valorElegido} onValueChange={setElegido}>
            <DisparadorSelector aria-label="Estado al responder" className="w-auto min-w-48" />
            <ContenidoSelector>
              <Opcion value={SIN_CAMBIO}>Sin cambiar el estado</Opcion>
              {ofrecidos.map((opcion) => (
                <Opcion key={opcion.id} value={String(opcion.id)}>Dejar en {opcion.name}</Opcion>
              ))}
            </ContenidoSelector>
          </Selector>
        )}
        <Boton type="submit" variante="primario" cargando={enviando} disabled={vacio || excedido || espera !== null}>
          Responder
        </Boton>
      </div>
    </form>
  )
}

/**
 * El aviso de por que no se puede responder.
 *
 * Si habia algo escrito —la regla cambio mientras se escribia: el equipo cerro el ticket—, se deja a
 * la vista para copiarlo. El aviso de error decia «tu mensaje sigue aquí» y tiene que ser cierto.
 */
function SinRespuesta ({ ticket, nombre, escrito, fallo }: { ticket: TicketVista, nombre: NombreDeTicket, escrito: string, fallo: string | null }): ReactElement {
  const cerrado = ticket.respuesta.motivo === 'cerrado'
  const Icono = cerrado ? Lock : MessageCircleQuestion

  return (
    <section className="flex flex-col gap-2">
      <div
        role="status"
        className="border-linea-suave bg-superficie-hundida rounded-tarjeta text-texto-tenue flex items-start gap-3 border p-4 text-sm"
      >
        <Icono size={16} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0" />
        <p className="text-pretty">{avisoSinRespuesta(ticket.respuesta.motivo, nombre)}</p>
      </div>
      {fallo !== null && <AvisoEnLinea variante="error" mensaje={fallo} className="text-sm" />}
      {!htmlVacio(escrito) && (
        <>
          <p id={`sin-enviar-${ticket.id}`} className="text-texto-tenue text-sm font-semibold">
            Lo que alcanzaste a escribir
          </p>
          <Contenido
            html={esHtml(escrito) ? escrito : null}
            texto={escrito}
            className="border-control-borde bg-superficie-hundida text-texto-tenue rounded-chico border px-3 py-2 text-sm"
          />
        </>
      )}
    </section>
  )
}

type Predefinidas = ListaPerezosa<RespuestaPredefinida>

/**
 * Menu para insertar una respuesta predefinida en la caja.
 *
 * Se piden al abrirlo, una vez por pestaña. Insertar suma al final de lo escrito, no lo reemplaza.
 */
function MenuPredefinidas ({ ruta, onElegir }: { ruta: string, onElegir: (predefinida: RespuestaPredefinida) => void }): ReactElement {
  const { estado: predefinidas, pedir } = useListaPerezosa(() => cargarPredefinidas(ruta), 'No se pudieron cargar.')
  const [busqueda, setBusqueda] = useState('')

  /** Pide la lista al abrir por primera vez, o de nuevo si la anterior fallo. */
  function alAbrir (abierto: boolean): void {
    if (!abierto) {
      setBusqueda('')
      return
    }

    pedir()
  }

  return (
    <MenuContextual onOpenChange={alAbrir}>
      <DisparadorMenu asChild>
        <Boton variante="sutil" tamano="chico">
          <MessageSquareText size={14} strokeWidth={2} aria-hidden="true" />
          Respuesta predefinida
        </Boton>
      </DisparadorMenu>
      <ContenidoMenu align="end" className="w-80">
        <CuerpoPredefinidas predefinidas={predefinidas} busqueda={busqueda} onBuscar={setBusqueda} onElegir={onElegir} />
      </ContenidoMenu>
    </MenuContextual>
  )
}

/** El cuerpo del menu de predefinidas segun en que va la carga. */
function CuerpoPredefinidas ({
  predefinidas,
  busqueda,
  onBuscar,
  onElegir
}: {
  predefinidas: Predefinidas
  busqueda: string
  onBuscar: (valor: string) => void
  onElegir: (predefinida: RespuestaPredefinida) => void
}): ReactElement {
  if (predefinidas.fase === 'error') {
    return <AvisoEnLinea variante="error" mensaje={predefinidas.mensaje} className="px-2.5 py-2 text-sm" />
  }

  if (predefinidas.fase !== 'listo') {
    return <p role="status" className="text-texto-sutil px-2.5 py-2 text-sm">Cargando respuestas…</p>
  }

  if (predefinidas.lista.length === 0) {
    return <p className="text-texto-sutil px-2.5 py-2 text-sm">No hay respuestas predefinidas.</p>
  }

  const buscada = normalizar(busqueda.trim())
  const visibles = buscada === ''
    ? predefinidas.lista
    : predefinidas.lista.filter((p) => normalizar(p.name).includes(buscada))

  return (
    <>
      <BuscadorMenu valor={busqueda} onCambiar={onBuscar} placeholder="Buscar respuesta…" />
      <div className="max-h-64 overflow-y-auto">
        {visibles.map((predefinida) => (
          <ItemMenu key={predefinida.id} onSelect={() => { onElegir(predefinida) }}>
            <span className="truncate">{predefinida.name}</span>
          </ItemMenu>
        ))}
        {visibles.length === 0 && <SinResultadosMenu />}
      </div>
    </>
  )
}
