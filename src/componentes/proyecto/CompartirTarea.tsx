'use client'

import { Check, Copy, Share2 } from 'lucide-react'
import { useCallback, useState, type ReactElement } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Cargando, SinPermiso } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { mensajeDeRespuesta, pedirRespuesta } from '@/datos/cliente'
import { GLOSARIO } from '@/dominio/glosario'
import { urlDeEnlacePublico } from '@/lib/enlace-publico'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo,
  DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import type { EnlaceProcesoGenerado, EstadoEnlaceProceso } from '@/datos/recursos'
import type { Sobre } from '@/datos/tipos'

/** Estado de la pantalla del dialogo. El error es texto listo para mostrar, no un envelope. */
type Estado =
  | { fase: 'cargando' }
  | { fase: 'sinPermiso' }
  | { fase: 'error', mensaje: string }
  /**
   * `url` solo existe si el enlace se acuño en esta misma sesion del dialogo: de la base sale el
   * `sha256` y nada mas, asi que un enlace vivo generado ayer se puede revocar pero no volver a leer.
   */
  | { fase: 'listo', enlace: EstadoEnlaceProceso, url: string | null }

const PROCESO = GLOSARIO.proceso.singular.toLowerCase()

/**
 * Boton "Compartir" del detalle de una Tarea, con su dialogo.
 *
 * Trae el trigger adentro para que el detalle lo monte con una linea. El estado se pide al **abrir**
 * y no al montar: el detalle ya hace dos peticiones y la mayoria de las veces nadie va a compartir.
 *
 * **El `GET` es el que pinta el estado; el `POST` solo se llama cuando la persona pide generar.**
 * Cada `POST` acuña un token nuevo y revoca el anterior, asi que usarlo para "averiguar si hay
 * enlace" romperia el que ya se mando por chat. Es la trampa del endpoint y esta dicha en pantalla.
 *
 * **El permiso lo decide la API** (`tasks.edit` mas visibilidad por fila). No se filtra el boton
 * contra `/me` porque el detalle se monta desde media docena de pantallas y ninguna le pasa
 * capacidades hoy: un 403 se muestra como `SinPermiso` dentro del dialogo, que es el mapa de codigos
 * que ya usa el resto del producto.
 */
export function CompartirTarea ({ procesoId }: { procesoId: number }): ReactElement {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  const [enviando, setEnviando] = useState(false)
  const [confirmandoRevocar, setConfirmandoRevocar] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const cargarEstado = useCallback(async () => {
    setEstado({ fase: 'cargando' })
    setEstado(await leerEstado(procesoId))
  }, [procesoId])

  /**
   * Abrir pide el estado; cerrar tira todo, incluida la URL en claro.
   *
   * No se conserva entre aperturas a proposito: si la persona cerro el dialogo, el token ya se copio
   * o se perdio, y guardarlo en memoria solo alarga la vida de un secreto sin ninguna ganancia.
   */
  function alCambiarApertura (abierto: boolean): void {
    setEnviando(false)
    setConfirmandoRevocar(false)
    setCopiado(false)

    if (abierto) void cargarEstado()
    else setEstado({ fase: 'cargando' })
  }

  async function generar (): Promise<void> {
    setEnviando(true)
    setConfirmandoRevocar(false)
    setCopiado(false)

    const resultado = await escribirEnBff<EnlaceProcesoGenerado>(`tasks/${procesoId}/share`, 'POST')

    setEnviando(false)

    if (!resultado.ok) {
      setEstado({ fase: 'error', mensaje: resultado.mensaje })
      return
    }

    setEstado({
      fase: 'listo',
      enlace: { shared: true, expires_at: resultado.datos.expires_at },
      url: urlDeEnlacePublico(window.location.origin, resultado.datos.token)
    })
  }

  async function revocar (): Promise<void> {
    setEnviando(true)
    setCopiado(false)

    const resultado = await escribirEnBff(`tasks/${procesoId}/share`, 'DELETE')

    setEnviando(false)
    setConfirmandoRevocar(false)

    if (!resultado.ok) {
      setEstado({ fase: 'error', mensaje: resultado.mensaje })
      return
    }

    setEstado({ fase: 'listo', enlace: { shared: false, expires_at: null }, url: null })
  }

  /**
   * Copia la URL al portapapeles.
   *
   * El campo queda de solo lectura y seleccionable igual: donde el portapapeles no esta disponible
   * —contexto inseguro, permiso denegado— la persona todavia puede seleccionar y copiar a mano, y el
   * fallo se dice en vez de fingir que copio.
   */
  async function copiar (url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
    } catch {
      setEstado({ fase: 'error', mensaje: 'No pudimos copiar el enlace. Seleccionalo y copialo a mano.' })
    }
  }

  return (
    <Dialogo onOpenChange={alCambiarApertura}>
      <DisparadorDialogo asChild>
        <Boton variante="secundario" tamano="chico">
          <Share2 size={14} strokeWidth={2} aria-hidden="true" />
          Compartir
        </Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        ancho="medio"
        titulo={`Compartir esta ${PROCESO}`}
        descripcion={`Cualquiera con el enlace puede ver esta ${PROCESO}, sin cuenta ni contraseña. No caduca al abrirse: vive 30 días o hasta que lo revoques desde acá.`}
      >
        {estado.fase === 'cargando' && <Cargando alto="min-h-32" mensaje="Buscando el enlace…" />}

        {estado.fase === 'sinPermiso' && <SinPermiso />}

        {estado.fase === 'error' && (
          <div className="flex flex-col gap-3">
            <p role="alert" className="text-texto-peligro text-sm">{estado.mensaje}</p>
            <div className="flex justify-end">
              <Boton variante="secundario" tamano="chico" onClick={() => { void cargarEstado() }}>
                Reintentar
              </Boton>
            </div>
          </div>
        )}

        {estado.fase === 'listo' && (
          <div className="flex flex-col gap-4">
            {estado.url !== null && (
              <div className="flex items-center gap-2">
                <Entrada
                  readOnly
                  value={estado.url}
                  aria-label="Enlace público"
                  onFocus={(evento) => { evento.currentTarget.select() }}
                  className="font-mono text-xs"
                />
                <Boton variante="secundario" tamano="chico" onClick={() => { void copiar(estado.url ?? '') }}>
                  {copiado
                    ? <Check size={14} strokeWidth={2} aria-hidden="true" />
                    : <Copy size={14} strokeWidth={2} aria-hidden="true" />}
                  {copiado ? 'Copiado' : 'Copiar'}
                </Boton>
              </div>
            )}

            <p className="text-texto-tenue text-sm">
              {textoDeEstado(estado)}
            </p>

            {estado.enlace.expires_at !== null && (
              <p className="text-texto-sutil text-xs">
                Vence el <Fecha valor={estado.enlace.expires_at} conHora />
              </p>
            )}

            {confirmandoRevocar
              ? (
                <div className="border-linea-suave flex flex-col gap-2 border-t pt-4">
                  <p className="text-texto-tenue text-sm">
                    Se corta el acceso de cualquiera que tenga el enlace. No se puede deshacer: habría
                    que generar uno nuevo y volver a repartirlo.
                  </p>
                  <div className="flex justify-end gap-2">
                    <Boton variante="sutil" tamano="chico" onClick={() => { setConfirmandoRevocar(false) }}>
                      Cancelar
                    </Boton>
                    <Boton variante="peligro" tamano="chico" cargando={enviando} onClick={() => { void revocar() }}>
                      Revocar
                    </Boton>
                  </div>
                </div>
                )
              : (
                <div className="border-linea-suave flex flex-wrap justify-end gap-2 border-t pt-4">
                  <CerrarDialogo asChild>
                    <Boton variante="sutil" tamano="chico">Cerrar</Boton>
                  </CerrarDialogo>
                  {estado.enlace.shared && (
                    <Boton
                      variante="peligro"
                      tamano="chico"
                      disabled={enviando}
                      onClick={() => { setConfirmandoRevocar(true) }}
                    >
                      Revocar
                    </Boton>
                  )}
                  <Boton variante="primario" tamano="chico" cargando={enviando} onClick={() => { void generar() }}>
                    {estado.enlace.shared ? 'Generar uno nuevo' : 'Generar enlace'}
                  </Boton>
                </div>
                )}
          </div>
        )}
      </ContenidoDialogo>
    </Dialogo>
  )
}

/**
 * Que decirle a la persona segun lo que hay.
 *
 * Los tres casos son distintos y el del medio es el que se olvida: hay enlace vivo pero la direccion
 * no se puede volver a mostrar, porque en la base solo queda su `sha256`. Callarlo dejaria a alguien
 * esperando un campo que no va a aparecer.
 */
function textoDeEstado (estado: Extract<Estado, { fase: 'listo' }>): string {
  if (estado.url !== null) {
    return 'Enlace listo. Generar otro deja este sin efecto al instante, así que copialo antes de volver a apretar.'
  }

  if (estado.enlace.shared) {
    return 'Ya hay un enlace activo, pero la dirección no se puede volver a mostrar: en el sistema sólo queda su huella. Si la perdiste, generá uno nuevo — el que ya repartiste dejará de funcionar.'
  }

  return `Esta ${PROCESO} todavía no está compartida.`
}

/**
 * Pregunta si hay enlace vivo, sin acuñar ninguno.
 *
 * Nunca lanza: el 403 y el 404 del contrato son estados de pantalla, no fallas.
 *
 * @param procesoId la Tarea
 * @returns el estado del dialogo ya resuelto
 */
async function leerEstado (procesoId: number): Promise<Estado> {
  try {
    const respuesta = await pedirRespuesta(`tasks/${procesoId}/share`, new AbortController().signal)

    if (respuesta.status === 403) return { fase: 'sinPermiso' }

    if (!respuesta.ok) return { fase: 'error', mensaje: await mensajeDeRespuesta(respuesta) }

    const sobre = await respuesta.json() as Sobre<EstadoEnlaceProceso>

    return { fase: 'listo', enlace: sobre.data, url: null }
  } catch (fallo) {
    return {
      fase: 'error',
      mensaje: fallo instanceof Error ? fallo.message : 'No se pudo consultar el enlace.'
    }
  }
}
