'use client'

import { useState, type FormEvent, type ReactElement } from 'react'
import { X } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Seccion } from '@/componentes/presentadores/Ficha'
import { guardarAjustes } from '@/datos/recursos'
import { detallesDeAjustesLegibles } from '@/dominio/ajustes'
import {
  AJUSTES_GOOGLE, ajusteBool, ajusteTexto, dominiosATexto, dominiosDesdeTexto,
  motivoParaRechazarDominio, normalizarDominio, tieneAjustesDeGoogle
} from '@/dominio/acceso'
import type { Ajustes, CambiosDeAjustes } from '@/datos/recursos'

/** Nombre legible de cada clave, para el detalle del 422: la API contesta con el nombre tecnico. */
const ETIQUETA_DE_CLAVE: Record<string, string> = {
  [AJUSTES_GOOGLE.habilitado]: 'Login con Google',
  [AJUSTES_GOOGLE.dominios]: 'Dominios autorizados',
  [AJUSTES_GOOGLE.clienteId]: 'Client ID de Google'
}

interface PropsAccesoGoogle {
  inicial: Ajustes
}

/**
 * Configuracion del login con Google del equipo: el interruptor, los dominios autorizados y el
 * Client ID.
 *
 * Los tres son opciones de `tbloptions` del grupo `acceso`, y se escriben con un solo
 * `PATCH /settings` que lleva unicamente lo que cambio. Que sea un solo pedido importa: la API
 * rechaza el cuerpo entero si una clave no pasa la whitelist, asi que o entran los tres cambios o no
 * entra ninguno, y nunca queda el login prendido con la lista de dominios a medio guardar.
 *
 * La lista de dominios se edita como chips y no como un texto separado por comas a proposito: la
 * coma es un separador invisible: quien escribe no ve cuando le sobra una y termina con un dominio
 * vacio en una lista que decide quien puede entrar. Aca cada dominio se valida al agregarse y la
 * serializacion a la cadena que espera la API ocurre recien al guardar.
 */
export function AccesoGoogle ({ inicial }: PropsAccesoGoogle): ReactElement {
  const [guardada, setGuardada] = useState(inicial)
  const [habilitado, setHabilitado] = useState(() => ajusteBool(inicial, AJUSTES_GOOGLE.habilitado))
  const [dominios, setDominios] = useState(() => dominiosDesdeTexto(ajusteTexto(inicial, AJUSTES_GOOGLE.dominios)))
  const [clienteId, setClienteId] = useState(() => ajusteTexto(inicial, AJUSTES_GOOGLE.clienteId))

  const [nuevoDominio, setNuevoDominio] = useState('')
  const [errorDominio, setErrorDominio] = useState<string | null>(null)

  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)
  const [detallesError, setDetallesError] = useState<string[]>([])
  const [confirmado, setConfirmado] = useState(false)

  const disponible = tieneAjustesDeGoogle(guardada)
  const habilitadoGuardado = ajusteBool(guardada, AJUSTES_GOOGLE.habilitado)
  const dominiosGuardados = ajusteTexto(guardada, AJUSTES_GOOGLE.dominios)
  const clienteIdGuardado = ajusteTexto(guardada, AJUSTES_GOOGLE.clienteId)

  const textoDominios = dominiosATexto(dominios)
  const sucio = habilitado !== habilitadoGuardado ||
    textoDominios !== dominiosGuardados ||
    clienteId.trim() !== clienteIdGuardado

  // Prender el login sin dominios autorizados es una puerta abierta: cualquier cuenta de Google
  // entraria. Se bloquea el guardado, no se corrige solo, porque la decision es de quien administra.
  const sinDominios = habilitado && dominios.length === 0
  const sinClienteId = habilitado && clienteId.trim() === ''

  /** Agrega el dominio del campo si es plausible, no esta repetido y no viene vacio. */
  function agregarDominio (evento: FormEvent): void {
    evento.preventDefault()

    const motivo = motivoParaRechazarDominio(nuevoDominio, dominios)

    if (motivo !== null) {
      setErrorDominio(motivo)
      return
    }

    setDominios([...dominios, normalizarDominio(nuevoDominio)])
    setNuevoDominio('')
    setErrorDominio(null)
    setConfirmado(false)
  }

  /** Quita un dominio de la lista. Recien se aplica al guardar. */
  function quitarDominio (dominio: string): void {
    setDominios(dominios.filter((actual) => actual !== dominio))
    setErrorDominio(null)
    setConfirmado(false)
  }

  /**
   * Manda al `PATCH` solo las claves que cambiaron.
   *
   * Antes revisa lo que la API no puede revisar por si sola: que no quede el login prendido sin
   * dominios ni sin Client ID —las dos formas de dejarlo roto o abierto— y que no se pierda un
   * dominio a medio escribir en el campo de agregar, que es lo que pasa cuando alguien escribe y va
   * directo a «Guardar».
   */
  async function guardar (): Promise<void> {
    if (nuevoDominio.trim() !== '') {
      setErrorDominio('Agregá el dominio que estás escribiendo, o borrá el campo, antes de guardar.')
      return
    }

    if (sinDominios) {
      setErrorGuardar('Con el login encendido y la lista vacía cualquier cuenta de Google podría entrar. Agregá al menos un dominio o apagá el login.')
      setDetallesError([])
      return
    }

    if (sinClienteId) {
      setErrorGuardar('Sin Client ID el botón de Google no puede funcionar. Pegá el Client ID o apagá el login.')
      setDetallesError([])
      return
    }

    const cambios: CambiosDeAjustes = {}
    if (habilitado !== habilitadoGuardado) cambios[AJUSTES_GOOGLE.habilitado] = habilitado
    if (textoDominios !== dominiosGuardados) cambios[AJUSTES_GOOGLE.dominios] = textoDominios
    if (clienteId.trim() !== clienteIdGuardado) cambios[AJUSTES_GOOGLE.clienteId] = clienteId.trim()

    setGuardando(true)
    setErrorGuardar(null)
    setDetallesError([])
    setConfirmado(false)

    const resultado = await guardarAjustes(cambios)

    setGuardando(false)

    if (!resultado.ok) {
      setErrorGuardar(resultado.mensaje)
      setDetallesError(detallesDeAjustesLegibles(resultado.detalles, ETIQUETA_DE_CLAVE))
      return
    }

    // El `PATCH` devuelve el mismo cuerpo que el `GET`: se relee de ahi en vez de dar por hecho que
    // quedo lo que se mando. Si el backend normalizo algo, la pantalla lo muestra normalizado.
    setGuardada(resultado.ajustes)
    setHabilitado(ajusteBool(resultado.ajustes, AJUSTES_GOOGLE.habilitado))
    setDominios(dominiosDesdeTexto(ajusteTexto(resultado.ajustes, AJUSTES_GOOGLE.dominios)))
    setClienteId(ajusteTexto(resultado.ajustes, AJUSTES_GOOGLE.clienteId))
    setConfirmado(true)
  }

  if (!disponible) {
    return (
      <p role="alert" className="border-linea-fuerte bg-superficie-aviso text-texto-aviso rounded-tarjeta border-l-4 p-3 text-sm">
        La API todavía no expone las opciones del login con Google (<code>{AJUSTES_GOOGLE.habilitado}</code>,{' '}
        <code>{AJUSTES_GOOGLE.dominios}</code> y <code>{AJUSTES_GOOGLE.clienteId}</code>). Hasta que el board las
        publique en <code>GET /settings</code> no hay nada que configurar desde acá.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Seccion titulo="Login con Google">
        <div className="flex flex-col gap-3">
          {/*
            La fila se acota a `max-w-2xl`: a ancho completo el interruptor termina a mil pixeles
            del texto que explica que hace, y deja de leerse como el control de esa frase.
          */}
          <div className="border-linea rounded-tarjeta flex max-w-2xl items-center justify-between gap-4 border p-3">
            <div>
              <p className="text-texto text-sm font-semibold">
                {habilitado ? 'Encendido' : 'Apagado'}
              </p>
              <p className="text-texto-tenue mt-1 text-xs">
                {habilitado
                  ? 'El equipo puede entrar con su cuenta de Google, siempre que su correo sea de uno de los dominios de abajo.'
                  : 'Nadie puede entrar con Google. El botón no funciona y solo queda el ingreso con correo y contraseña.'}
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={habilitado}
              aria-label="Login con Google"
              onClick={() => { setHabilitado(!habilitado); setConfirmado(false) }}
              /*
               * Apagado lleva borde y relleno propio: `bg-relleno-neutro` pelado sobre la tarjeta
               * clara daba un control del mismo color que su fondo, o sea invisible. Un interruptor
               * que no se ve es un interruptor que no existe.
               */
              className={
                'relative h-6 w-11 shrink-0 cursor-pointer rounded-control border transition-colors duration-150 ease-neo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento ' +
                (habilitado
                  ? 'bg-acento border-acento'
                  : 'bg-relleno-neutro border-linea-fuerte')
              }
            >
              <span
                aria-hidden="true"
                className={
                  'bg-superficie border-linea-fuerte absolute top-0.5 size-5 rounded-control border transition-[left] duration-150 ease-neo ' +
                  (habilitado ? 'left-[1.375rem] border-transparent' : 'left-0.5')
                }
              />
            </button>
          </div>

          {sinDominios && (
            <p role="alert" className="text-texto-peligro text-sm">
              El login está encendido y no hay ningún dominio autorizado. Así, cualquier cuenta de Google entraría:
              agregá al menos uno antes de guardar.
            </p>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Dominios autorizados">
        <div className="flex flex-col gap-3">
          <p className="text-texto-tenue text-sm">
            Solo entra quien tenga un correo de estos dominios. Va la parte de después del arroba, sin el arroba y
            sin comodines.
          </p>

          {dominios.length === 0
            ? <p className="text-texto-sutil text-sm">Ningún dominio autorizado todavía.</p>
            : (
              <ul className="flex flex-wrap gap-2">
                {dominios.map((dominio) => (
                  <li
                    key={dominio}
                    className="border-control-borde bg-control text-texto rounded-chico flex items-center gap-1.5 border py-1 pr-1 pl-2.5 text-sm"
                  >
                    {dominio}
                    <button
                      type="button"
                      onClick={() => { quitarDominio(dominio) }}
                      aria-label={`Quitar ${dominio}`}
                      className="text-texto-tenue hover:bg-hover hover:text-texto rounded-chico p-1 transition-colors duration-150"
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              )}

          <form onSubmit={agregarDominio} className="flex items-end gap-2">
            <Campo etiqueta="Agregar dominio" error={errorDominio ?? undefined} className="flex-1">
              {(props) => (
                <Entrada
                  {...props}
                  value={nuevoDominio}
                  onChange={(evento) => { setNuevoDominio(evento.target.value); setErrorDominio(null) }}
                  placeholder="wiwo.me"
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </Campo>
            <Boton type="submit" variante="secundario" className={errorDominio !== null ? 'mb-5' : ''}>
              Agregar
            </Boton>
          </form>
        </div>
      </Seccion>

      <Seccion titulo="Client ID de Google">
        <Campo
          etiqueta="OAuth Client ID"
          ayuda="Google Cloud Console → Credentials → OAuth client ID de tipo «Web application». No es un secreto: viaja al navegador en cada intento de ingreso."
          error={sinClienteId && errorGuardar !== null ? 'Hace falta el Client ID con el login encendido' : undefined}
        >
          {(props) => (
            <Entrada
              {...props}
              value={clienteId}
              onChange={(evento) => { setClienteId(evento.target.value); setConfirmado(false) }}
              placeholder="1234567890-abc123.apps.googleusercontent.com"
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </Campo>
      </Seccion>

      {errorGuardar !== null && (
        <div role="alert" className="text-texto-peligro flex flex-col gap-1 text-sm">
          <p>{errorGuardar}</p>
          {detallesError.length > 0 && (
            <ul className="list-disc pl-5 text-xs">
              {detallesError.map((detalle) => <li key={detalle}>{detalle}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Boton
          variante="primario"
          cargando={guardando}
          disabled={!sucio}
          onClick={() => { void guardar() }}
        >
          Guardar
        </Boton>
        {!sucio && (
          <span className="text-texto-sutil text-xs">
            {confirmado ? 'Guardado' : 'Sin cambios'}
          </span>
        )}
      </div>
    </div>
  )
}
