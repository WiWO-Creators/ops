'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Orbe, type EstadoOrbe } from '@/componentes/estado/Orbe'
import { Logo } from '@/componentes/estructura/Logo'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { PanelVidrio } from '@/componentes/superposiciones/PanelVidrio'

type Paso = 'clave' | 'codigo'

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
 */
export function FormularioEntrar () {
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

  async function enviar (evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    establecerError(null)
    establecerEnviando(true)
    establecerEstadoOrbe('thinking')

    const datos = new FormData(evento.currentTarget)

    try {
      const respuesta = await fetch('/api/sesion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(datos))
      })

      const cuerpo = await respuesta.json() as RespuestaEntrar

      if (!respuesta.ok) {
        establecerError(mensajeDeError(cuerpo, respuesta.status))
        establecerEnviando(false)
        señalarError()

        return
      }

      if (cuerpo.segundoFactor === true) {
        establecerMetodo(cuerpo.method ?? 'email')
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
              visible solo para quien lo necesita leer.
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
        </PanelVidrio>
      </div>
    </main>
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
 */
function mensajeDeError (cuerpo: RespuestaEntrar, estado: number): string {
  if (cuerpo.codigo === 'rate_limited') {
    return 'Demasiados intentos fallidos. Esperá unos minutos antes de volver a probar.'
  }

  if (cuerpo.codigo === 'forbidden') {
    return 'Tu cuenta está desactivada. Hablá con un administrador.'
  }

  if (estado === 401) {
    return 'Correo o contraseña incorrectos.'
  }

  return cuerpo.mensaje ?? 'No se pudo entrar. Intentá de nuevo.'
}
