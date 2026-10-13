'use client'

import { useId, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Maximize2, MessageSquarePlus, X } from 'lucide-react'
import { Orbe } from '@/componentes/estado/Orbe'
import { Boton } from '@/componentes/formularios/Boton'
import { cn } from '@/lib/clases'
import { ASISTENTE } from '@/dominio/glosario'
import { configuracionDeOrbe, proyectoDeRutaPortal, type SujetoOrbe } from '@/dominio/orbe-sujeto'
import { hrefDePestanaDelOrbe, proyectoDeRutaPanel } from '@/dominio/orbe-contexto'
import { EVENTO_NUEVA_CONVERSACION } from '@/dominio/pantalla'
import { PESTANA_ORBE } from '@/dominio/orbe-contexto'
import { useFaseDeSujeto } from '@/dominio/fase-orbe'
import { useNombreDeProyecto } from './useNombreDeProyecto'
import { usePanelFlotante } from './usePanelFlotante'
import { usePanelRedimensionable } from './usePanelRedimensionable'

/** Importa el chat; compartido por la carga diferida y por la precarga al acercarse al boton. */
const importarChat = async (): Promise<typeof import('./ChatOrbe')['ChatOrbe']> => (await import('./ChatOrbe')).ChatOrbe

// El chat (con el agente, el dictado y el texto enriquecido) pesa bastante y solo se usa al abrir el
// orbe: sale del bundle inicial de todo el panel. Se precarga al acercarse al boton para que abrir no espere.
const ChatOrbe = dynamic(importarChat, {
  ssr: false,
  loading: () => <p role="status" className="text-texto-tenue p-4 text-sm">Cargando {ASISTENTE}…</p>
})

/**
 * Thinking Orb como orbe flotante: se pregunta desde cualquier pantalla del panel, sin salir de ella.
 *
 * Lo monta el armazon —`app/(panel)/layout.tsx`, al lado del `Latido`— y no una pantalla: su asunto
 * es todo el panel. Que viva ahi es ademas lo que hace que el chat **sobreviva a navegar**: el
 * armazon no se desmonta al cambiar de ruta, asi que el panel abierto sigue abierto y la
 * conversacion sigue en pantalla mientras la vista de atras cambia. Sin eso, el evento `navegar`
 * cerraria el chat justo cuando termina de explicar a donde lleva.
 *
 * === POR QUE NO ES UN CAJON NI UN DIALOGO ===
 *
 * `Dialogo` y `Cajon` son modales: Radix pone `inert` en todo lo de atras, asi que la pantalla
 * dejaria de leerse mientras el chat esta abierto —justo lo contrario de para que existe el orbe— y
 * el detalle de una Tarea abriria un `Dialog` sobre otro `Dialog`, con el foco peleando entre los
 * dos. Este panel es una caja flotante comun: lo de atras sigue vivo.
 *
 * Esto es tambien lo que le pone techo al tamaño: ver `dominio/tamano-chat.ts`. Un panel que ocupa
 * la pantalla entera dejo de ser flotante y se convirtio en el modal que este componente decidio no
 * ser, aunque no tenga `inert` puesto.
 *
 * === POR QUE EL ORBE ESTA QUIETO HASTA QUE LO TOCAS ===
 *
 * La regla del sistema de diseño prohibe animaciones infinitas en elementos SIEMPRE visibles, y este
 * boton lo esta en todo el panel. En reposo va el orbe quieto; se anima al pasar por encima, al
 * enfocarlo con el teclado y mientras el agente espera una decision con el panel cerrado (esa fase se conserva al cerrar y caduca sola). La consulta (SSE) se corta al cerrar el chat, asi que su fase `generando` no sobrevive. Con el panel abierto vuelve al reposo.
 *
 * === POR QUE EL BOTON LLEVA EL GRADIENTE DE MARCA ===
 *
 * Porque antes no llevaba color: era `bg-superficie-flotante` con `border-linea`, o sea el mismo
 * papel que la tarjeta de atras separado por una linea de tinta al 14%. Eso da 1.1:1 contra la
 * pagina: el boton no se veia, se adivinaba por la sombra.
 *
 * El gradiente de marca es el unico relleno del sistema que no cambia con el tema, asi que el mismo
 * disco resuelve claro y oscuro. Medido contra las dos paginas (`#FBFBEA` y `#161715`), el borde del
 * control cumple el 3:1 de la pauta 1.4.11 en mas de la mitad del recorrido en AMBOS temas —el azul
 * da 5.81:1 sobre claro y el verde 13.27:1 sobre oscuro—, que es lo que hace que el control se
 * identifique mire quien mire. Encima va tinta y nunca blanco (`text-gradiente-marca-contenido`): el
 * tramo verde deja el blanco en 1.35:1.
 *
 * `hover:brightness-95` y no un segundo gradiente: es el mismo gesto de hover que ya usan las
 * variantes rellenas de `Boton`.
 *
 * === POR QUE EL TAMAÑO SE ARRASTRA DESDE LA ESQUINA DE ARRIBA A LA IZQUIERDA ===
 *
 * El panel esta anclado abajo a la derecha (`bottom-24 right-4`) y ese anclaje no se mueve: el orbe
 * tiene que quedar siempre debajo del panel que abre. Con dos lados clavados, la unica esquina que
 * puede moverse es la opuesta, asi que tirar hacia arriba y hacia la izquierda es lo unico que
 * agranda. Por eso el delta se suma invertido: mientras el puntero retrocede en X el ancho crece.
 *
 * El arrastre usa `setPointerCapture` y no listeners en `document`. Con la captura puesta, el
 * navegador sigue mandando `pointermove` y `pointerup` al tirador aunque el puntero se vaya fuera de
 * la ventana o pase por encima de un iframe, que es exactamente lo que pasa al agrandar rapido. Sin
 * ella el arrastre se corta a mitad de camino y el panel queda en un tamaño que nadie pidio.
 *
 * El tirador es un `button` de verdad y no un `div` con `onPointerDown` porque redimensionar no
 * puede ser una funcion exclusiva del raton: con el foco puesto, las flechas mueven la esquina de a
 * `PASO_TAMANO_CHAT` pixeles en la misma direccion que la mano.
 *
 * === ATAJO, ESTADO Y CONTEXTO ===
 *
 * Cmd/Ctrl+J abre y cierra el panel desde cualquier parte (la K es de la paleta de comandos). El
 * comportamiento de abrir, cerrar, Escape y foco vive en `usePanelFlotante`, y el tamaño en
 * `usePanelRedimensionable`. En el equipo, dentro de la ficha de un Proyecto el panel sigue en el
 * hilo global y ofrece «Continuar en el hilo de …» en vez de cambiar de hilo en silencio. Con el
 * agente esperando una decisión y el panel cerrado, el botón lleva un punto de aviso.
 *
 * === EL MISMO ORBE EN EL PORTAL ===
 *
 * Con `sujeto="contacto"` lo monta el armazon del portal (`app/portal/(dentro)/layout.tsx`) y es el
 * Thinking Orb de solo lectura del cliente: rutas `portal/ia/*`, sin agente ni tarjetas, dictado solo
 * del navegador. Dentro de la ficha de un Proyecto la conversacion es de ese Proyecto: el id sale de
 * la ruta y viaja como `proyecto_id`. Todo lo que cambia esta en `dominio/orbe-sujeto.ts`.
 *
 * @param sujeto de quien es la sesion; por defecto el equipo
 */
export function OrbeChatIA ({ sujeto = 'staff' }: { sujeto?: SujetoOrbe } = {}): ReactElement {
  const configuracion = configuracionDeOrbe(sujeto)
  const ruta = usePathname()
  const parametros = useSearchParams()
  const router = useRouter()
  const idPanel = useId()
  const panel = useRef<HTMLDivElement>(null)
  const [encima, setEncima] = useState(false)
  const { abierto, montado, saliendo, alTerminarAnimacion, apertura, actaPedida, botonRef, alternar, cerrar } = usePanelFlotante(panel, ruta)
  const { tamanoVisible, propsTirador } = usePanelRedimensionable(panel)
  const fase = useFaseDeSujeto(configuracion.sujeto)

  // El contacto del portal siempre conversa en el Proyecto de la ruta. El equipo, en el hilo global
  // salvo que elija continuar en el del Proyecto que tiene abierto.
  const proyectoRuta = sujeto === 'contacto' ? proyectoDeRutaPortal(ruta) : proyectoDeRutaPanel(ruta)
  const [hiloElegido, setHiloElegido] = useState<number | undefined>(undefined)
  const proyectoId = sujeto === 'contacto' ? proyectoRuta : (hiloElegido !== undefined && hiloElegido === proyectoRuta ? hiloElegido : undefined)
  const nombreProyecto = useNombreDeProyecto(sujeto === 'staff' ? proyectoRuta : undefined, abierto)
  const puedeAmpliar = sujeto === 'staff' && proyectoRuta !== undefined && !(parametros.get('tab') === PESTANA_ORBE && proyectoRuta === proyectoDeRutaPanel(ruta) && /^\/(proyectos|espacios)\/\d+\/?$/.test(ruta))

  /** Lleva el hilo al Proyecto abierto en su pestaña del Orbe, que tiene todo el ancho. */
  const ampliar = (): void => {
    if (proyectoRuta === undefined) return
    cerrar()
    router.push(hrefDePestanaDelOrbe(proyectoRuta))
  }

  return (
    <>
      {montado && (
        <div
          ref={panel}
          id={idPanel}
          role="dialog"
          aria-label={ASISTENTE}
          onAnimationEnd={alTerminarAnimacion}
          // El tamaño va en variables y no en `width`/`height` en linea: el estilo en linea le
          // ganaria a la clase que en movil lo lleva al ancho completo. Durante un arrastre las
          // variables se escriben directo (ver `usePanelRedimensionable`).
          style={{ '--ancho-chat': `${tamanoVisible.ancho}px`, '--alto-chat': `${tamanoVisible.alto}px` } as CSSProperties}
          className={cn(
            saliendo ? 'animate-salir-abajo pointer-events-none' : 'animate-entrar-abajo',
            // `contain: layout paint` aísla el panel: lo que pasa dentro (streaming, orbe animado) no
            // obliga al navegador a recalcular ni repintar la página de atrás.
            'border-linea bg-superficie-flotante shadow-flotante rounded-tarjeta fixed bottom-[calc(6rem_+_var(--barra-inferior,0px))] right-4 z-superposicion flex h-(--alto-chat) max-h-[calc(100dvh_-_7rem_-_var(--barra-inferior,0px))] w-(--ancho-chat) max-w-[calc(100vw-2rem)] flex-col gap-3 border p-3 [contain:layout_paint]',
            // Por debajo de 640 px es una hoja inferior a pantalla completa.
            'max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]'
          )}
        >
          {/* El tirador va dentro del `padding` del panel y no encima del borde: pegado al canto
              taparia el redondeo de la tarjeta. Se oculta en pantallas tactiles y en la hoja a
              pantalla completa, donde no hay nada que redimensionar. */}
          <button
            type="button"
            {...propsTirador}
            aria-label={`Redimensionar el chat de ${ASISTENTE}. Flechas izquierda y arriba para agrandar, derecha y abajo para achicar`}
            className="text-texto-tenue hover:bg-hover hover:text-texto focus-visible:outline-acento focus-visible:outline-2 focus-visible:outline-offset-2 rounded-chico absolute left-1 top-1 flex size-5 cursor-nwse-resize touch-none items-center justify-center max-sm:hidden [@media(pointer:coarse)]:hidden"
          >
            {/* Dos trazos en diagonal, el gesto que ya usa cualquier esquina redimensionable.
                `aria-hidden` porque lo que hay que anunciar es la etiqueta del boton, no el dibujo. */}
            <svg viewBox="0 0 10 10" aria-hidden="true" className="size-3 fill-none stroke-current" strokeWidth="1.4" strokeLinecap="round">
              <path d="M1 5 L5 1" />
              <path d="M1 9 L9 1" />
            </svg>
          </button>

          <header className="flex items-center justify-between gap-2 sm:pl-6 [@media(pointer:coarse)]:pl-0">
            <div className="flex min-w-0 flex-col">
              <p className="text-texto text-sm font-semibold">{ASISTENTE}</p>
              <p className="text-texto-sutil text-xs">{configuracion.textos.subtitulo}</p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Boton
                soloIcono
                variante="sutil"
                tamano="chico"
                aria-label="Nueva conversación"
                title="Nueva conversación"
                onClick={() => { window.dispatchEvent(new Event(EVENTO_NUEVA_CONVERSACION)) }}
              >
                <MessageSquarePlus aria-hidden="true" className="size-4" />
              </Boton>
              {puedeAmpliar && (
                <Boton soloIcono variante="sutil" tamano="chico" aria-label="Ampliar a la pestaña del proyecto" title="Ampliar a la pestaña del proyecto" onClick={ampliar}>
                  <Maximize2 aria-hidden="true" className="size-4" />
                </Boton>
              )}
              <Boton
                soloIcono
                variante="sutil"
                tamano="chico"
                data-rastreo="orbe.cerrar"
                aria-label={`Cerrar ${ASISTENTE}`}
                title="Cerrar (Esc)"
                onClick={cerrar}
              >
                <X aria-hidden="true" className="size-4" />
              </Boton>
            </div>
          </header>

          {sujeto === 'staff' && proyectoRuta !== undefined && (
            <div className="flex flex-wrap items-center gap-2">
              {proyectoId === undefined
                ? (
                  <Boton tamano="chico" variante="secundario" className="max-w-full" title="Cambia a la conversación de este proyecto; la general queda guardada" onClick={() => { setHiloElegido(proyectoRuta) }}>
                    <span className="truncate">Continuar en el hilo de {nombreProyecto ?? 'este proyecto'}</span>
                  </Boton>
                  )
                : (
                  <>
                    <p className="text-texto-tenue min-w-0 truncate text-xs">Hilo de <span className="text-texto font-medium">{nombreProyecto ?? 'este proyecto'}</span></p>
                    <Boton tamano="chico" variante="sutil" title="Vuelve a la conversación general" onClick={() => { setHiloElegido(undefined) }}>Volver al hilo global</Boton>
                  </>
                  )}
            </div>
          )}

          <ChatOrbe
            key={apertura}
            desplazable
            sujeto={sujeto}
            proyecto={proyectoId === undefined ? undefined : { id: proyectoId, name: sujeto === 'staff' ? (nombreProyecto ?? 'este proyecto') : undefined }}
            actaPedida={actaPedida}
          />
        </div>
      )}

      <button
        ref={botonRef}
        type="button"
        data-rastreo="orbe.alternar"
        onClick={alternar}
        onPointerEnter={() => { setEncima(true); void importarChat() }}
        onPointerLeave={() => setEncima(false)}
        onFocus={() => { setEncima(true); void importarChat() }}
        onBlur={() => setEncima(false)}
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        aria-keyshortcuts="Control+J Meta+J"
        aria-label={abierto ? `Cerrar ${ASISTENTE}` : fase === 'esperando' ? `Preguntarle a ${ASISTENTE}. Espera tu respuesta` : `Preguntarle a ${ASISTENTE}`}
        title={abierto ? 'Cerrar (Esc)' : 'Abrir (Ctrl+J)'}
        className={cn(
          'bg-gradiente-marca text-gradiente-marca-contenido shadow-flotante fixed bottom-[calc(1.5rem_+_var(--barra-inferior,0px))] right-4 z-superposicion inline-flex size-14 items-center justify-center rounded-full transition-[transform,filter] duration-rapida ease-neo hover:brightness-95 active:scale-[0.96]',
          // En movil el panel abierto ocupa la pantalla entera y el boton le taparia el campo: se
          // cierra con el icono de su cabecera.
          abierto && 'max-sm:hidden'
        )}
      >
        {/* Con el chat abierto el botón queda en reposo (el chat ya muestra el estado y el halo animado
            cuesta); cerrado, piensa al pasar por encima o si el agente espera una decisión. */}
        <Orbe tamano="medio" estado={!abierto && (encima || fase === 'esperando') ? 'thinking' : undefined} />
        {!abierto && fase === 'esperando' && (
          // Un punto quieto: el botón está siempre a la vista y no puede llevar otra animación
          // infinita. El texto del aviso va en el `aria-label` del botón.
          <span aria-hidden="true" className="bg-relleno-aviso border-superficie absolute -right-0.5 -top-0.5 size-4 rounded-full border-2" />
        )}
      </button>
    </>
  )
}
