'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { CLASES_CASILLA, Entrada } from '@/componentes/formularios/Entrada'
import { pedirSobre } from '@/datos/cliente'
import type { Capacidad } from '@/datos/tipos'
import { normalizarDominio } from '@/dominio/acceso'
import {
  configuracionDesdeApi, cuerpoDeGuardado, etiquetaDeDominio, fraseDeConfiguracion, frasesDeRechazo, hayCambios,
  motivoParaRechazarConfiguracion, motivoParaRechazarDominioDelCliente,
  type ConfiguracionPortalGoogle, type DominioDelPortal
} from '@/dominio/portal-google'

/** `GET|PUT /clients/{id}/portal-google`, con el id ya escapado. */
function rutaDeGoogle (clienteId: number): string {
  return `clients/${encodeURIComponent(String(clienteId))}/portal-google`
}

interface Props {
  clienteId: number
  /** Capacidades sobre `customers`, de `permissions` de `/me`. */
  capacidades: Capacidad[]
}

/**
 * Con que cuenta de Google entran los contactos de este cliente al portal.
 *
 * === QUE DECIDE ===
 *
 * La existencia de esta configuracion es el interruptor del cliente: sin Client ID ni dominios, el
 * portal de este cliente es el de siempre. Con ella, el contacto cuyo correo cae en uno de los
 * dominios ve el boton de Google al entrar (y la contraseña como alternativa). Cada cliente trae su
 * propia aplicacion de Google, por eso el Client ID es suyo. No hay Client Secret: el acceso usa el
 * ID token de Google y no lo necesita.
 *
 * === DOMINIOS Y SUBDOMINIOS ===
 *
 * «Incluir subdominios» hace que `wom.cl` cubra tambien `consultor.wom.cl`. Gana siempre el dominio
 * mas especifico, y la API rechaza que dos clientes se solapen, que se registre un sufijo publico
 * (`cl`, `com.cl`) o un correo gratuito: esos errores llegan aca como el mensaje del guardado.
 *
 * === EL INTERRUPTOR GLOBAL MANDA ===
 *
 * Con el acceso con Google apagado para todo el sistema (Administracion → Acceso) lo guardado aca no
 * tiene efecto, y la seccion lo dice. «Exigir Google» cierra ademas la contraseña y el enlace de
 * acceso para este cliente; solo vale con el interruptor global encendido.
 *
 * Sin `customers.edit` se dibuja en solo lectura, igual que el codigo por correo.
 *
 * @param clienteId el cliente que se esta mirando
 * @param capacidades capacidades sobre `customers`
 */
export function ClienteGooglePortal ({ clienteId, capacidades }: Props) {
  const puedeEditar = capacidades.includes('edit')
  const avisar = useAviso()

  const [guardado, setGuardado] = useState<ConfiguracionPortalGoogle | null>(null)
  const [clientId, setClientId] = useState('')
  const [dominios, setDominios] = useState<DominioDelPortal[]>([])
  const [exigir, setExigir] = useState(false)
  const [nuevoDominio, setNuevoDominio] = useState('')
  const [nuevoConSubdominios, setNuevoConSubdominios] = useState(false)
  const [errorDominio, setErrorDominio] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Pone el formulario igual a lo que la API tiene guardado. */
  function cargarEnFormulario (config: ConfiguracionPortalGoogle): void {
    setGuardado(config)
    setClientId(config.google_client_id)
    setDominios(config.dominios)
    setExigir(config.exigir_google)
  }

  useEffect(() => {
    const aborto = new AbortController()

    void pedirSobre<unknown>(rutaDeGoogle(clienteId), aborto.signal)
      .then((sobre) => {
        if (aborto.signal.aborted) return

        cargarEnFormulario(configuracionDesdeApi(sobre.data))
      })
      .catch((fallo: unknown) => {
        if (aborto.signal.aborted) return

        setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar el acceso con Google de este cliente.')
      })

    return () => { aborto.abort() }
  }, [clienteId])

  /** Agrega el dominio escrito a la lista, pendiente de guardar. */
  function agregarDominio (evento: React.FormEvent): void {
    evento.preventDefault()

    const motivo = motivoParaRechazarDominioDelCliente(nuevoDominio, dominios)

    if (motivo !== null) {
      setErrorDominio(motivo)

      return
    }

    setDominios([...dominios, { dominio: normalizarDominio(nuevoDominio), incluir_subdominios: nuevoConSubdominios }])
    setNuevoDominio('')
    setNuevoConSubdominios(false)
    setErrorDominio(null)
  }

  /** Enciende o apaga los subdominios de un dominio ya agregado. */
  function cambiarSubdominios (dominio: string, incluir: boolean): void {
    setDominios(dominios.map((d) => d.dominio === dominio ? { ...d, incluir_subdominios: incluir } : d))
  }

  function quitarDominio (dominio: string): void {
    const quedan = dominios.filter((d) => d.dominio !== dominio)

    setDominios(quedan)
    // Sin dominios no hay a quien exigirle Google: la casilla se apaga sola para no guardar un bloqueo vacio.
    if (quedan.length === 0) setExigir(false)
  }

  /** Guarda con un PUT y se queda con lo que devuelve la API, no con lo que se mando. */
  async function guardar (evento: React.FormEvent): Promise<void> {
    evento.preventDefault()
    if (enviando) return

    if (nuevoDominio.trim() !== '') {
      setErrorDominio('Agrega el dominio que estás escribiendo, o borra el campo, antes de guardar.')

      return
    }

    const motivo = motivoParaRechazarConfiguracion(clientId, dominios, exigir)

    if (motivo !== null) {
      setError(motivo)

      return
    }

    setEnviando(true)
    setError(null)

    const resultado = await escribirEnBff<unknown>(rutaDeGoogle(clienteId), 'PUT', cuerpoDeGuardado(clientId, dominios, exigir))

    setEnviando(false)

    if (!resultado.ok) {
      const frases = frasesDeRechazo(resultado.detalles, dominios)

      setError(frases.length > 0 ? frases.join(' ') : resultado.mensaje)

      return
    }

    const nueva = configuracionDesdeApi(resultado.datos)

    cargarEnFormulario(nueva)
    avisar.exito(nueva.configurado ? 'Acceso con Google guardado.' : 'Se quitó el acceso con Google de este cliente.')
  }

  if (error !== null && guardado === null) {
    return (
      <Seccion>
        <AvisoEnLinea variante="error" mensaje={error} className="text-sm" />
      </Seccion>
    )
  }

  if (guardado === null) {
    return (
      <Seccion>
        <p className="text-texto-tenue text-sm">Cargando la configuración…</p>
      </Seccion>
    )
  }

  const avisos = <AvisosDeGoogle config={guardado} />

  if (!puedeEditar) {
    return (
      <Seccion>
        <p className="text-texto text-sm">{fraseDeConfiguracion(guardado)}</p>
        {guardado.dominios.length > 0 && (
          <p className="text-texto-tenue text-sm">
            Dominios: {guardado.dominios.map(etiquetaDeDominio).join(', ')}.
          </p>
        )}
        {avisos}
      </Seccion>
    )
  }

  const sucio = hayCambios(guardado, clientId, dominios, exigir)

  return (
    <Seccion>
      <form onSubmit={(e) => { void guardar(e) }} className="flex flex-col gap-4">
        {avisos}

        <Campo
          etiqueta="Client ID de Google"
          ayuda="El que crea el cliente en su Google Cloud Console (credencial «Web application»). No es un secreto: no hace falta el Client Secret."
        >
          {(props) => (
            <Entrada
              {...props}
              value={clientId}
              disabled={enviando}
              onChange={(evento) => { setClientId(evento.target.value); setError(null) }}
              placeholder="1234567890-abc123.apps.googleusercontent.com"
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </Campo>

        <div className="flex flex-col gap-2">
          <p className="text-texto text-sm font-medium">Dominios de correo del cliente</p>

          {dominios.length === 0
            ? <p className="text-texto-sutil text-sm">Ningún dominio todavía.</p>
            : (
              <ul className="flex flex-col gap-2">
                {dominios.map((d) => (
                  <FilaDeDominio
                    key={d.dominio}
                    dominio={d}
                    deshabilitado={enviando}
                    alCambiarSubdominios={(incluir) => { cambiarSubdominios(d.dominio, incluir) }}
                    alQuitar={() => { quitarDominio(d.dominio) }}
                  />
                ))}
              </ul>
              )}

          <div className="flex flex-wrap items-start gap-2">
            <Campo etiqueta="Agregar dominio" error={errorDominio ?? undefined} className="min-w-48 flex-1">
              {(props) => (
                <Entrada
                  {...props}
                  value={nuevoDominio}
                  disabled={enviando}
                  onChange={(evento) => { setNuevoDominio(evento.target.value); setErrorDominio(null) }}
                  onKeyDown={(evento) => { if (evento.key === 'Enter') agregarDominio(evento) }}
                  placeholder="wom.cl"
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </Campo>

            <label className="text-texto mt-7 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={nuevoConSubdominios}
                disabled={enviando}
                onChange={(evento) => { setNuevoConSubdominios(evento.target.checked) }}
                className={CLASES_CASILLA}
              />
              Incluir subdominios
            </label>

            <Boton type="button" variante="secundario" tamano="chico" disabled={enviando} onClick={agregarDominio} className="mt-7">
              Agregar
            </Boton>
          </div>

          <p className="text-texto-tenue text-xs">
            Va la parte de después del arroba, sin comodines. Con «Incluir subdominios», <code>wom.cl</code> cubre
            también <code>consultor.wom.cl</code>.
          </p>
        </div>

        <fieldset disabled={enviando || dominios.length === 0} className="flex min-w-0 flex-col gap-1">
          <label htmlFor="cliente-google-exigir" className="text-texto flex items-center gap-2 text-sm">
            <input
              id="cliente-google-exigir"
              type="checkbox"
              checked={exigir}
              onChange={(evento) => { setExigir(evento.target.checked); setError(null) }}
              aria-describedby="cliente-google-exigir-ayuda"
              className={CLASES_CASILLA}
            />
            Exigir Google: sin contraseña ni enlace de acceso
          </label>
          <p id="cliente-google-exigir-ayuda" className="text-texto-tenue text-xs">
            Los contactos de estos dominios solo podrán entrar con su cuenta de Google. Déjalo apagado hasta confirmar
            que todos pueden entrar con Google: mientras tanto, la contraseña sirve de respaldo si Google falla.
          </p>
        </fieldset>

        {error !== null && <AvisoEnLinea variante="error" mensaje={error} className="text-sm" />}

        <div className="flex flex-wrap items-center gap-3">
          <Boton type="submit" tamano="chico" variante="primario" disabled={enviando || !sucio} cargando={enviando}>
            Guardar acceso con Google
          </Boton>
          <p className="text-texto-sutil text-xs">
            Para quitarlo, vacía el Client ID y los dominios y guarda.
          </p>
        </div>
      </form>
    </Seccion>
  )
}

/** Una fila de la lista de dominios, con su casilla de subdominios y el boton para quitarla. */
function FilaDeDominio ({ dominio, deshabilitado, alCambiarSubdominios, alQuitar }: {
  dominio: DominioDelPortal
  deshabilitado: boolean
  alCambiarSubdominios: (incluir: boolean) => void
  alQuitar: () => void
}) {
  return (
    <li className="border-control-borde bg-control rounded-chico flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border py-1.5 pr-1.5 pl-3">
      <span className="text-texto text-sm break-all">{dominio.dominio}</span>

      <div className="flex items-center gap-3">
        <label className="text-texto-tenue flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={dominio.incluir_subdominios}
            disabled={deshabilitado}
            onChange={(evento) => { alCambiarSubdominios(evento.target.checked) }}
            className={CLASES_CASILLA}
          />
          Incluir subdominios
        </label>

        <button
          type="button"
          disabled={deshabilitado}
          onClick={alQuitar}
          aria-label={`Quitar ${dominio.dominio}`}
          className="text-texto-tenue hover:bg-hover hover:text-texto rounded-chico p-1 transition-colors duration-rapida ease-neo"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>
    </li>
  )
}

/**
 * Lo que el equipo tiene que saber antes de confiar en esta configuracion.
 *
 * - El interruptor global apagado: lo guardado no tiene efecto.
 * - Contactos sin cobertura: con Google encendido siguen entrando con contraseña, salvo que se exija.
 */
function AvisosDeGoogle ({ config }: { config: ConfiguracionPortalGoogle }) {
  const sin = config.contactos_sin_cobertura

  return (
    <>
      {!config.global_habilitado && (
        <AvisoEnLinea
          variante="aviso"
          mensaje="El acceso con Google al portal está apagado para todos los clientes. Lo que guardes aquí no tendrá efecto hasta que se encienda en Administración → Acceso."
          className="text-sm"
        />
      )}

      {config.configurado && sin > 0 && (
        <AvisoEnLinea
          variante="aviso"
          mensaje={config.exigir_google
            ? `${sin === 1 ? '1 contacto activo tiene' : `${sin} contactos activos tienen`} un correo fuera de estos dominios y no podrá${sin === 1 ? '' : 'n'} entrar al portal mientras se exija Google.`
            : `${sin === 1 ? '1 contacto activo tiene' : `${sin} contactos activos tienen`} un correo fuera de estos dominios: no verá${sin === 1 ? '' : 'n'} el botón de Google y entrará${sin === 1 ? '' : 'n'} con su contraseña.`}
          className="text-sm"
        />
      )}
    </>
  )
}

/** El marco de la seccion, uno solo para los estados en que se dibuja. */
function Seccion ({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 flex flex-col gap-3 border p-5">
      <div>
        <h3 className="font-titular text-texto text-sm font-semibold">Portal: acceso con Google</h3>
        <p className="text-texto-tenue mt-1 text-xs">
          Los contactos de este cliente entran al portal con su cuenta de Google de trabajo, además de su contraseña.
        </p>
      </div>

      {children}
    </section>
  )
}
