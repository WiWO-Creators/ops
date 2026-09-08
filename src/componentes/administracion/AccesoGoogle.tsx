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
  motivoParaRechazarDominio, normalizarDominio, tieneAjustesDeGoogle,
  tieneAjustesDeAutoalta, autoaltaSinDominios
} from '@/dominio/acceso'
import type { Ajustes, CambiosDeAjustes } from '@/datos/recursos'

/** Nombre legible de cada clave, para el detalle del 422: la API contesta con el nombre tecnico. */
const ETIQUETA_DE_CLAVE: Record<string, string> = {
  [AJUSTES_GOOGLE.habilitado]: 'Login con Google',
  [AJUSTES_GOOGLE.dominios]: 'Dominios autorizados',
  [AJUSTES_GOOGLE.clienteId]: 'Client ID de Google',
  [AJUSTES_GOOGLE.autoaltaHabilitada]: 'Alta automática con Google',
  [AJUSTES_GOOGLE.autoaltaDominios]: 'Dominios de alta automática'
}

interface PropsAccesoGoogle {
  inicial: Ajustes
}

/**
 * Configuracion del login con Google del equipo: el interruptor, los dominios autorizados y el
 * Client ID.
 *
 * Son opciones de `tbloptions` del grupo `acceso`, y se escriben con un solo
 * `PATCH /settings` que lleva unicamente lo que cambio. Que sea un solo pedido importa: la API
 * rechaza el cuerpo entero si una clave no pasa la whitelist, asi que o entran todos los cambios o no
 * entra ninguno, y nunca queda el login prendido con la lista de dominios a medio guardar.
 *
 * La lista de dominios se edita como chips y no como un texto separado por comas a proposito: la
 * coma es un separador invisible: quien escribe no ve cuando le sobra una y termina con un dominio
 * vacio en una lista que decide quien puede entrar. Aca cada dominio se valida al agregarse y la
 * serializacion a la cadena que espera la API ocurre recien al guardar.
 * @param inicial Ajustes actuales publicados por la API.
 * @returns Panel de configuración y mensajes de validación.
 */
export function AccesoGoogle ({ inicial }: PropsAccesoGoogle): ReactElement {
  const [guardada, setGuardada] = useState(inicial)
  const [habilitado, setHabilitado] = useState(() => ajusteBool(inicial, AJUSTES_GOOGLE.habilitado))
  const [dominios, setDominios] = useState(() => dominiosDesdeTexto(ajusteTexto(inicial, AJUSTES_GOOGLE.dominios)))
  const [clienteId, setClienteId] = useState(() => ajusteTexto(inicial, AJUSTES_GOOGLE.clienteId))

  const [autoalta, setAutoalta] = useState(() => ajusteBool(inicial, AJUSTES_GOOGLE.autoaltaHabilitada))
  const [dominiosAutoalta, setDominiosAutoalta] = useState(() => dominiosDesdeTexto(ajusteTexto(inicial, AJUSTES_GOOGLE.autoaltaDominios)))
  const [nuevoDominioAutoalta, setNuevoDominioAutoalta] = useState('')
  const [errorDominioAutoalta, setErrorDominioAutoalta] = useState<string | null>(null)

  const [nuevoDominio, setNuevoDominio] = useState('')
  const [errorDominio, setErrorDominio] = useState<string | null>(null)

  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)
  const [detallesError, setDetallesError] = useState<string[]>([])
  const [confirmado, setConfirmado] = useState(false)

  const disponible = tieneAjustesDeGoogle(guardada)
  const autoaltaDisponible = tieneAjustesDeAutoalta(guardada)
  const autoaltaGuardada = ajusteBool(guardada, AJUSTES_GOOGLE.autoaltaHabilitada)
  const dominiosAutoaltaGuardados = ajusteTexto(guardada, AJUSTES_GOOGLE.autoaltaDominios)
  const textoDominiosAutoalta = dominiosATexto(dominiosAutoalta)
  const sinDominiosAutoalta = autoaltaSinDominios(autoalta, dominiosAutoalta)
  const habilitadoGuardado = ajusteBool(guardada, AJUSTES_GOOGLE.habilitado)
  const dominiosGuardados = ajusteTexto(guardada, AJUSTES_GOOGLE.dominios)
  const clienteIdGuardado = ajusteTexto(guardada, AJUSTES_GOOGLE.clienteId)

  const textoDominios = dominiosATexto(dominios)
  const sucio = habilitado !== habilitadoGuardado ||
    textoDominios !== dominiosGuardados ||
    clienteId.trim() !== clienteIdGuardado ||
    autoalta !== autoaltaGuardada || textoDominiosAutoalta !== dominiosAutoaltaGuardados

  // Prender el login sin dominios autorizados impide que cualquier cuenta de Google
  // ingrese. Se bloquea el guardado, no se corrige solo, porque la decision es de quien administra.
  const sinDominios = habilitado && dominios.length === 0
  const sinClienteId = habilitado && clienteId.trim() === ''

  /**
   * Agrega un dominio validado a la lista elegida.
   * @param evento Envío del formulario.
   * @param paraAutoalta Si corresponde a la lista propia de alta automática.
   * @returns Sin valor; actualiza el formulario o su error.
   */
  function agregarDominio (evento: FormEvent, paraAutoalta = false): void {
    evento.preventDefault()
    const valor = paraAutoalta ? nuevoDominioAutoalta : nuevoDominio
    const lista = paraAutoalta ? dominiosAutoalta : dominios
    const mostrarError = paraAutoalta ? setErrorDominioAutoalta : setErrorDominio
    const motivo = motivoParaRechazarDominio(valor, lista)
    if (motivo !== null) {
      mostrarError(motivo)
      return
    }
    const actualizar = paraAutoalta ? setDominiosAutoalta : setDominios
    const limpiarCampo = paraAutoalta ? setNuevoDominioAutoalta : setNuevoDominio
    actualizar([...lista, normalizarDominio(valor)])
    limpiarCampo('')
    mostrarError(null)
    setConfirmado(false)
  }

  /**
   * Quita un dominio de la lista elegida, pendiente de guardar.
   * @param dominio Dominio a retirar.
   * @param paraAutoalta Si corresponde a la lista propia de alta automática.
   * @returns Sin valor; actualiza el formulario.
   */
  function quitarDominio (dominio: string, paraAutoalta = false): void {
    const lista = paraAutoalta ? dominiosAutoalta : dominios
    const actualizar = paraAutoalta ? setDominiosAutoalta : setDominios
    actualizar(lista.filter((actual) => actual !== dominio))
    const mostrarError = paraAutoalta ? setErrorDominioAutoalta : setErrorDominio
    mostrarError(null)
    setConfirmado(false)
  }

  /**
   * Manda al `PATCH` solo las claves que cambiaron.
   *
   * Antes revisa lo que la API no puede revisar por si sola: que no quede el login prendido sin
   * dominios ni sin Client ID —las dos formas de impedir el ingreso— y que no se pierda un
   * dominio a medio escribir en el campo de agregar, que es lo que pasa cuando alguien escribe y va
   * directo a «Guardar».
   * @returns Promesa sin valor; muestra confirmación o el error devuelto por la API.
   */
  async function guardar (): Promise<void> {
    if (nuevoDominio.trim() !== '') {
      setErrorDominio('Agrega el dominio que estás escribiendo, o borra el campo, antes de guardar.')
      return
    }

    if (nuevoDominioAutoalta.trim() !== '') {
      setErrorDominioAutoalta('Agrega el dominio que estás escribiendo, o borra el campo, antes de guardar.')
      return
    }

    if (sinDominiosAutoalta) {
      setErrorGuardar('Agrega al menos un dominio de alta automática o apaga el alta automática.')
      setDetallesError([])
      return
    }

    if (sinDominios) {
      setErrorGuardar('Con el login encendido y la lista vacía nadie podrá ingresar con Google. Agrega al menos un dominio o apaga el login.')
      setDetallesError([])
      return
    }

    if (sinClienteId) {
      setErrorGuardar('Sin Client ID el botón de Google no puede funcionar. Pega el Client ID o apaga el login.')
      setDetallesError([])
      return
    }

    const cambios: CambiosDeAjustes = {}
    if (habilitado !== habilitadoGuardado) cambios[AJUSTES_GOOGLE.habilitado] = habilitado
    if (textoDominios !== dominiosGuardados) cambios[AJUSTES_GOOGLE.dominios] = textoDominios
    if (clienteId.trim() !== clienteIdGuardado) cambios[AJUSTES_GOOGLE.clienteId] = clienteId.trim()

    if (autoalta !== autoaltaGuardada) cambios[AJUSTES_GOOGLE.autoaltaHabilitada] = autoalta
    if (textoDominiosAutoalta !== dominiosAutoaltaGuardados) cambios[AJUSTES_GOOGLE.autoaltaDominios] = textoDominiosAutoalta

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
    setAutoalta(ajusteBool(resultado.ajustes, AJUSTES_GOOGLE.autoaltaHabilitada))
    setDominiosAutoalta(dominiosDesdeTexto(ajusteTexto(resultado.ajustes, AJUSTES_GOOGLE.autoaltaDominios)))
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
              El login está encendido y no hay ningún dominio autorizado. Nadie podrá ingresar con Google:
              agrega al menos uno antes de guardar.
            </p>
          )}
        </div>
      </Seccion>

      {autoaltaDisponible && (
        <Seccion titulo="Alta automática con Google">
          <div className="flex max-w-2xl flex-col gap-3">
            <label className="border-linea rounded-tarjeta flex items-center justify-between gap-4 border p-3 text-sm font-semibold">
              Crear cuentas al ingresar con Google
              <input
                type="checkbox"
                role="switch"
                checked={autoalta}
                onChange={(evento) => { setAutoalta(evento.target.checked); setConfirmado(false) }}
                className="size-5 shrink-0 accent-acento"
              />
            </label>
            <p className="text-texto-tenue text-sm">
              Crea una cuenta sin privilegios de administración si el correo aún no existe.
              El dominio también debe estar autorizado para el login con Google.
            </p>
            {sinDominiosAutoalta && (
              <p role="alert" className="text-texto-peligro text-sm">
                Agrega al menos un dominio de alta automática o apaga el alta automática antes de guardar.
              </p>
            )}
          </div>
        </Seccion>
      )}

      {[
        { titulo: 'Dominios autorizados', descripcion: 'Solo entra quien tenga un correo de estos dominios.',
          dominios, nuevoDominio, errorDominio, setNuevoDominio, setErrorDominio, paraAutoalta: false },
        ...(autoaltaDisponible ? [{ titulo: 'Dominios de alta automática',
          descripcion: 'Solo se crean cuentas para estos dominios. Esta lista es independiente de los dominios autorizados para el login.',
          dominios: dominiosAutoalta, nuevoDominio: nuevoDominioAutoalta, errorDominio: errorDominioAutoalta,
          setNuevoDominio: setNuevoDominioAutoalta, setErrorDominio: setErrorDominioAutoalta, paraAutoalta: true }] : [])
      ].map(({ titulo, descripcion, dominios, nuevoDominio, errorDominio, setNuevoDominio, setErrorDominio, paraAutoalta }) => (
      <Seccion key={titulo} titulo={titulo}>
        <div className="flex flex-col gap-3">
          <p className="text-texto-tenue text-sm">
            {descripcion} Va la parte de después del arroba, sin el arroba y sin comodines.
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
                      onClick={() => { quitarDominio(dominio, paraAutoalta) }}
                      aria-label={`Quitar ${dominio} de ${titulo.toLowerCase()}`}
                      className="text-texto-tenue hover:bg-hover hover:text-texto rounded-chico p-1 transition-colors duration-150"
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              )}

          <form onSubmit={(evento) => { agregarDominio(evento, paraAutoalta) }} className="flex items-end gap-2">
            <Campo etiqueta={paraAutoalta ? 'Agregar dominio de alta automática' : 'Agregar dominio'} error={errorDominio ?? undefined} className="flex-1">
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

      ))}

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
