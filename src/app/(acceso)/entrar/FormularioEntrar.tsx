'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Orbe } from '@/componentes/estado/Orbe'
import { cn } from '@/lib/clases'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'

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

  async function enviar (evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    establecerError(null)
    establecerEnviando(true)

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

        return
      }

      if (cuerpo.segundoFactor === true) {
        establecerMetodo(cuerpo.method ?? 'email')
        establecerPaso('codigo')
        establecerEnviando(false)

        return
      }

      // Aca NO se apaga: el orbe sigue girando hasta que la navegacion ocurre. Apagarlo antes deja
      // un hueco quieto entre "listo" y "ya estoy adentro" que se lee como que algo fallo.
      router.replace('/')
      router.refresh()
    } catch {
      establecerError('No se pudo contactar al servidor. Revisá tu conexión.')
      establecerEnviando(false)
    }
  }

  return (
    <main className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      <PanelDeMarca activo={enviando} />

      <section className="flex items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <CabeceraMovil activo={enviando} />

          <header className="mb-8">
            <h1 className="font-titular text-3xl font-extrabold tracking-tight text-texto">
              {paso === 'clave' ? 'Entrar' : 'Verificar'}
            </h1>
            <p className="mt-2 text-sm text-texto-tenue">
              {paso === 'clave'
                ? 'Con tu cuenta del board.'
                : metodo === 'email'
                  ? 'Te enviamos un código por correo.'
                  : 'Abrí tu aplicación de autenticación.'}
            </p>
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

            <Boton type="submit" variante="primario" disabled={enviando} className="mt-1 w-full">
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
        </div>
      </section>
    </main>
  )
}

/**
 * Panel de marca con el orbe.
 *
 * El orbe es el unico elemento con movimiento de la pantalla, y se mueve **solo mientras la API
 * responde**: es la regla del sistema —moverse significa que hay algo en curso— aplicada a la unica
 * operacion que esta pantalla tiene. En reposo se pinta quieto y ni siquiera se promueve a capa de
 * GPU.
 *
 * Se oculta por debajo de `lg`: a 130px el orbe se come una pantalla de telefono, y ahi el formulario
 * es lo unico que importa.
 */
function PanelDeMarca ({ activo }: { activo: boolean }) {
  return (
    <aside className="relative hidden flex-col items-center justify-center gap-10 border-r border-linea bg-superficie-hundida px-12 py-16 lg:flex">
      <Marca className="absolute left-10 top-10" />

      <Orbe tamano="grande" animado={activo} />

      <p className="text-center font-titular text-2xl font-semibold leading-snug text-texto">
        Procesos, Espacios y Clientes.
        {/* El quiebre se fija: dejarlo al ancho parte la frase en "y / Clientes." y separa el
            sustantivo de su lista. */}
        <br />
        <span className="text-texto-tenue">Un solo lugar.</span>
      </p>

      {/* Reserva la altura del aviso para que el bloque entero no salte al empezar a verificar. */}
      <p aria-hidden="true" className="-mt-4 h-5 text-sm text-texto-tenue">
        {activo ? 'Verificando…' : ''}
      </p>
    </aside>
  )
}

/**
 * Cabecera del telefono.
 *
 * El panel de marca no cabe por debajo de `lg`, pero esconder la identidad entera deja una pantalla
 * anonima. Aca el orbe entra en su tamaño acotado, que es el que el sistema define para acompañar a
 * un contenedor en vez de a la pantalla completa.
 *
 * Son dos orbes en el arbol y solo uno visible: cada uno es un `span` con cuatro hijos y los dos son
 * `aria-hidden`, asi que el costo es menor que resolver el tamaño con JavaScript y arriesgarse a que
 * el primer pintado use el equivocado.
 */
function CabeceraMovil ({ activo }: { activo: boolean }) {
  return (
    <div className="mb-10 flex items-center gap-3 lg:hidden">
      <Orbe tamano="medio" animado={activo} />
      <Marca />
    </div>
  )
}

/** El nombre del sistema, con el tratamiento de marca. */
function Marca ({ className }: { className?: string }) {
  return (
    <p className={cn('font-titular text-sm font-bold uppercase tracking-[0.2em] text-texto-tenue', className)}>
      WiWO Ops
    </p>
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
