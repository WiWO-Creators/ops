'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { BotonGoogle } from '@/componentes/acceso/BotonGoogle'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { Orbe, type EstadoOrbe } from '@/componentes/estado/Orbe'
import { Logo } from '@/componentes/estructura/Logo'
import { Boton, boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { PasoCodigoPortal, type DesafioDelPortal } from '@/componentes/portal/PasoCodigoPortal'
import { PanelVidrio } from '@/componentes/superposiciones/PanelVidrio'
import { destinoDeEntrada } from '@/dominio/portal'
import {
  accesoGoogleDelPortal, mensajeDeEntradaAlPortal, PORTAL_SIN_GOOGLE,
  type AccesoGooglePortal, type ViaDelPortal
} from '@/dominio/portal-google'
import { avisoDeCodigoNoEnviado } from '@/dominio/segundo-factor-portal'
import { conLimite, TIEMPO_ESCRITURA_MS, TIEMPO_LECTURA_MS } from '@/datos/red'

interface RespuestaEntrar {
  ok?: boolean
  mensaje?: string
  codigo?: string
  /**
   * A donde llevar al contacto: el Proyecto de entrada que eligio su cliente, si tiene uno.
   *
   * Viene resuelto del servidor y aun asi pasa por `destinoDeEntrada()` antes de navegar.
   */
  destino?: unknown
  /** `true` cuando el cliente del contacto exige el codigo por correo: falta el segundo paso. */
  segundoFactor?: boolean
  pista?: string
  venceEn?: number
  espera?: number
  reenvios?: number
  entrega?: string
}

/**
 * Los pasos del acceso. Sin Google la pantalla vive entera en `clave`, que es la de siempre; con
 * Google empieza en `correo` y de ahi va a `google` o a `clave` segun el dominio.
 */
type Paso = 'correo' | 'google' | 'clave'

/**
 * Acceso al portal del cliente.
 *
 * Un paso, o dos si el cliente del contacto tiene encendido el segundo factor por correo (se
 * enciende por cliente desde su ficha y nace apagado): despues de la contraseña, `PasoCodigoPortal`
 * pide el codigo de 6 digitos. El `portal: true` del cuerpo es lo que hace que `/api/sesion` llame a
 * `/auth/portal/login` y escriba la cookie del contacto en vez de la del equipo.
 *
 * === GOOGLE ===
 *
 * Con `googleActivo` apagado —el interruptor global, que nace apagado— la pantalla es exactamente la
 * de siempre: correo y contraseña en un solo paso, sin pedirle nada a Google ni descargar su script.
 * Encendido, primero se pide el correo: segun su dominio se ofrece el boton de Google (con la
 * contraseña como alternativa, salvo que el cliente la haya cerrado con `required`) o directamente la
 * contraseña. El boton entrega un ID token que viaja a `/api/sesion` con `portal: true` y `google`;
 * quien lo valida es la API.
 *
 * El orbe es el indicador de progreso, igual que en el acceso del panel: quieto hasta que se envia,
 * en movimiento mientras la API responde.
 *
 * @param aviso por que se esta viendo esta pantalla cuando no se llego por voluntad propia
 * @param googleActivo si el interruptor global de Google en el portal esta encendido
 */
export function FormularioEntrarPortal ({ aviso = null, googleActivo = false }: {
  aviso?: string | null
  googleActivo?: boolean
}) {
  const router = useRouter()
  const [paso, establecerPaso] = useState<Paso>(googleActivo ? 'correo' : 'clave')
  const [correo, establecerCorreo] = useState('')
  const [acceso, establecerAcceso] = useState<AccesoGooglePortal>(PORTAL_SIN_GOOGLE)
  const [error, establecerError] = useState<string | null>(null)
  const [enviando, establecerEnviando] = useState(false)
  const [desafio, establecerDesafio] = useState<DesafioDelPortal | null>(null)
  const [estadoOrbe, establecerEstadoOrbe] = useState<EstadoOrbe | undefined>(undefined)
  const temporizadorOrbe = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (temporizadorOrbe.current !== null) clearTimeout(temporizadorOrbe.current)
  }, [])

  function señalarError () {
    establecerEstadoOrbe('error')

    if (temporizadorOrbe.current !== null) clearTimeout(temporizadorOrbe.current)
    temporizadorOrbe.current = setTimeout(() => { establecerEstadoOrbe(undefined) }, 1400)
  }

  /** La sesion quedo abierta, venga de la contraseña sola, de Google o del codigo. */
  function entrar (destino: unknown) {
    establecerEstadoOrbe('success')
    router.replace(destinoDeEntrada(destino))
    router.refresh()
  }

  /** Regreso al primer paso; con `motivo` cuando la verificacion murio y hay que explicarlo. */
  function volverALaClave (motivo?: string) {
    establecerDesafio(null)
    establecerError(motivo ?? null)
  }

  /** Vuelve a pedir el correo, para quien se equivoco de dominio o quiere entrar con otra cuenta. */
  function cambiarCorreo () {
    establecerError(null)
    establecerAcceso(PORTAL_SIN_GOOGLE)
    establecerPaso('correo')
  }

  /**
   * Pregunta a la API que puerta le corresponde a este correo y pasa al paso que toca.
   *
   * Si la consulta falla por algo que no sea el freno de intentos, se sigue con la contraseña: Google
   * es una comodidad y nunca puede costarle la entrada a quien tiene su clave.
   *
   * @param email el correo escrito, ya sin espacios
   * @returns el acceso resuelto, o `null` si la API frenó la consulta y no se avanzó
   */
  async function resolverAcceso (email: string): Promise<AccesoGooglePortal | null> {
    try {
      const respuesta = await fetch(`/api/sesion/portal-google?email=${encodeURIComponent(email)}`, {
        signal: conLimite(undefined, TIEMPO_LECTURA_MS)
      })

      if (respuesta.status === 429) {
        establecerError(mensajeDeEntradaAlPortal('rate_limited', 429, undefined, 'clave', false))

        return null
      }

      return respuesta.ok ? accesoGoogleDelPortal(await respuesta.json()) : PORTAL_SIN_GOOGLE
    } catch {
      return PORTAL_SIN_GOOGLE
    }
  }

  async function continuar (evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    if (enviando) return

    const email = String(new FormData(evento.currentTarget).get('email') ?? '').trim()

    if (email === '') return

    establecerError(null)
    establecerEnviando(true)
    establecerEstadoOrbe('thinking')

    const resuelto = await resolverAcceso(email)

    establecerEnviando(false)

    if (resuelto === null) {
      señalarError()

      return
    }

    establecerEstadoOrbe(undefined)
    establecerCorreo(email)
    establecerAcceso(resuelto)
    establecerPaso(resuelto.client_id !== null ? 'google' : 'clave')
  }

  /**
   * Manda una credencial a `/api/sesion` y reacciona a lo que conteste.
   *
   * Contraseña y Google terminan aca a proposito: el segundo factor, el orbe y la navegacion son de
   * la pantalla, no de la credencial.
   *
   * @param cuerpo `{ email, password }` o `{ google: <ID token> }`; el `portal: true` lo agrega esta funcion
   * @param via de donde viene la credencial, para traducir bien el error
   */
  async function abrirSesion (cuerpo: Record<string, unknown>, via: ViaDelPortal): Promise<void> {
    establecerError(null)
    establecerEnviando(true)
    establecerEstadoOrbe('thinking')

    try {
      const respuesta = await fetch('/api/sesion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...cuerpo, portal: true }),
        signal: conLimite(undefined, TIEMPO_ESCRITURA_MS)
      })

      const datos = await respuesta.json() as RespuestaEntrar

      if (!respuesta.ok) {
        await tratarRechazo(datos, respuesta.status, via)

        return
      }

      if (datos.segundoFactor === true) {
        establecerDesafio({
          pista: datos.pista ?? '',
          venceEn: datos.venceEn ?? 300,
          espera: datos.espera ?? 0,
          reenvios: datos.reenvios ?? 0,
          entrega: datos.entrega ?? 'real'
        })
        establecerEnviando(false)
        establecerEstadoOrbe(undefined)

        return
      }

      entrar(datos.destino)
    } catch {
      establecerError('No se pudo contactar al servidor. Revisa tu conexión.')
      establecerEnviando(false)
      señalarError()
    }
  }

  /**
   * Muestra por que no se entro y ajusta el paso si el rechazo cambia lo que corresponde ofrecer.
   *
   * - `google_required`: la clave estaba bien pero el cliente exige Google. Se vuelve a consultar el
   *   acceso de ese correo para que aparezca el boton (y desaparezca la contraseña).
   * - Google caido o apagado (`404`/`503`): se abre la contraseña, salvo que el cliente la tenga cerrada.
   */
  async function tratarRechazo (datos: RespuestaEntrar, estado: number, via: ViaDelPortal): Promise<void> {
    const sinCodigo = avisoDeCodigoNoEnviado(datos.codigo, datos.mensaje)

    if (datos.codigo === 'google_required' && googleActivo) {
      const email = correo
      const resuelto = email === '' ? null : await resolverAcceso(email)

      if (resuelto !== null && resuelto.client_id !== null) {
        establecerAcceso({ ...resuelto, required: true })
        establecerPaso('google')
      }
    } else if (via === 'google' && (estado === 404 || estado === 503) && !acceso.required) {
      establecerPaso('clave')
    }

    establecerError(sinCodigo ?? mensajeDeEntradaAlPortal(datos.codigo, estado, datos.mensaje, via, acceso.required))
    establecerEnviando(false)
    señalarError()
  }

  async function enviar (evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()

    await abrirSesion(Object.fromEntries(new FormData(evento.currentTarget)), 'clave')
  }

  /**
   * Recibe el ID token de Google y entra con el.
   *
   * El JWT no se abre ni se guarda: viaja al BFF, que es el unico que habla con la API. Google no
   * deshabilita su boton mientras hay una peticion en curso, asi que el segundo clic se ignora aca.
   */
  function entrarConGoogle (credential: string): void {
    if (enviando) return

    void abrirSesion({ google: credential }, 'google')
  }

  /** Aviso y error de la pantalla. El error manda: dos mensajes a la vez compiten por la mirada. */
  const mensajes = (
    <>
      {/* Cede ante el error, igual que en `/colab`: dos mensajes a la vez compiten, y el que
          importa cuando algo acaba de fallar es el error. */}
      {aviso !== null && error === null && (
        <p
          role="status"
          className="rounded-chico border-texto-aviso/35 bg-superficie-aviso text-texto-aviso border px-3 py-2 text-sm"
        >
          {aviso}
        </p>
      )}

      {error !== null && (
        <AvisoEnLinea
          variante="error"
          mensaje={error}
          className="rounded-chico border-relleno-peligro/40 bg-superficie-peligro border px-3 py-2 text-sm"
        />
      )}
    </>
  )

  const hayGoogleParaElCorreo = acceso.client_id !== null

  return (
    <main className="fondo-marca h-dvh overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col items-center justify-center gap-10 px-6 py-10 sm:px-10 lg:flex-row lg:justify-between lg:gap-16">
        <aside className="hidden max-w-md flex-col items-start gap-8 lg:flex">
          <Logo tamano="grande" />
          <Orbe tamano="marca" medida="clamp(14rem, 22vw, 21rem)" estado={estadoOrbe} />
          <div>
            <p className="font-titular text-texto text-2xl leading-snug font-semibold">
              El avance de tus proyectos.
              <br />
              <span className="text-texto-tenue">Cuando quieras verlo.</span>
            </p>
            <p aria-hidden="true" className="text-texto-tenue mt-3 h-5 text-sm">
              {enviando ? 'Verificando…' : ''}
            </p>
          </div>
        </aside>

        <div className="flex items-center gap-3 lg:hidden">
          <Orbe tamano="marca" medida="3.5rem" estado={estadoOrbe} />
          <Logo />
        </div>

        <PanelVidrio className="animate-entrar-abajo w-full max-w-sm p-6 sm:p-8">
          {desafio !== null
            ? (
              <PasoCodigoPortal
                desafio={desafio}
                alVolver={volverALaClave}
                alEntrar={entrar}
                alCambiarOrbe={establecerEstadoOrbe}
              />
              )
            : (
              <>
              <header className="mb-6">
                <h1 className="font-titular text-texto text-2xl font-bold tracking-tight">Portal de clientes</h1>
                <p className="text-texto-tenue mt-2 text-sm">
                  {paso === 'google'
                    ? (acceso.required
                        ? 'Tu empresa entra al portal con su cuenta de Google.'
                        : 'Entra con tu cuenta de Google de trabajo.')
                    : 'Entra con el correo con el que trabajamos.'}
                </p>
              </header>

              {paso === 'correo' && (
                <form onSubmit={(e) => { void continuar(e) }} className="flex flex-col gap-4">
                  <Campo etiqueta="Correo" requerido>
                    {(props) => (
                      <Entrada
                        {...props}
                        name="email"
                        type="email"
                        autoComplete="username"
                        defaultValue={correo}
                        autoFocus
                        required
                      />
                    )}
                  </Campo>

                  {mensajes}

                  <Boton type="submit" variante="primario" disabled={enviando} className="mt-1 w-full">
                    Continuar
                  </Boton>
                </form>
              )}

              {paso === 'google' && acceso.client_id !== null && (
                <div className="flex flex-col gap-4">
                  <CorreoElegido correo={correo} alCambiar={cambiarCorreo} deshabilitado={enviando} />

                  {mensajes}

                  <BotonGoogle clientId={acceso.client_id} loginHint={correo} alRecibirCredencial={entrarConGoogle} />

                  {/* Con Google exigido no hay alternativa que ofrecer: la API rechazaria la clave. */}
                  {!acceso.required && (
                    <Boton
                      type="button"
                      variante="secundario"
                      disabled={enviando}
                      className="w-full"
                      onClick={() => { establecerError(null); establecerPaso('clave') }}
                    >
                      Entrar con contraseña
                    </Boton>
                  )}
                </div>
              )}

              {paso === 'clave' && (
                <form onSubmit={(e) => { void enviar(e) }} className="flex flex-col gap-4">
                  {googleActivo
                    ? <CorreoElegido correo={correo} alCambiar={cambiarCorreo} deshabilitado={enviando} fijarEnFormulario />
                    : (
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
                      )}

                  <Campo etiqueta="Contraseña" requerido>
                    {(props) => (
                      <Entrada
                        {...props}
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        autoFocus={googleActivo}
                        required
                      />
                    )}
                  </Campo>

                  {mensajes}

                  <Boton type="submit" variante="primario" disabled={enviando} className="mt-1 w-full">
                    Entrar
                  </Boton>

                  {googleActivo && hayGoogleParaElCorreo && (
                    <Boton
                      type="button"
                      variante="sutil"
                      tamano="chico"
                      disabled={enviando}
                      onClick={() => { establecerError(null); establecerPaso('google') }}
                    >
                      Entrar con Google
                    </Boton>
                  )}
                </form>
              )}

              {/*
                El equipo llega aca por costumbre: la raiz es la puerta del cliente y el enlace que se
                comparte es este. La salida a `/colab` es un boton secundario bajo un separador: se ve de
                un vistazo, pero el primario sigue siendo "Entrar", que es la accion del cliente.
              */}
              <div className="text-texto-tenue mt-6 flex items-center gap-3 text-xs" aria-hidden="true">
                <span className="bg-control-borde h-px flex-1" />
                o
                <span className="bg-control-borde h-px flex-1" />
              </div>
              <Link
                href="/colab"
                className={boton({ variante: 'secundario', className: 'mt-4 w-full' })}
              >
                ¿Eres del equipo? Ingreso de colaborador
              </Link>
              </>
              )}
        </PanelVidrio>
      </div>
    </main>
  )
}

/**
 * El correo ya elegido, con la salida para cambiarlo.
 *
 * En el paso de la contraseña viaja ademas como campo de solo lectura, que es lo que el formulario
 * envia y lo que el gestor de contraseñas toma como usuario. El campo no se puede editar a proposito:
 * cambiar el correo cambia la puerta que corresponde, y eso se decide en el primer paso.
 *
 * @param correo el correo del primer paso
 * @param alCambiar vuelve al primer paso
 * @param deshabilitado hay una peticion en curso
 * @param fijarEnFormulario dibuja el campo `email` dentro del formulario
 */
function CorreoElegido ({ correo, alCambiar, deshabilitado, fijarEnFormulario = false }: {
  correo: string
  alCambiar: () => void
  deshabilitado: boolean
  fijarEnFormulario?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      {fijarEnFormulario
        ? (
          <Campo etiqueta="Correo">
            {(props) => (
              <Entrada {...props} name="email" type="email" autoComplete="username" value={correo} readOnly />
            )}
          </Campo>
          )
        : (
          <>
            <span className="text-texto text-sm font-medium">Correo</span>
            <p className="text-texto-tenue text-sm break-all">{correo}</p>
          </>
          )}
      <Boton type="button" variante="sutil" tamano="chico" disabled={deshabilitado} onClick={alCambiar} className="self-start">
        Usar otro correo
      </Boton>
    </div>
  )
}
