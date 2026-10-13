import { memo, type ElementType, type HTMLAttributes, type ReactElement } from 'react'
import Link from 'next/link'
import { CargandoConOrbe, Orbe } from '@/componentes/estado/Orbe'
import { cn } from '@/lib/clases'
import { ASISTENTE } from '@/dominio/glosario'
import { partirConCitas, type Mensaje } from '@/dominio/ia-chat'
import type { AccionIA, Cita } from '@/dominio/ia'
import type { ConfiguracionOrbe } from '@/dominio/orbe-sujeto'
import { FuentesIA } from './FuentesIA'
import { TarjetaPreguntaIA } from './TarjetaPreguntaIA'
import { TarjetaPropuestaIA } from './TarjetaPropuestaIA'
import { TextoChat } from './TextoChat'

/** Lo que se dice cuando el fallo no trae mensaje propio. */
export const MENSAJE_GENERICO = 'No se pudo completar la respuesta.'

interface PropsTarjetaIA extends HTMLAttributes<HTMLElement> {
  /** Elemento de la tarjeta: `li` en una lista de mensajes, `section` en una ejecución. */
  como?: ElementType
}

/**
 * La superficie de una respuesta de la IA: tarjeta hundida con borde. Es la única definición de
 * cómo se ve una respuesta, para que los dos motores cambien juntos.
 */
export function TarjetaIA ({ como: Elemento = 'li', className, ...resto }: PropsTarjetaIA): ReactElement {
  return <Elemento className={cn('border-linea bg-superficie-hundida rounded-tarjeta animate-aparecer flex flex-col gap-2 border p-3', className)} {...resto} />
}

interface PropsBurbujaIA {
  mensaje: Mensaje
  /** Su posición en el hilo: lo que recibe cada callback para no depender de una función nueva por render. */
  indice: number
  configuracion: ConfiguracionOrbe
  conProyecto: boolean
  proyectoId?: number
  /** Mensaje del fallo; solo importa cuando la fase es `error`. */
  error: string
  respuesta: string | null
  onReintentar: (indice: number) => void
  onResponder: (texto: string) => void
  onAccionResuelta: (accion: AccionIA) => void
}

/**
 * La burbuja de la IA: el texto con sus citas en línea, las fuentes al pie y el estado del stream.
 *
 * Las citas se pintan **de dos formas a la vez** a propósito: el superíndice deja leer de corrido sin
 * cortar la frase, y la lista de fuentes deja escanear de dónde salió todo sin releer el párrafo.
 *
 * Una cita sin destino —`hrefDeCita()` devuelve `null`— se pinta igual, pero sin enlace: el número y
 * el título siguen diciendo de dónde salió la frase, y un enlace al lugar equivocado sería peor.
 *
 * Va en `memo`: durante el stream solo cambia la última burbuja, y las anteriores no se repintan
 * mientras sus props (todas estables) no cambien.
 */
export const BurbujaIA = memo(function BurbujaIA ({
  mensaje,
  indice,
  configuracion,
  conProyecto,
  proyectoId,
  error,
  respuesta,
  onReintentar,
  onResponder,
  onAccionResuelta
}: PropsBurbujaIA): ReactElement {
  const esperando = mensaje.fase === 'generando' && mensaje.texto === ''

  // El indicador sale de lo que el servidor mandó en `event: paso`. Sin paso —backend viejo,
  // escrituras apagadas, o el modelo que no consultó nada— se queda con el texto fijo de siempre.
  const indicador = mensaje.fase === 'generando' && mensaje.paso !== null
    ? { mensaje: mensaje.paso.etiqueta, estado: mensaje.paso.orbe }
    : { mensaje: configuracion.textos.buscando(conProyecto), estado: 'thinking' as const }

  return (
    <TarjetaIA>
      {esperando
        ? <CargandoConOrbe mensaje={indicador.mensaje} estado={indicador.estado} retardoMs={0} />
        : (
          <div className="text-texto min-w-0">
            <TextoChat
              texto={partirConCitas(mensaje.texto, mensaje.citas).map((tramo) => 'cita' in tramo
                ? `[${mensaje.citas.indexOf(tramo.cita) + 1}](#fuente-${mensaje.citas.indexOf(tramo.cita) + 1})`
                : tramo.texto).join('')}
              marcadores={Object.fromEntries(mensaje.citas.map((cita, i) => [
                `#fuente-${i + 1}`, <Marcador key={i} cita={cita} numero={i + 1} href={configuracion.hrefDeCita(cita)} />
              ]))}
            />
            {mensaje.fase === 'generando' && (
              // El cursor es el orbe en `generating`, que es el estado que el sistema de diseño creó
              // para "sale contenido hacia la interfaz". Evita el caret parpadeante, que sería una
              // animación infinita fuera de `estado/`.
              <Orbe medida="1rem" estado="generating" className="ml-1 inline-block align-text-bottom" />
            )}
          </div>
          )}

      {mensaje.fase === 'generando' && (
        // El texto NO va en una región viva: un `aria-live` que cambia con cada delta es tortura para
        // un lector de pantalla. Se anuncia que hay algo en curso y el texto se lee al terminar.
        <span role="status" className="sr-only">Generando la respuesta…</span>
      )}

      <FuentesIA citas={mensaje.citas} hrefDeCita={configuracion.hrefDeCita} />

      {configuracion.conPropuestas && mensaje.acciones.length > 0 && (
        <ul aria-label="Acciones propuestas" className="animate-aparecer flex flex-col gap-2">
          {mensaje.acciones.map((accion) => (
            <li key={accion.id}>
              <TarjetaPropuestaIA
                accion={accion}
                onResuelta={onAccionResuelta}
                proyectoId={proyectoId}
                rutaConfirmar={configuracion.rutaConfirmar(accion.id, proyectoId)}
              />
            </li>
          ))}
        </ul>
      )}

      {configuracion.conPropuestas && mensaje.preguntas.length > 0 && (
        <ul aria-label={`Preguntas de ${ASISTENTE}`} className="animate-aparecer flex flex-col gap-2">
          {mensaje.preguntas.map((pregunta, i) => (
            <li key={i}>
              <TarjetaPreguntaIA pregunta={pregunta} respuesta={respuesta} onResponder={onResponder} />
            </li>
          ))}
        </ul>
      )}

      {mensaje.fase === 'error' && (
        <p role="alert" className="text-texto-peligro flex flex-wrap items-center gap-2 text-xs">
          <Orbe medida="1rem" estado="error" className="inline-block align-text-bottom" />
          {error === '' ? MENSAJE_GENERICO : error}
          <button type="button" onClick={() => { onReintentar(indice) }} className="text-acento font-semibold underline underline-offset-4">
            Reintentar
          </button>
        </p>
      )}

      {mensaje.fase === 'interrumpido' && (
        <p className="text-texto-tenue flex flex-wrap items-center gap-2 text-xs">
          Respuesta interrumpida.
          <button type="button" onClick={() => { onReintentar(indice) }} className="text-acento font-semibold underline underline-offset-4">
            Volver a preguntar
          </button>
        </p>
      )}
    </TarjetaIA>
  )
})

/** El superíndice en medio de la frase: enlace si la cita tiene destino, texto si no. */
function Marcador ({ cita, numero, href }: { cita: Cita, numero: number, href: string | null }): ReactElement {
  const superindice = <sup className="font-semibold">[{numero}]</sup>

  if (href === null) return <span className="text-texto-sutil">{superindice}</span>

  return (
    <Link href={href} aria-label={`Ver ${cita.titulo}`} className="text-acento hover:underline">
      {superindice}
    </Link>
  )
}
