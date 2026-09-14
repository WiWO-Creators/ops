'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ChevronRight, Sparkles } from 'lucide-react'
import { ControlesDeCartera } from './ControlesDeCartera'
import { Boton } from '@/componentes/formularios/Boton'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Vacio } from '@/componentes/estado/Estados'
import { DesgloseSenales, TRAMOS, Variacion } from '@/componentes/clientes/SemaforoCliente'
import { mensajeDeRespuesta } from '@/datos/cliente'
import {
  contarPorTramo,
  mensajeDeFalloDeEstado,
  nombreDe,
  nombresDeFocales,
  rutaDeEstado,
  type CuentaFocal,
  type EstadoDeSalud,
  type EstadoRedactado,
  type ScoreEspacio
} from '@/datos/focals'
import {
  filtrarCartera,
  nombreDeCuenta,
  ordenarCartera,
  resumirCartera,
  type FiltroDeCartera,
  type OrdenDeCartera
} from '@/dominio/cartera'
import type { ScoreCliente, SemaforoCliente } from '@/datos/recursos'
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
 * === Por qué la fila empieza por el número ===
 *
 * Porque con veinte cuentas la pregunta no se contesta leyendo veinte nombres: se contesta mirando
 * una columna de números alineados y frenando en el más bajo. El puntaje va primero, en su propia
 * columna y en cifras tabulares, para que esa columna exista. El nombre viene después: sirve para
 * confirmar en cuál se paró el ojo, no para encontrarla.
 *
 * La barra de reparto que sigue al nombre es el mismo dato que el recuento escrito al lado, dibujado:
 * una cuenta con cinco de cinco {@link GLOSARIO.espacio} en rojo se ve entera roja antes de leer
 * ninguna palabra, y una con uno malo entre seis buenos deja de parecer lo mismo.
 *
 * === Por qué el párrafo de Thinking Orb es un botón y no aparece solo ===
 *
 * Porque cuesta plata. Redactarlo al abrir la pantalla serían decenas de llamadas al modelo de las
 * que casi ninguna se lee. El semáforo, el desglose y los contadores están completos sin él: el
 * párrafo es lo que se pide cuando el número no alcanza para entender.
 *
 * Con Thinking Orb apagado el botón sigue ahí y contesta en una línea qué pasa, en vez de desaparecer sin
 * explicación. Lo que no cambia nunca es el semáforo, que no depende del modelo.
 *
 * @param cuentas los clientes de esta persona, ya ordenados por el servidor del peor al mejor
 * @param mostrarFocal si cada cuenta lleva el nombre de quien responde por ella. Se enciende para
 *   quien mira la cartera entera: sobre la cartera propia sería el mismo nombre en todas las filas
 */
export function PanelFocals ({
  cuentas,
  mostrarFocal = false
}: {
  cuentas: CuentaFocal[]
  mostrarFocal?: boolean
}) {
  const [texto, setTexto] = useState('')
  const [filtro, setFiltro] = useState<FiltroDeCartera>('todas')
  const [orden, setOrden] = useState<OrdenDeCartera>('peor')

  const resumen = useMemo(() => resumirCartera(cuentas), [cuentas])
  const visibles = useMemo(
    () => ordenarCartera(filtrarCartera(cuentas, texto, filtro), orden),
    [cuentas, texto, filtro, orden]
  )

  return (
    // El ancho se corta a propósito: en una pantalla de 1440 una fila estirada de borde a borde deja
    // medio metro de vacío entre el nombre de la cuenta y quien responde por ella, y leer los dos
    // extremos de la misma fila obliga a barrer la pantalla entera con los ojos.
    <div className="flex max-w-5xl flex-col gap-4">
      <ControlesDeCartera
        resumen={resumen}
        visibles={visibles.length}
        texto={texto}
        filtro={filtro}
        orden={orden}
        onTexto={setTexto}
        onFiltro={setFiltro}
        onOrden={setOrden}
      />

      {visibles.length === 0
        ? (
          <Vacio
            titulo="Ninguna cuenta coincide con el recorte"
            descripcion="Prueba con parte del nombre, o quita el filtro que está puesto."
          />
          )
        : (
          <ul className="flex flex-col gap-2">
            {visibles.map((cuenta) => (
              <li key={cuenta.cliente.client_id}>
                <FilaCuenta cuenta={cuenta} mostrarFocal={mostrarFocal} />
              </li>
            ))}
          </ul>
          )}
    </div>
  )
}

/**
 * Una cuenta: su puntaje, cómo se reparten sus {@link GLOSARIO.espacio} y el detalle.
 *
 * El detalle arranca cerrado a propósito. Un Focal con doce cuentas necesita ver las doce de un
 * vistazo para elegir en cuál entrar; abiertas, la primera ya ocupa la pantalla entera.
 *
 * La fila entera es **un solo botón**, y no un botón con un enlace adentro: así el clic cae en
 * cualquier parte y no hay que apuntarle a una flecha de 16 píxeles. El enlace a la ficha del
 * cliente vive dentro del detalle, donde es un destino elegido y no un accidente del clic.
 */
function FilaCuenta ({ cuenta, mostrarFocal }: { cuenta: CuentaFocal, mostrarFocal: boolean }) {
  const [abierta, setAbierta] = useState(false)
  const { cliente, espacios } = cuenta
  const tramo = TRAMOS[cliente.semaforo] ?? TRAMOS.sin_datos
  const nombre = nombreDeCuenta(cuenta)

  return (
    <article
      className={cn(
        'border-linea bg-superficie-elevada rounded-tarjeta shadow-1 overflow-hidden border',
        abierta && 'border-linea-fuerte'
      )}
    >
      <button
        type="button"
        onClick={() => { setAbierta(!abierta) }}
        aria-expanded={abierta}
        className={cn(
          'ease-neo duration-rapida grid w-full grid-cols-[3rem_minmax(0,1fr)_auto] items-center',
          'gap-x-3 gap-y-1 p-3 text-start transition-colors hover:bg-hover',
          'focus-visible:outline-foco focus-visible:outline-2 focus-visible:-outline-offset-2',
          'sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto]'
        )}
      >
        <span className="flex flex-col items-end gap-0.5">
          <span
            className={cn('text-[22px] leading-none font-semibold tabular-nums', tramo.numero)}
            title={cliente.score === null ? 'Todavía no hay datos para calcular el score' : 'Score de 1 a 100'}
          >
            {cliente.score ?? '—'}
          </span>
          <Variacion puntos={cliente.variacion} />
        </span>

        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="text-texto truncate text-sm font-semibold">{nombre}</span>
            <Insignia tono={tramo.tono} tamano="chico">{tramo.etiqueta}</Insignia>
          </span>

          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <BarraDeReparto espacios={espacios} />
            <RecuentoDeTramos espacios={espacios} />
          </span>
        </span>

        {mostrarFocal && (
          <span className="col-start-2 sm:col-start-3">
            <QuienResponde cliente={cliente} />
          </span>
        )}

        <ChevronRight
          size={16}
          aria-hidden="true"
          className={cn(
            'text-texto-sutil ease-neo duration-rapida col-start-3 row-start-1 justify-self-end',
            'transition-transform sm:col-start-4',
            abierta && 'rotate-90'
          )}
        />
      </button>

      {abierta && (
        <div className="border-linea flex flex-col gap-4 border-t p-4">
          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-texto-tenue text-xs font-medium tracking-wide uppercase">
                Por qué el cliente tiene ese puntaje
              </h3>

              <Link
                href={`/clientes/${cliente.client_id}`}
                className={cn(
                  'text-texto-tenue hover:text-acento rounded-control ease-neo duration-rapida',
                  'inline-flex items-center gap-1 text-xs underline-offset-4 transition-colors hover:underline',
                  'focus-visible:outline-foco focus-visible:outline-2 focus-visible:outline-offset-2'
                )}
              >
                Abrir la ficha de {nombre}
                <ArrowUpRight aria-hidden="true" className="size-3.5" />
              </Link>
            </div>

            <DesgloseSenales senales={cliente.senales} />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-texto-tenue text-xs font-medium tracking-wide uppercase">
              Sus {GLOSARIO.espacio.plural.toLowerCase()}
            </h3>
            <ListaEspacios espacios={espacios} />
          </section>
        </div>
      )}
    </article>
  )
}

/**
 * Cómo se reparten los {@link GLOSARIO.espacio} de una cuenta entre los cuatro tramos.
 *
 * Es el recuento de al lado, dibujado. Existe porque "6 Proyectos · 5 críticos" obliga a leer dos
 * números y dividirlos mentalmente, y la misma información como una barra casi entera en rojo no
 * obliga a nada. El texto queda igual al lado: la barra sola sería color sin palabras, que es
 * ilegible para quien no distingue el rojo del verde y en una captura en blanco y negro.
 *
 * `aria-hidden` porque el recuento escrito ya lo dice con todas las letras.
 */
function BarraDeReparto ({ espacios }: { espacios: ScoreEspacio[] }) {
  if (espacios.length === 0) return null

  const cuenta = contarPorTramo(espacios)
  const partes: { tramo: SemaforoCliente, cuantos: number, fondo: string }[] = [
    { tramo: 'rojo', cuantos: cuenta.rojo, fondo: 'bg-texto-peligro' },
    { tramo: 'amarillo', cuantos: cuenta.amarillo, fondo: 'bg-texto-aviso' },
    { tramo: 'verde', cuantos: cuenta.verde, fondo: 'bg-texto-exito' },
    { tramo: 'sin_datos', cuantos: cuenta.sin_datos, fondo: 'bg-linea-fuerte' }
  ]

  return (
    <span
      aria-hidden="true"
      className="bg-superficie-hundida flex h-1.5 w-20 shrink-0 gap-px overflow-hidden rounded-full"
    >
      {partes
        .filter((parte) => parte.cuantos > 0)
        .map((parte) => (
          <span
            key={parte.tramo}
            className={parte.fondo}
            style={{ width: `${(parte.cuantos / espacios.length) * 100}%` }}
          />
        ))}
    </span>
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
      <span className="text-texto-sutil text-xs">
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

/**
 * "Focal: Ana Pérez", o la falta de focal dicha con todas las letras.
 *
 * Solo aparece en la cartera entera. Sin este renglón la pantalla de una gerencia es una lista de
 * clientes ordenada por puntaje y nada más: sirve para ver qué está mal, no para saber con quién
 * hablarlo, que es la mitad de la pregunta.
 *
 * Una cuenta sin focal se dibuja como tal —y no se omite el renglón— porque es justamente el caso
 * que hay que ver: un cliente del que nadie responde no tiene a quién reclamarle el rojo. Por eso
 * lleva tono de aviso y el resto de las cuentas, sólo el nombre en gris: lo que hay que encontrar
 * acá es la ausencia.
 */
function QuienResponde ({ cliente }: { cliente: ScoreCliente }) {
  const nombres = nombresDeFocales(cliente)
  const focal = GLOSARIO.focal.singular

  if (nombres.length === 0) {
    return (
      <Insignia tono="aviso" tamano="chico" className="self-start">
        Sin {focal.toLowerCase()}
      </Insignia>
    )
  }

  return (
    <span className="text-texto-tenue block max-w-48 truncate text-xs">
      {focal}: <span className="text-texto">{nombres.join(', ')}</span>
    </span>
  )
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
          <span
            className={cn('w-8 shrink-0 text-end text-base leading-none font-semibold tabular-nums', tramo.numero)}
            title={espacio.score === null ? 'Todavía no hay datos para calcular el score' : 'Score de 1 a 100'}
          >
            {espacio.score ?? '—'}
          </span>
          <Link
            href={`/espacios/${espacio.project_id}`}
            className="text-texto hover:text-acento max-w-64 truncate text-sm underline-offset-4 hover:underline"
          >
            {nombreDe(espacio)}
          </Link>
          <Insignia tono={tramo.tono} tamano="chico">{tramo.etiqueta}</Insignia>
        </div>

        <BotonDetalle
          abierto={abierto}
          onAlternar={() => { setAbierto(!abierto) }}
          etiqueta={`Detalle de ${nombreDe(espacio)}`}
        />
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
 * un 404 significa "Thinking Orb está apagado" y un 409, "todavía no corrió el cálculo del día". Los dos
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
      className={cn(
        'text-texto-tenue hover:text-texto hover:bg-hover rounded-control flex h-8 w-8 shrink-0',
        'items-center justify-center',
        'focus-visible:outline-foco focus-visible:outline-2 focus-visible:outline-offset-2'
      )}
    >
      <ChevronRight
        size={16}
        aria-hidden="true"
        className={cn('ease-neo duration-rapida transition-transform', abierto && 'rotate-90')}
      />
    </button>
  )
}
