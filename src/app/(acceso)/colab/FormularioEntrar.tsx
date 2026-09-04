'use client'

import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'
import { Orbe, type EstadoOrbe } from '@/componentes/estado/Orbe'
import { Logo } from '@/componentes/estructura/Logo'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { PanelVidrio } from '@/componentes/superposiciones/PanelVidrio'
import type { AccesoGoogle } from '@/datos/tipos'

type Paso = 'clave' | 'codigo'

/** Por donde llego la credencial. Solo cambia como se traduce el error, no como se entra. */
type Via = 'clave' | 'google'

interface RespuestaEntrar {
  ok?: boolean
  segundoFactor?: boolean
  method?: 'email' | 'app'
  mensaje?: string
  codigo?: string
}

/**
 * Acceso al sistema, en dos pasos.
 *
 * El segundo paso aparece solo si la cuenta tiene segundo factor. El `challenge_token` no pasa por
 * aca: queda en una cookie que escribe `/api/sesion`, asi que este componente nunca toca un secreto.
 *
 * El orbe de la izquierda es el indicador de progreso de esta pantalla: esta quieto hasta que se
 * envia el formulario y se mueve mientras la API responde. Por eso el boton no lleva su propio
 * indicador — dos cosas girando a la vez por una sola operacion se leen como dos operaciones.
 *
 * @param google lo que respondio `GET /auth/google`. Si viene apagado la pantalla es exactamente la
 *               de siempre: ni el script de Google se descarga.
 */
export function FormularioEntrar ({ google }: { google: AccesoGoogle }) {
  const router = useRouter()
  const [paso, establecerPaso] = useState<Paso>('clave')
  const [metodo, establecerMetodo] = useState<'email' | 'app'>('email')
  const [error, establecerError] = useState<string | null>(null)
  const [enviando, establecerEnviando] = useState(false)
  /**
   * El estado del orbe, que es el indicador de progreso de esta pantalla.
   *
   * `undefined` lo deja quieto. Los tres estados que usa son los que Neo define para exactamente
   * esto: `thinking` mientras la API responde, `success` cuando la sesion quedo abierta —dura 600ms,
   * no se repite, y su trabajo es avisar que termino antes de que ocurra la navegacion— y `error`
   * cuando la credencial no sirve, que se contrae y baja la energia sin dramatizar el problema.
   */
  const [estadoOrbe, establecerEstadoOrbe] = useState<EstadoOrbe | undefined>(undefined)
  const temporizadorOrbe = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (temporizadorOrbe.current !== null) clearTimeout(temporizadorOrbe.current)
  }, [])

  /**
   * Marca el fallo y devuelve el orbe a la calma.
   *
   * Neo pide para `error` "contraccion fria, friccion **breve** y baja energia **sin dramatizar el
   * problema**". Un orbe rojo de 130px sostenido en pantalla mientras la persona reescribe su
   * contraseña dramatiza bastante: el destello dura lo que dura la señal y despues el orbe vuelve a
   * quedarse quieto. El mensaje de error sigue en pantalla — eso es lo que tiene que persistir.
   */
  function señalarError () {
    establecerEstadoOrbe('error')

    if (temporizadorOrbe.current !== null) clearTimeout(temporizadorOrbe.current)
    temporizadorOrbe.current = setTimeout(() => { establecerEstadoOrbe(undefined) }, 1400)
  }

  /**
   * Manda una credencial a `/api/sesion` y reacciona a lo que conteste.
   *
   * Las dos vias de entrada —correo con contraseña y Google— terminan aca a proposito: el segundo
   * factor, el orbe y la navegacion son de la pantalla, no de la credencial. Duplicar esto para el
   * boton de Google era la forma segura de que una de las dos copias se olvidara del `segundoFactor`
   * y dejara entrar sin el.
   *
   * @param cuerpo lo que se manda tal cual al BFF: `{ email, password }`, `{ code }` o
   *               `{ google: <ID token> }`. Ninguno de esos valores se guarda ni se registra aca.
   * @param via de donde vino, solo para traducir el error al idioma correcto.
   */
  async function abrirSesion (cuerpo: Record<string, unknown>, via: Via): Promise<void> {
    establecerError(null)
    establecerEnviando(true)
    establecerEstadoOrbe('thinking')

    try {
      const respuesta = await fetch('/api/sesion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo)
      })

      const datos = await respuesta.json() as RespuestaEntrar

      if (!respuesta.ok) {
        establecerError(mensajeDeError(datos, respuesta.status, via))
        establecerEnviando(false)
        señalarError()

        return
      }

      if (datos.segundoFactor === true) {
        establecerMetodo(datos.method ?? 'email')
        establecerPaso('codigo')
        establecerEnviando(false)
        // La credencial era correcta: el segundo factor es un paso mas, no un fallo, asi que el
        // orbe se queda pensando en vez de apagarse o marcar error.
        establecerEstadoOrbe('thinking')

        return
      }

      // Aca NO se apaga: el orbe pasa a `success` y se queda asi hasta que la navegacion ocurre.
      // Apagarlo antes deja un hueco quieto entre "listo" y "ya estoy adentro" que se lee como que
      // algo fallo.
      establecerEstadoOrbe('success')
      router.replace('/inicio')
      router.refresh()
    } catch {
      establecerError('No se pudo contactar al servidor. Revisá tu conexión.')
      establecerEnviando(false)
      señalarError()
    }
  }

  async function enviar (evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()

    await abrirSesion(Object.fromEntries(new FormData(evento.currentTarget)), 'clave')
  }

  /**
   * Recibe el ID token de Google y entra con el.
   *
   * El JWT no se abre ni se guarda: viaja al BFF, que es el unico que habla con `/auth/google`.
   * Quien valida la firma, el dominio y el estado de la cuenta es la API.
   */
  function entrarConGoogle (credential: string): void {
    // Google no deshabilita su boton mientras hay una peticion en curso, asi que el segundo clic se
    // ignora aca: dos `/api/sesion` en paralelo compiten por escribir la misma cookie de sesion.
    if (enviando) return

    void abrirSesion({ google: credential }, 'google')
  }

  /*
   * La aplicacion de Google con la que se dibuja el boton, o `null` si no hay que dibujarlo. Se
   * resuelve como valor y no como bandera para que el `client_id` llegue ya estrechado a `string`.
   * En el paso del codigo no aparece: ahi la credencial ya se dio y lo unico que falta es el 2FA.
   */
  const clientIdGoogle = paso === 'clave' && google.enabled ? google.client_id : null

  return (
    /*
     * `h-dvh` con el scroll adentro y no `min-h-dvh`: el `body` de la aplicacion tiene
     * `overflow: hidden`, asi que si el contenido no entra —telefono apaisado, letra del sistema
     * agrandada— tiene que poder desplazarse acá. El envoltorio usa `min-h-full` para que centrar
     * verticalmente no recorte la parte de arriba cuando el contenido supera la ventana.
     */
    <main className="fondo-marca h-dvh overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col items-center justify-center gap-10 px-6 py-10 sm:px-10 lg:flex-row lg:justify-between lg:gap-16">
        <PanelDeMarca estado={estadoOrbe} activo={enviando} />
        <CabeceraMovil estado={estadoOrbe} />

        <PanelVidrio className="w-full max-w-sm p-6 sm:p-8">
          <header className="mb-8">
            <h1 className="font-titular text-3xl font-extrabold tracking-tight text-texto">
              {paso === 'clave' ? 'Entrar' : 'Verificar'}
            </h1>
            {paso !== 'clave' && (
              <p className="mt-2 text-sm text-texto-tenue">
                {metodo === 'email'
                  ? 'Te enviamos un código por correo.'
                  : 'Abrí tu aplicación de autenticación.'}
              </p>
            )}
          </header>

          <form onSubmit={enviar} className="flex flex-col gap-5" noValidate>
            {/*
              El aviso vive en el formulario y no en el panel del orbe: ese panel se oculta por
              debajo de `lg`, y `display: none` lo saca tambien del arbol de accesibilidad — en
              telefono nadie se enteraria de que la verificacion esta en curso. Aca esta siempre,
              visible solo para quien lo necesita leer. Cubre las dos vias porque las dos pasan por
              `abrirSesion`, que es la que prende `enviando`.
            */}
            <p role="status" aria-live="polite" className="sr-only">
              {enviando ? 'Verificando tus datos' : ''}
            </p>

            {paso === 'clave'
              ? (
                <>
                  <Campo etiqueta="Correo" requerido>
                    {(props) => (
                      <Entrada
                        {...props}
                        name="email"
                        type="email"
                        autoComplete="username"
                        autoFocus
                        required
                      />
                    )}
                  </Campo>
                  <Campo etiqueta="Contraseña" requerido>
                    {(props) => (
                      <Entrada
                        {...props}
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                      />
                    )}
                  </Campo>
                </>
                )
              : (
                <Campo etiqueta="Código de verificación" requerido>
                  {(props) => (
                    <Entrada
                      {...props}
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoFocus
                      required
                      /*
                       * Monoespaciada y con espacio entre cifras: seis digitos que hay que cotejar
                       * contra otra pantalla se leen de a uno, no como palabra. La mono es la unica
                       * de las tres familias con cifras de ancho fijo, asi que el codigo no baila
                       * mientras se escribe.
                       */
                      className="text-center font-mono text-lg tracking-[0.4em] tabular-nums"
                    />
                  )}
                </Campo>
                )}

            {error !== null && (
              <p
                role="alert"
                className="rounded-chico border border-relleno-peligro/40 bg-superficie-peligro px-3 py-2 text-sm text-texto-peligro"
              >
                {error}
              </p>
            )}

            {/* `cargando` y no `disabled`: deshabilita igual y ademas pone el orbe dentro del boton, que
                es como el resto del producto dice que hay algo en curso. */}
            <Boton type="submit" variante="primario" cargando={enviando} className="mt-1 w-full">
              {paso === 'clave' ? 'Entrar' : 'Verificar'}
            </Boton>

            {paso === 'codigo' && (
              <Boton
                type="button"
                variante="sutil"
                tamano="chico"
                disabled={enviando}
                onClick={() => {
                  establecerPaso('clave')
                  establecerError(null)
                }}
              >
                Volver
              </Boton>
            )}
          </form>

          {clientIdGoogle !== null && (
            <EntrarConGoogle clientId={clientIdGoogle} alRecibirCredencial={entrarConGoogle} />
          )}
        </PanelVidrio>
      </div>
    </main>
  )
}

/**
 * Lo minimo de Google Identity Services que este archivo usa.
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

/**
 * Boton "Entrar con Google", con su separador.
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
 * lineamiento suyo. `filled_black` es la variante que corresponde sobre el vidrio oscuro de esta
 * pantalla, y lo que renderiza es un elemento con `role="button"` y su propio nombre accesible
 * ("Iniciar sesión con Google" en `es`), asi que queda anunciado sin envoltorios extra.
 *
 * @param clientId la aplicacion de Google configurada en el panel, tal como la devolvio la API
 * @param alRecibirCredencial que hacer con el ID token
 */
function EntrarConGoogle (
  { clientId, alRecibirCredencial }: { clientId: string, alRecibirCredencial: (credential: string) => void }
) {
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
      // Nada de entrar solo: quien abre `/colab` puede estar cambiando de cuenta a proposito.
      auto_select: false,
      cancel_on_tap_outside: true
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
  }, [clientId, scriptListo])

  return (
    <div className="mt-6">
      <div className="mb-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-control-borde" />
        <span className="text-xs uppercase tracking-wide text-texto-tenue">o</span>
        <span className="h-px flex-1 bg-control-borde" />
      </div>

      {/* Sin ancho fijo: GIS acepta pixeles, no porcentajes, y cualquier numero que entre en el
          panel de escritorio se desborda en un telefono de 320px. Centrado ocupa lo que necesita. */}
      <div ref={contenedor} className="flex justify-center" />

      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="lazyOnload"
        onReady={() => { establecerScriptListo(true) }}
      />
    </div>
  )
}

/**
 * Bloque de marca: logotipo, orbe y promesa del producto.
 *
 * El orbe es el unico elemento con movimiento de la pantalla, y se mueve **solo mientras la API
 * responde**: es la regla del sistema —moverse significa que hay algo en curso— aplicada a la unica
 * operacion que esta pantalla tiene. En reposo se pinta quieto y ni siquiera se promueve a capa de
 * GPU.
 *
 * El degradado ya no vive aca sino en el `<main>`, que lo lleva a pantalla completa: el orbe es
 * vidrio translucido —desenfoca lo que tiene detras en vez de traer fondo propio— y la tarjeta
 * tambien, asi que los dos necesitan el mismo "detras" y no una mitad de pantalla cada uno.
 *
 * Se oculta por debajo de `lg`: a 300px el orbe se come una pantalla de telefono, y ahi el
 * formulario es lo unico que importa. Su reemplazo es `CabeceraMovil`.
 *
 * Los colores no se escriben a mano: `.fondo-marca` fuerza la rama oscura de los tokens, asi que
 * `--texto` ya es el claro y `--marca` ya es el beige del logotipo.
 */
function PanelDeMarca ({ estado, activo }: { estado: EstadoOrbe | undefined, activo: boolean }) {
  return (
    <aside className="hidden max-w-md flex-col items-start gap-8 lg:flex">
      <Logo tamano="grande" />

      <Orbe tamano="marca" medida="clamp(14rem, 22vw, 21rem)" estado={estado} />

      <div>
        <p className="font-titular text-2xl font-semibold leading-snug text-texto">
          Tareas, Proyectos y Clientes.
          {/* El quiebre se fija: dejarlo al ancho parte la frase en "y / Clientes." y separa el
              sustantivo de su lista. */}
          <br />
          <span className="text-texto-tenue">Un solo lugar.</span>
        </p>

        {/* Reserva la altura del aviso para que el bloque entero no salte al empezar a verificar. */}
        <p aria-hidden="true" className="mt-3 h-5 text-sm text-texto-tenue">
          {activo ? 'Verificando…' : ''}
        </p>
      </div>
    </aside>
  )
}

/**
 * Cabecera del telefono.
 *
 * El bloque de marca no cabe por debajo de `lg`, pero esconder la identidad entera deja una pantalla
 * anonima. Aca el orbe entra en su tamaño acotado, que es el que el sistema define para acompañar a
 * un contenedor en vez de a la pantalla completa.
 *
 * Son dos orbes en el arbol y solo uno visible: cada uno es un `span` con cuatro hijos y los dos son
 * `aria-hidden`, asi que el costo es menor que resolver el tamaño con JavaScript y arriesgarse a que
 * el primer pintado use el equivocado.
 */
function CabeceraMovil ({ estado }: { estado: EstadoOrbe | undefined }) {
  return (
    <div className="flex items-center gap-3 lg:hidden">
      <Orbe tamano="marca" medida="3.5rem" estado={estado} />
      <Logo />
    </div>
  )
}

/**
 * Traduce el error de la API a algo accionable.
 *
 * Los codigos del contrato son estables; los mensajes del servidor no siempre estan en español ni
 * dicen que hacer.
 *
 * @param via de donde venia la credencial. Hace falta porque un mismo codigo significa cosas
 *            distintas segun la puerta: un 401 por Google no es "contraseña incorrecta".
 */
function mensajeDeError (cuerpo: RespuestaEntrar, estado: number, via: Via): string {
  if (cuerpo.codigo === 'rate_limited') {
    return 'Demasiados intentos fallidos. Esperá unos minutos antes de volver a probar.'
  }

  // La API separa los dos 403 con codigos propios: `domain_not_allowed` es el dominio fuera de la
  // lista y `forbidden` la cuenta dada de baja. Distinguirlos por el texto del mensaje seria atarse
  // a una redaccion que puede cambiar sin aviso.
  if (cuerpo.codigo === 'domain_not_allowed') return SIN_DOMINIO

  if (cuerpo.codigo === 'forbidden') return CUENTA_APAGADA

  if (estado === 401) {
    return via === 'google'
      ? 'No pudimos entrar con esa cuenta de Google. Probá con tu correo y contraseña.'
      : 'Correo o contraseña incorrectos.'
  }

  return cuerpo.mensaje ?? 'No se pudo entrar. Intentá de nuevo.'
}

const SIN_DOMINIO = 'Ese correo no tiene acceso. Entrá con una cuenta de un dominio autorizado.'
const CUENTA_APAGADA = 'Tu cuenta está desactivada. Hablá con un administrador.'
