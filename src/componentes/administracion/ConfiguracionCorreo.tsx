'use client'

import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Filas, Seccion } from '@/componentes/presentadores/Ficha'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { ConfiguracionCorreo as ConfiguracionCorreoTipo, ModoCorreo, PruebaDeAviso } from '@/datos/recursos'

const ETIQUETA_MODO: Record<ModoCorreo, string> = {
  apagado: 'Apagado',
  prueba: 'Prueba',
  real: 'Real'
}

const AYUDA_MODO: Record<ModoCorreo, string> = {
  apagado: 'Ningún correo sale de la API de Ops. Es el modo con el que se mergea toda escritura nueva.',
  prueba: 'Los correos que compone la API salen, pero todos van al buzón de prueba de abajo — nunca al destinatario real.',
  real: 'Los correos salen a su destinatario real. Recién acá alguien de afuera de este equipo puede recibir uno.'
}

interface PropsConfiguracionCorreo {
  inicial: ConfiguracionCorreoTipo
}

/**
 * El interruptor de correo de la ola 1: `GET|PUT /notifications/settings` y `POST /notifications/test`.
 *
 * La lógica de qué modo hace qué vive en el backend (`Nucleo\EfectosExternos`); esta pantalla solo la
 * consume. Lo único que decide del lado del cliente es la advertencia adicional al pasar a `real`,
 * porque es el único de los tres modos que puede salir a buzones de gente ajena a este equipo.
 */
export function ConfiguracionCorreo ({ inicial }: PropsConfiguracionCorreo): ReactElement {
  const [guardada, setGuardada] = useState(inicial)
  const [modo, setModo] = useState<ModoCorreo>(inicial.email_mode)
  const [destino, setDestino] = useState(inicial.test_recipient ?? '')
  const [confirmarReal, setConfirmarReal] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)

  const [probando, setProbando] = useState(false)
  const [resultadoPrueba, setResultadoPrueba] = useState<PruebaDeAviso | null>(null)
  const [errorPrueba, setErrorPrueba] = useState<string | null>(null)

  const sucio = modo !== guardada.email_mode || destino !== (guardada.test_recipient ?? '')
  const faltaDestino = modo === 'prueba' && destino.trim() === ''

  /** Guarda el modo y, si aplica, el buzón de prueba. Exige confirmar antes de dejar pasar `real`. */
  async function guardar (): Promise<void> {
    if (faltaDestino) return

    if (modo === 'real' && !confirmarReal) {
      setConfirmarReal(true)
      return
    }

    setGuardando(true)
    setErrorGuardar(null)

    const cuerpo: { email_mode: ModoCorreo, test_recipient?: string } = { email_mode: modo }
    if (modo === 'prueba') cuerpo.test_recipient = destino.trim()

    const resultado = await escribirEnBff<ConfiguracionCorreoTipo>('notifications/settings', 'PUT', cuerpo)

    setGuardando(false)

    if (!resultado.ok) {
      setErrorGuardar(resultado.mensaje)
      return
    }

    setGuardada(resultado.datos)
    setModo(resultado.datos.email_mode)
    setDestino(resultado.datos.test_recipient ?? '')
    setConfirmarReal(false)
  }

  /** Manda un aviso de prueba a quien mira. Es la única ruta del módulo que puede hacer salir un correo. */
  async function probar (): Promise<void> {
    setProbando(true)
    setErrorPrueba(null)
    setResultadoPrueba(null)

    const resultado = await escribirEnBff<PruebaDeAviso>('notifications/test', 'POST', {})

    setProbando(false)

    if (!resultado.ok) {
      setErrorPrueba(resultado.mensaje)
      return
    }

    setResultadoPrueba(resultado.datos)
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="border-linea-fuerte bg-superficie-aviso text-texto-aviso rounded-tarjeta border-l-4 p-3 text-sm">
        {guardada.warning}
      </p>

      <Seccion titulo="Estado actual">
        <Filas
          datos={[
            { etiqueta: 'Modo', valor: ETIQUETA_MODO[guardada.email_mode] },
            { etiqueta: 'Remitente', valor: guardada.sender },
            { etiqueta: 'Buzón de prueba', valor: guardada.test_recipient ?? '— sin configurar —' }
          ]}
        />
      </Seccion>

      <Seccion titulo="Cambiar el modo">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Modo de correo">
            {inicial.email_modes.map((opcion) => (
              <button
                key={opcion}
                type="button"
                role="radio"
                aria-checked={modo === opcion}
                onClick={() => { setModo(opcion); setConfirmarReal(false) }}
                className={
                  'rounded-tarjeta border p-3 text-left transition-colors duration-150 ' +
                  (modo === opcion
                    ? 'border-acento bg-acento-suave'
                    : 'border-control-borde bg-control hover:bg-hover')
                }
              >
                <span className="text-texto text-sm font-semibold">{ETIQUETA_MODO[opcion]}</span>
                <p className="text-texto-tenue mt-1 text-xs">{AYUDA_MODO[opcion]}</p>
              </button>
            ))}
          </div>

          {modo === 'prueba' && (
            <Campo
              etiqueta="Buzón de prueba"
              requerido
              error={faltaDestino ? 'Hace falta un buzón para el modo de prueba' : undefined}
            >
              {(props) => (
                <Entrada
                  {...props}
                  type="email"
                  value={destino}
                  onChange={(evento) => { setDestino(evento.target.value) }}
                  placeholder="alguien@wiwo.me"
                />
              )}
            </Campo>
          )}

          {confirmarReal && (
            <p role="alert" className="text-texto-peligro text-sm">
              Este modo manda correo real a gente ajena a este equipo. Toca «Guardar» de nuevo para confirmarlo.
            </p>
          )}

          {errorGuardar !== null && <p role="alert" className="text-texto-peligro text-sm">{errorGuardar}</p>}

          <div className="flex items-center gap-3">
            <Boton
              variante="primario"
              cargando={guardando}
              disabled={!sucio || faltaDestino}
              onClick={() => { void guardar() }}
            >
              {modo === 'real' && confirmarReal ? 'Confirmar y guardar' : 'Guardar'}
            </Boton>
            {!sucio && <span className="text-texto-sutil text-xs">Sin cambios</span>}
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Probar">
        <div className="flex flex-col gap-3">
          <p className="text-texto-tenue text-sm">
            Manda un aviso de prueba a tu propia campana y, según el modo de arriba, intenta el correo. Es la
            forma de contestar «¿por qué no me llegó?» sin provocar una escritura real.
          </p>

          <div>
            <Boton variante="secundario" cargando={probando} onClick={() => { void probar() }}>
              Probar ahora
            </Boton>
          </div>

          {errorPrueba !== null && <p role="alert" className="text-texto-peligro text-sm">{errorPrueba}</p>}

          {resultadoPrueba !== null && (
            <div className="border-linea rounded-tarjeta border p-3">
              <Filas
                datos={[
                  { etiqueta: 'Campana', valor: 'Escrita (#' + String(resultadoPrueba.notification_id) + ')' },
                  { etiqueta: 'Modo de correo', valor: ETIQUETA_MODO[resultadoPrueba.email_mode] },
                  {
                    etiqueta: 'Correo',
                    valor: resultadoPrueba.email_sent
                      ? 'Salió' + (resultadoPrueba.email_delivered_to !== null ? ' a ' + resultadoPrueba.email_delivered_to : '')
                      : 'No salió'
                  }
                ]}
              />
              <div className="mt-2 flex gap-2">
                <Insignia tono={resultadoPrueba.email_sent ? 'exito' : 'neutro'} tamano="chico">
                  {resultadoPrueba.email_sent ? 'Correo enviado' : 'Correo no enviado'}
                </Insignia>
              </div>
            </div>
          )}
        </div>
      </Seccion>
    </div>
  )
}
