'use client'

import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'

/**
 * Lo minimo de Google Identity Services que usa el boton.
 *
 * Se declara a mano en vez de instalar `@types/google.accounts`: son tres firmas y una dependencia
 * menos que actualizar. Es opcional en `window` porque el script se carga tarde y puede no llegar
 * nunca —bloqueador, red caida—, y en ese caso la pantalla tiene que seguir funcionando.
 */
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (opciones: {
            client_id: string
            callback: (respuesta: { credential: string }) => void
            ux_mode?: 'popup' | 'redirect'
            auto_select?: boolean
            cancel_on_tap_outside?: boolean
            login_hint?: string
          }) => void
          renderButton: (elemento: HTMLElement, opciones: {
            type?: 'standard' | 'icon'
            theme?: 'outline' | 'filled_blue' | 'filled_black'
            size?: 'small' | 'medium' | 'large'
            text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
            shape?: 'rectangular' | 'pill' | 'circle' | 'square'
            logo_alignment?: 'left' | 'center'
            locale?: string
          }) => void
        }
      }
    }
  }
}

interface PropsBotonGoogle {
  /** La aplicacion de Google configurada en el panel, tal como la devolvio la API. */
  clientId: string
  /** Que hacer con el ID token. */
  alRecibirCredencial: (credential: string) => void
  /** El correo con el que la persona dice entrar: Google lo preselecciona en su ventana. */
  loginHint?: string
}

/**
 * Boton "Entrar con Google", con su script.
 *
 * Usa Google Identity Services y **no** un OAuth con redirect: GIS entrega el ID token directo en el
 * callback, asi que no hay que registrar URIs de retorno, ni llevar un `state`, ni guardar un client
 * secret en ningun lado. La credencial se cambia por sesion en `/api/sesion`, que es el unico lugar
 * que ve tokens.
 *
 * El script se carga con `next/script` en vez de inyectar y limpiar una etiqueta a mano: Next lo
 * descarga una sola vez aunque el componente se monte de nuevo —volver del paso del codigo—, avisa
 * con `onReady` tambien en ese remontaje, y `lazyOnload` lo deja para el tiempo muerto del
 * navegador, que es lo correcto para algo que no bloquea la via principal de entrada.
 *
 * El boton lo dibuja Google, no el sistema de diseño: su marca no se puede reimplementar por
 * lineamiento suyo. `filled_black` es la variante que corresponde sobre el vidrio oscuro de las
 * pantallas de acceso, y lo que renderiza es un elemento con `role="button"` y su propio nombre
 * accesible ("Iniciar sesión con Google" en `es`), asi que queda anunciado sin envoltorios extra.
 *
 * Lo comparten el acceso del equipo (`/colab`) y el del portal de clientes: cada uno pone su
 * `clientId` y decide que hace con la credencial.
 *
 * @param clientId la aplicacion de Google con la que se dibuja el boton
 * @param alRecibirCredencial que hacer con el ID token
 * @param loginHint correo a preseleccionar en la ventana de Google; opcional
 */
export function BotonGoogle ({ clientId, alRecibirCredencial, loginHint }: PropsBotonGoogle) {
  const contenedor = useRef<HTMLDivElement>(null)
  const [scriptListo, establecerScriptListo] = useState(false)
  /*
   * El callback se guarda en una referencia y no se pasa directo a `initialize`: Google se queda con
   * la funcion del primer render para siempre, y esa copia veria `enviando` congelado en `false`.
   * Ademas, incluirla en las dependencias del efecto redibujaria el boton en cada tecleo.
   */
  const ultimoCallback = useRef(alRecibirCredencial)

  useEffect(() => {
    ultimoCallback.current = alRecibirCredencial
  })

  useEffect(() => {
    const destino = contenedor.current
    const gis = window.google?.accounts.id

    if (!scriptListo || destino === null || gis === undefined) return

    gis.initialize({
      client_id: clientId,
      callback: (respuesta) => { ultimoCallback.current(respuesta.credential) },
      // `popup`: el redirect sacaria a la persona de la pagina y obligaria a una ruta de retorno.
      ux_mode: 'popup',
      // Nada de entrar solo: quien abre la pantalla puede estar cambiando de cuenta a proposito.
      auto_select: false,
      cancel_on_tap_outside: true,
      ...(loginHint !== undefined && loginHint !== '' ? { login_hint: loginHint } : {})
    })

    gis.renderButton(destino, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      logo_alignment: 'left',
      locale: 'es'
    })

    // Google escribe dentro del contenedor por fuera de React. React lo ve vacio, asi que vaciarlo
    // al desmontar no le pisa nada y evita dos botones apilados si el efecto se vuelve a correr.
    return () => { destino.replaceChildren() }
  }, [clientId, scriptListo, loginHint])

  return (
    <div>
      {/* Sin separador "o": Google dejo de ser la alternativa y paso a ser la puerta. Un "o"
          arriba de todo no separa dos cosas, cuelga de la nada. */}

      {/*
        Sin ancho fijo: GIS acepta pixeles, no porcentajes, y cualquier numero que entre en el
        panel de escritorio se desborda en un telefono de 320px. Centrado ocupa lo que necesita.

        `scheme-light` no es un descuido sobre el vidrio oscuro: cancela el `color-scheme: dark` que
        `.panel-vidrio` hereda hasta aca. El boton de Google vive en un iframe suyo, y cuando el
        esquema del elemento `<iframe>` no coincide con el del documento incrustado —que es claro—,
        Chrome deja de dibujarlo transparente y pinta el lienzo blanco del documento de Google. Eso
        es la caja blanca de 255x44 alrededor de la pildora: no sale de nuestro CSS ni del contenido
        del iframe (adentro solo el disco del logotipo es blanco), sale del lienzo del subdocumento.
        Con el esquema en claro el iframe vuelve a ser transparente y solo se ve la pildora negra.

        No toca nada mas: este `div` no contiene otra cosa que el iframe de Google, asi que el
        `color-scheme: dark` del panel —que es el que pinta scrollbars y autocompletado— sigue
        valiendo para el resto del formulario.
      */}
      <div ref={contenedor} className="flex justify-center scheme-light" />

      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="lazyOnload"
        onReady={() => { establecerScriptListo(true) }}
      />
    </div>
  )
}
