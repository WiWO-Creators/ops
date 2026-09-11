'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Sparkles } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { DesgloseSenales, Puntaje, TRAMOS } from '@/componentes/clientes/SemaforoCliente'
import { mensajeDeRespuesta } from '@/datos/cliente'
import {
  contarPorTramo,
  mensajeDeFalloDeEstado,
  nombreDe,
  rutaDeEstado,
  type CuentaFocal,
  type EstadoDeSalud,
  type EstadoRedactado,
  type ScoreEspacio
} from '@/datos/focals'
import { ASISTENTE, GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'

/**
 * La cartera de un Focal: sus clientes, y dentro de cada uno sus {@link GLOSARIO.espacio}.
 *
 * === Por qué dos niveles y no una tabla plana ===
 *
 * Porque las dos preguntas del Focal son distintas y se hacen en ese orden: primero "¿cuál de mis
 * cuentas está mal?" y recién después "¿qué parte de esa cuenta la tiene mal?". Una tabla de todos
 * los {@link GLOSARIO.espacio} ordenados por score contesta la segunda y hace imposible la primera:
 * una cuenta con cuatro proyectos regulares se lee peor que otra con uno pésimo, y no lo está.
 *
 * === Por qué el párrafo de WiBot es un botón y no aparece solo ===
 *
 * Porque cuesta plata. Redactarlo al abrir la pantalla serían decenas de llamadas al modelo de las
 * que casi ninguna se lee. El semáforo, el desglose y los contadores están completos sin él: el
 * párrafo es lo que se pide cuando el número no alcanza para entender.
 *
 * Con WiBot apagado el botón sigue ahí y contesta en una línea qué pasa, en vez de desaparecer sin
 * explicación. Lo que no cambia nunca es el semáforo, que no depende del modelo.
 *
 * @param cuentas los clientes de esta persona, ya ordenados por el servidor del peor al mejor
 */
export function PanelFocals ({ cuentas }: { cuentas: CuentaFocal[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {cuentas.map((cuenta) => (
        <li key={cuenta.cliente.client_id}>
          <TarjetaCuenta cuenta={cuenta} />
        </li>
      ))}
    </ul>
  )
}

/**
 * Una cuenta: su semáforo, cuántos {@link GLOSARIO.espacio} tiene en cada tramo, y el detalle.
 *
 * El detalle arranca cerrado a propósito. Un Focal con doce cuentas necesita ver las doce de un
 * vistazo para elegir en cuál entrar; abiertas, la primera ya ocupa la pantalla entera.
 */
function TarjetaCuenta ({ cuenta }: { cuenta: CuentaFocal }) {
  const [abierta, setAbierta] = useState(false)
  const { cliente, espacios } = cuenta

  return (
    <section className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 border">
      <header className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            href={`/clientes/${cliente.client_id}`}
            className="text-texto hover:text-acento truncate font-medium underline-offset-4 hover:underline"
          >
            {cliente.cliente ?? `Cliente #${cliente.client_id}`}
          </Link>
          <RecuentoDeTramos espacios={espacios} />
        </div>

        <div className="flex items-center gap-3">
          <Puntaje score={cliente.score} semaforo={cliente.semaforo} variacion={cliente.variacion} />
          <BotonDetalle
            abierto={abierta}
            onAlternar={() => { setAbierta(!abierta) }}
            etiqueta={`Detalle de ${cliente.cliente ?? 'la cuenta'}`}
          />
        </div>
      </header>

      {abierta && (
        <div className="border-linea flex flex-col gap-4 border-t p-4">
          <section className="flex flex-col gap-2">
            <h3 className="text-texto-tenue text-xs font-medium uppercase tracking-wide">
              Por qué el cliente tiene ese puntaje
            </h3>
            <DesgloseSenales senales={cliente.senales} />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-texto-tenue text-xs font-medium uppercase tracking-wide">
              Sus {GLOSARIO.espacio.plural.toLowerCase()}
            </h3>
            <ListaEspacios espacios={espacios} />
          </section>
        </div>
      )}
    </section>
  )
}

/**
 * "4 Proyectos · 3 críticos · 1 sin datos".
 *
 * Es lo que permite descartar una cuenta sin abrirla. **No** se muestra un promedio de los scores de
 * los {@link GLOSARIO.espacio}: ese número no es el score del cliente —el servidor lo calcula sobre
 * las {@link GLOSARIO.proceso}, no promediando— y tenerlos al lado invitaría a compararlos.
 */
function RecuentoDeTramos ({ espacios }: { espacios: ScoreEspacio[] }) {
  const espaciosGlosario = GLOSARIO.espacio

  if (espacios.length === 0) {
    return (
      <span className="text-texto-tenue text-xs">
        Sin {espaciosGlosario.plural.toLowerCase()}: no hay nada que abrir todavía.
      </span>
    )
  }

  const cuenta = contarPorTramo(espacios)
  const partes = [
    `${espacios.length} ${espacios.length === 1 ? espaciosGlosario.singular : espaciosGlosario.plural}`
  ]

  if (cuenta.rojo > 0) partes.push(`${cuenta.rojo} ${cuenta.rojo === 1 ? 'crítico' : 'críticos'}`)
  if (cuenta.amarillo > 0) partes.push(`${cuenta.amarillo} en atención`)
  if (cuenta.verde > 0) partes.push(`${cuenta.verde} al día`)
  if (cuenta.sin_datos > 0) partes.push(`${cuenta.sin_datos} sin datos`)

  return <span className="text-texto-tenue text-xs">{partes.join(' · ')}</span>
}

/** Los {@link GLOSARIO.espacio} de una cuenta, del peor al mejor. */
function ListaEspacios ({ espacios }: { espacios: ScoreEspacio[] }) {
  if (espacios.length === 0) {
    return (
      <p className="text-texto-tenue text-sm">
        Este cliente no tiene ningún {GLOSARIO.espacio.singular.toLowerCase()}, así que no hay nada
        que puntuar acá abajo.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {espacios.map((espacio) => (
        <li key={espacio.project_id}>
          <FilaEspacio espacio={espacio} />
        </li>
      ))}
    </ul>
  )
}

/**
 * Un {@link GLOSARIO.espacio} con su semáforo, su desglose y su estado en palabras.
 *
 * El estado que ya viene del servidor se muestra de entrada: está pagado y guardado. El botón
 * aparece cuando no hay ninguno, o cuando el que hay dejó de ser vigente porque las señales se
 * movieron después de redactarlo.
 */
function FilaEspacio ({ espacio }: { espacio: ScoreEspacio }) {
  const [abierto, setAbierto] = useState(false)
  const [estado, setEstado] = useState<EstadoDeSalud | null>(espacio.estado)
  const [redactando, setRedactando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tramo = TRAMOS[espacio.semaforo] ?? TRAMOS.sin_datos

  /** Pide el párrafo. Con las mismas señales el servidor devuelve el que ya estaba, sin cobrar. */
  async function redactar () {
    if (redactando) return

    setRedactando(true)
    setError(null)

    const resultado = await pedirEstado(espacio.project_id)
    setRedactando(false)

    // Un fallo NO borra el párrafo que ya estaba: si había uno viejo, sigue explicando de dónde
    // venía el puntaje, y dejar la tarjeta vacía por un error de red sería perder información.
    if (resultado.estado === null) setError(resultado.error)
    else setEstado(resultado.estado)
  }

  return (
    <article className="border-linea rounded-control border">
      <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/espacios/${espacio.project_id}`}
            className="text-texto hover:text-acento max-w-64 truncate text-sm underline-offset-4 hover:underline"
          >
            {nombreDe(espacio)}
          </Link>
          <Insignia tono={tramo.tono} tamano="chico">{tramo.etiqueta}</Insignia>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn('text-lg leading-none font-semibold tabular-nums', tramo.numero)}
            title={espacio.score === null ? 'Todavía no hay datos para calcular el score' : 'Score de 1 a 100'}
          >
            {espacio.score ?? '—'}
          </span>
          <BotonDetalle
            abierto={abierto}
            onAlternar={() => { setAbierto(!abierto) }}
            etiqueta={`Detalle de ${nombreDe(espacio)}`}
          />
        </div>
      </header>

      {abierto && (
        <div className="border-linea flex flex-col gap-3 border-t px-3 py-3">
          <DesgloseSenales senales={espacio.senales} />

          <EstadoEnPalabras
            estado={estado}
            error={error}
            redactando={redactando}
            onRedactar={() => { void redactar() }}
          />
        </div>
      )}
    </article>
  )
}

/**
 * El estado redactado, o el botón para pedirlo.
 *
 * Cuando el texto no es vigente se muestra igual, con la advertencia al lado: sigue explicando de
 * dónde venía el puntaje, y esconderlo dejaría la tarjeta sin nada mientras alguien decide si vale
 * la pena volver a pagarlo.
 */
function EstadoEnPalabras (
  { estado, error, redactando, onRedactar }: {
    estado: EstadoDeSalud | null
    error: string | null
    redactando: boolean
    onRedactar: () => void
  }
) {
  return (
    <section className="flex flex-col gap-2">
      {estado !== null && (
        <>
          <p className="text-texto text-sm text-pretty">{estado.texto}</p>
          <p className="text-texto-tenue text-xs">
            {estado.vigente
              ? `Redactado por ${ASISTENTE} el ${estado.generado_en}.`
              : `Redactado por ${ASISTENTE} el ${estado.generado_en}, con números que desde entonces cambiaron.`}
          </p>
        </>
      )}

      {error !== null && <p role="alert" className="text-texto-tenue text-xs">{error}</p>}

      {(estado === null || !estado.vigente) && (
        <div>
          <Boton tamano="chico" variante="secundario" onClick={onRedactar} cargando={redactando}>
            <Sparkles size={14} aria-hidden="true" />
            {estado === null ? `Explicar con ${ASISTENTE}` : 'Rehacer la explicación'}
          </Boton>
        </div>
      )}
    </section>
  )
}

/**
 * Pide el párrafo al BFF y devuelve el estado, o el motivo por el que no hay.
 *
 * No usa `escribirEnBff` porque acá hace falta el **código** de la respuesta y no solo su mensaje:
 * un 404 significa "WiBot está apagado" y un 409, "todavía no corrió el cálculo del día". Los dos
 * son estados normales del sistema y se cuentan con otras palabras (ver `mensajeDeFalloDeEstado`);
 * el mensaje crudo del servidor los haría parecer una falla de la aplicación.
 *
 * @param espacioId el Proyecto cuyo estado se quiere redactar
 * @returns el estado, o `null` con la línea que explica por qué no vino
 */
async function pedirEstado (espacioId: number): Promise<{ estado: EstadoDeSalud | null, error: string }> {
  let respuesta: Response

  try {
    respuesta = await fetch(`/api/bff/${rutaDeEstado(espacioId)}`, { method: 'POST' })
  } catch {
    return { estado: null, error: 'No se pudo contactar al servidor. Revisa tu conexión.' }
  }

  if (!respuesta.ok) {
    return {
      estado: null,
      error: mensajeDeFalloDeEstado(respuesta.status, await mensajeDeRespuesta(respuesta))
    }
  }

  try {
    const sobre = await respuesta.json() as { data: EstadoRedactado }

    return {
      estado: {
        texto: sobre.data.texto,
        generado_en: sobre.data.generado_en,
        vigente: sobre.data.vigente
      },
      error: ''
    }
  } catch {
    return { estado: null, error: 'El servidor respondió algo que no se pudo leer.' }
  }
}

/** La flecha que abre y cierra un bloque. Un `button` de verdad, para que el teclado lo alcance. */
function BotonDetalle (
  { abierto, onAlternar, etiqueta }: { abierto: boolean, onAlternar: () => void, etiqueta: string }
) {
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-expanded={abierto}
      aria-label={etiqueta}
      className="text-texto-tenue hover:text-texto hover:bg-hover rounded-control flex h-8 w-8 shrink-0 items-center justify-center"
    >
      <ChevronRight
        size={16}
        aria-hidden="true"
        className={cn('transition-transform', abierto && 'rotate-90')}
      />
    </button>
  )
}
