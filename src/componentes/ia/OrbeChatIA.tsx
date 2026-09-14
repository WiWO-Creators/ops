'use client'

import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as EventoPuntero, type KeyboardEvent as EventoTeclado, type ReactElement } from 'react'
import { Orbe } from '@/componentes/estado/Orbe'
import { ASISTENTE } from '@/dominio/glosario'
import {
  acotarTamanoChat,
  almacenamientoDelNavegador,
  guardarTamanoChat,
  leerTamanoChatGuardado,
  PASO_TAMANO_CHAT,
  type TamanoChat,
  type VentanaVisible
} from '@/dominio/tamano-chat'
import { ChatOrbe } from './ChatOrbe'

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
 * enfocarlo con el teclado y mientras el panel esta abierto, que son estados que terminan.
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
 */
export function OrbeChatIA (): ReactElement {
  const [abierto, setAbierto] = useState(false)
  const [encima, setEncima] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const idPanel = useId()

  // El tamaño que la persona eligio, acotado solo a los limites fijos. Lo que se pinta sale de
  // acotarlo ademas contra `ventana`, y esa segunda cuenta NO se guarda: achicar un rato la ventana
  // no tiene por que borrar para siempre la preferencia de quien trabaja en un monitor grande.
  //
  // Se lee en el inicializador perezoso y no en un efecto por dos motivos. El primero es que un
  // `setState` sincrono dentro de un efecto encadena un render de mas —la regla de lint lo corta—.
  // El segundo es que no hay riesgo de hidratacion: el panel solo existe con `abierto` en `true`, y
  // eso empieza en `false`, asi que el servidor y el cliente pintan lo mismo —nada— mientras el
  // tamaño se resuelve. En el servidor `almacenamientoDelNavegador()` devuelve `null` y sale el
  // defecto, que es exactamente lo que corresponde.
  const [tamano, setTamano] = useState<TamanoChat>(() => leerTamanoChatGuardado(almacenamientoDelNavegador(), null))

  // `null` hasta que haya un `window` que medir. En el render del servidor y en el primero del
  // cliente vale `null` a proposito: leer `window.innerWidth` ahi daria una hidratacion distinta a
  // la del HTML que ya se mando.
  const [ventana, setVentana] = useState<VentanaVisible | null>(null)

  const arrastre = useRef<{ x: number, y: number, ancho: number, alto: number } | null>(null)

  // Espejo de `tamano` para leerlo al soltar el puntero. El handler de `pointerup` se cierra sobre
  // el `tamano` del render en el que se creo, y durante un arrastre hay un render por cada
  // `pointermove`: sin el ref se guardaria un tamaño de hace un fotograma.
  const tamanoElegido = useRef<TamanoChat>(tamano)

  const tamanoVisible = acotarTamanoChat(tamano, ventana)

  // Cerrar con Escape es lo que espera cualquiera que abra algo flotante, y aca no lo da Radix.
  useEffect(() => {
    if (!abierto) return

    const alTeclado = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') setAbierto(false)
    }

    document.addEventListener('keydown', alTeclado)

    return () => { document.removeEventListener('keydown', alTeclado) }
  }, [abierto])

  // Cuanto mide la ventana, y mantenerlo al dia. Es el unico dato de este componente que viene de
  // afuera de React y que cambia solo, asi que es el unico que un efecto tiene que sincronizar.
  //
  // Si la ventana se achica hasta que el tamaño elegido ya no entra, `acotarTamanoChat` lo recorta
  // en el render siguiente y el panel nunca se sale por el costado. Lo guardado queda intacto: en
  // cuanto vuelva la pantalla grande, vuelve el tamaño que la persona habia pedido.
  useEffect(() => {
    const medir = (): void => { setVentana({ ancho: window.innerWidth, alto: window.innerHeight }) }

    medir()
    window.addEventListener('resize', medir)

    return () => { window.removeEventListener('resize', medir) }
  }, [])

  // El foco va al campo, no al panel: quien abre el chat es para escribir.
  //
  // El campo no existe todavia cuando el panel se monta —el chat puede estar leyendo el hilo
  // guardado—, asi que enfocarlo en el acto no toma nada. El observador espera a que aparezca y se
  // desconecta con el primero que encuentre.
  useEffect(() => {
    const caja = panel.current
    if (!abierto || caja === null) return

    const enfocar = (): boolean => {
      const campo = caja.querySelector('textarea')
      campo?.focus()

      return campo !== null
    }

    if (enfocar()) return

    const observador = new MutationObserver(() => { if (enfocar()) observador.disconnect() })
    observador.observe(caja, { childList: true, subtree: true })

    return () => { observador.disconnect() }
  }, [abierto])

  /** Aplica un tamaño pedido, ya acotado a los limites y a la ventana de este momento. */
  const redimensionar = useCallback((pedido: TamanoChat): TamanoChat => {
    const acotado = acotarTamanoChat(pedido, ventana)
    tamanoElegido.current = acotado
    setTamano(acotado)

    return acotado
  }, [ventana])

  const alBajarPuntero = (evento: EventoPuntero<HTMLButtonElement>): void => {
    const caja = panel.current

    // Solo el boton principal. Con el secundario el navegador abre su menu y el `pointerup` nunca
    // llega, asi que el arrastre quedaria pegado al puntero hasta el proximo clic.
    if (evento.button !== 0 || caja === null) return

    // Sin esto el gesto arranca una seleccion de texto y el panel se arrastra con medio chat pintado
    // de azul.
    evento.preventDefault()
    evento.currentTarget.setPointerCapture(evento.pointerId)
    arrastre.current = { x: evento.clientX, y: evento.clientY, ancho: caja.offsetWidth, alto: caja.offsetHeight }
  }

  const alMoverPuntero = (evento: EventoPuntero<HTMLButtonElement>): void => {
    const inicio = arrastre.current
    if (inicio === null) return

    redimensionar({
      ancho: inicio.ancho + (inicio.x - evento.clientX),
      alto: inicio.alto + (inicio.y - evento.clientY)
    })
  }

  const alTerminarPuntero = (evento: EventoPuntero<HTMLButtonElement>): void => {
    if (arrastre.current === null) return

    arrastre.current = null

    // Se guarda al soltar y no en cada `pointermove`: un arrastre de dos segundos son cientos de
    // eventos, y `localStorage` escribe sincrono en el hilo principal.
    guardarTamanoChat(almacenamientoDelNavegador(), tamanoElegido.current)

    if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
      evento.currentTarget.releasePointerCapture(evento.pointerId)
    }
  }

  const alTecladoDelTirador = (evento: EventoTeclado<HTMLButtonElement>): void => {
    // Arriba e izquierda agrandan porque son las direcciones en las que la esquina se aleja del
    // anclaje: la misma regla que con el raton, para que el gesto se aprenda una sola vez.
    const pasos: Record<string, TamanoChat> = {
      ArrowLeft: { ancho: PASO_TAMANO_CHAT, alto: 0 },
      ArrowRight: { ancho: -PASO_TAMANO_CHAT, alto: 0 },
      ArrowUp: { ancho: 0, alto: PASO_TAMANO_CHAT },
      ArrowDown: { ancho: 0, alto: -PASO_TAMANO_CHAT }
    }

    const paso = pasos[evento.key]
    if (paso === undefined) return

    // Las flechas hacen scroll de la pagina de atras si no se las corta, y la pagina de atras sigue
    // viva justamente porque este panel no es un modal.
    evento.preventDefault()

    const aplicado = redimensionar({
      ancho: tamanoVisible.ancho + paso.ancho,
      alto: tamanoVisible.alto + paso.alto
    })

    guardarTamanoChat(almacenamientoDelNavegador(), aplicado)
  }

  return (
    <>
      {abierto && (
        <div
          ref={panel}
          id={idPanel}
          role="dialog"
          aria-label={ASISTENTE}
          style={{ width: `${tamanoVisible.ancho}px`, height: `${tamanoVisible.alto}px` }}
          className="border-linea bg-superficie-flotante shadow-flotante rounded-tarjeta animate-entrar-abajo fixed bottom-24 right-4 z-50 flex max-h-[calc(100vh-7rem)] max-w-[calc(100vw-2rem)] flex-col gap-3 border p-3"
        >
          {/* El tirador va dentro del `padding` del panel y no encima del borde: pegado al canto
              taparia el redondeo de la tarjeta y, en el tema oscuro, se leeria como un defecto del
              borde en vez de como un control. */}
          <button
            type="button"
            onPointerDown={alBajarPuntero}
            onPointerMove={alMoverPuntero}
            onPointerUp={alTerminarPuntero}
            onPointerCancel={alTerminarPuntero}
            onKeyDown={alTecladoDelTirador}
            aria-label={`Redimensionar el chat de ${ASISTENTE}. Flechas izquierda y arriba para agrandar, derecha y abajo para achicar`}
            className="text-texto-tenue hover:bg-hover hover:text-texto focus-visible:outline-acento focus-visible:outline-2 focus-visible:outline-offset-2 rounded-chico absolute left-1 top-1 flex size-5 cursor-nwse-resize touch-none items-center justify-center"
          >
            {/* Dos trazos en diagonal, el gesto que ya usa cualquier esquina redimensionable.
                `aria-hidden` porque lo que hay que anunciar es la etiqueta del boton, no el dibujo. */}
            <svg viewBox="0 0 10 10" aria-hidden="true" className="size-3 fill-none stroke-current" strokeWidth="1.4" strokeLinecap="round">
              <path d="M1 5 L5 1" />
              <path d="M1 9 L9 1" />
            </svg>
          </button>

          <header className="flex items-center justify-between gap-2 pl-6">
            <div className="flex flex-col">
              <p className="text-texto text-sm font-semibold">{ASISTENTE}</p>
              <p className="text-texto-sutil text-xs">Pregunta por lo que necesites</p>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label={`Cerrar ${ASISTENTE}`}
              className="text-texto-tenue hover:bg-hover hover:text-texto rounded-control px-2 py-1 text-sm"
            >
              Cerrar
            </button>
          </header>

          <ChatOrbe desplazable />
        </div>
      )}

      <button
        type="button"
        onClick={() => setAbierto((estaba) => !estaba)}
        onPointerEnter={() => setEncima(true)}
        onPointerLeave={() => setEncima(false)}
        onFocus={() => setEncima(true)}
        onBlur={() => setEncima(false)}
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        aria-label={abierto ? `Cerrar ${ASISTENTE}` : `Preguntarle a ${ASISTENTE}`}
        className="bg-gradiente-marca text-gradiente-marca-contenido shadow-flotante fixed bottom-6 right-4 z-50 inline-flex size-14 items-center justify-center rounded-full transition-[transform,filter] duration-150 ease-neo hover:brightness-95 active:scale-[0.96]"
      >
        <Orbe tamano="medio" estado={abierto || encima ? 'thinking' : undefined} />
      </button>
    </>
  )
}
