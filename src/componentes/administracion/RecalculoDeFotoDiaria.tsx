'use client'

import { useState, type ReactElement } from 'react'
import { mensajeDeRespuesta } from '@/datos/cliente'
import { ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { SelectorBuscable } from '@/componentes/formularios/Selector'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import type { OpcionFiltro } from '@/definiciones/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { formatearFecha, hoyLocal } from '@/lib/fechas'

/**
 * Recálculo manual de la foto diaria de un {@link GLOSARIO.espacio} (`POST /scores/espacios/recalcular`).
 *
 * === POR QUÉ ESTA PANTALLA EXISTE ===
 *
 * La desviación de una {@link GLOSARIO.proceso} se recalcula sola: se mide contra su fecha de
 * entrega en cada consulta, así que corregir una fecha mal cargada limpia el incumplimiento al
 * instante. La foto diaria del {@link GLOSARIO.espacio}, en cambio, es inmutable por diseño — es la
 * memoria de cómo estaban las cosas ese día, y es lo único que permite contestar «¿mejoró o
 * empeoró?». El cron escribe la fila del día en curso y no vuelve a tocar las anteriores nunca.
 *
 * El costo de esa decisión es el que reportó el cliente (punto 4 del requerimiento del 15/09): los
 * días anteriores conservan su incumplimiento viejo aunque ya se haya demostrado que no existió. La
 * salida acordada no fue recalcular hacia atrás en cada lectura —eso mata el histórico— sino este
 * botón, acotado a un {@link GLOSARIO.espacio} y a un rango corto, que se aprieta **después** de una
 * corrección justificada.
 *
 * === POR QUÉ ADVIERTE Y CONFIRMA ANTES DE ESCRIBIR ===
 *
 * Porque no es una consulta: reescribe historia ya guardada, y el número de un mes cerrado puede
 * quedar distinto del que alguien ya reportó. Una pantalla de Administración con un selector y dos
 * fechas se lee como un informe; el aviso de arriba y el diálogo de confirmación son lo que impide
 * que se use como tal. El diálogo repite el {@link GLOSARIO.espacio} y el rango exactos: confirmar
 * sin volver a leer qué se va a tocar no es confirmar.
 *
 * === POR QUÉ EL RESULTADO SE MUESTRA ENTERO ===
 *
 * Porque un recálculo que no deja ver qué cambió es peor que no tenerlo: al mes siguiente nadie
 * puede explicar por qué el número de agosto es otro. Se muestran las filas reescritas, las que
 * efectivamente cambiaron, el antes y el después de cada columna, los días que nunca tuvieron foto
 * —que no se inventan— y la `nota` de la API tal cual viene, porque dice qué parte del contexto no
 * tiene historial y quedó con el valor de hoy.
 */

/** La ruta de escritura en el BFF. Sin barra inicial: la agrega `fetch`. */
const RUTA_RECALCULO = 'scores/espacios/recalcular'

/**
 * Tope del rango, en días. El mismo `DIAS_MAXIMO` que aplica la API.
 *
 * Se repite acá para no gastar un viaje en un rango que ya se sabe rechazado, no para reemplazar la
 * regla: la que manda sigue siendo la del servidor, y su 422 se muestra igual si esta copia queda
 * corta.
 */
const DIAS_MAXIMO = 92

/**
 * Un cambio de una columna en una fecha, tal como lo devuelve la API.
 *
 * Los valores llegan como los da MySQL —enteros y decimales en texto, o `null`—, así que se tipan
 * como `unknown` y se presentan con {@link comoTexto} en vez de suponerles una forma.
 */
interface CambioDeColumna {
  antes: unknown
  despues: unknown
}

/** Lo que cambió en la foto de un día. */
interface CambioDeFecha {
  fecha: string
  campos: Record<string, CambioDeColumna>
}

/** La respuesta de `POST /scores/espacios/recalcular`. */
interface ResultadoDeRecalculo {
  project_id: number
  desde: string
  hasta: string
  dias_en_rango: number
  reescritas: number
  con_cambios: number
  /** Los días del rango que nunca tuvieron foto. No se crean: se informan. */
  sin_foto: string[]
  cambios: CambioDeFecha[]
  /** Qué parte del contexto no se reconstruyó. Se muestra tal cual. */
  nota: string
}

/**
 * Nombre legible de cada columna de la foto diaria.
 *
 * Las claves son las columnas de `tblapi_score_espacio`, que es lo único que la API manda en
 * `campos`. Se traducen acá y no en el servidor porque son nombres de interfaz, y una columna nueva
 * que todavía no esté en este mapa se muestra con su nombre crudo en vez de desaparecer de la tabla.
 */
const NOMBRE_DE_COLUMNA: Record<string, string> = {
  score: 'Puntaje',
  semaforo: 'Semáforo',
  plazos_score: 'Cumplimiento de plazos (puntaje)',
  plazos_medibles: 'Plazos medibles',
  plazos_incumplidos: 'Plazos incumplidos',
  plazos_en_riesgo: 'Plazos en riesgo',
  plazos_atraso_promedio: 'Atraso promedio, en días',
  carga_score: 'Carga y actividad (puntaje)',
  carga_abiertos: `${GLOSARIO.proceso.plural} abiertas`,
  carga_con_movimiento: `${GLOSARIO.proceso.plural} con movimiento`,
  carga_estancados: `${GLOSARIO.proceso.plural} estancadas`,
  vencer_score: 'Vencimientos próximos (puntaje)',
  vencer_por_vencer: 'Por vencer',
  vencer_criticos: 'Vencimientos críticos',
  vencer_vencidos: 'Vencidas',
  procesos: `${GLOSARIO.proceso.plural} de la foto`,
  aprobacion_pendiente: 'Aprobación del cliente pendiente',
  calidad_promedio: 'Nota de calidad promedio',
  calidad_tareas: `${GLOSARIO.proceso.plural} con calidad medida`
}

/**
 * Las columnas que NO tienen dimensión histórica.
 *
 * Sus tablas guardan el estado de hoy y no una serie, así que en una fila recalculada quedan con el
 * valor de hoy y no con el del día que dice la fecha. Es exactamente lo que advierte la `nota` de la
 * API; acá se marca además fila por fila, porque quien compara un antes y un después columna por
 * columna necesita saber cuáles de esas diferencias no significan «ese día era distinto».
 */
const COLUMNAS_SIN_HISTORIAL = new Set(['aprobacion_pendiente', 'calidad_promedio', 'calidad_tareas'])

/**
 * Título del bloque de error según el código con el que respondió la API.
 *
 * El **mensaje** siempre es el de la API y nunca se reemplaza: la API sabe por qué dijo que no, y
 * reescribirlo acá produce dos versiones de la misma regla que se desincronizan. El código solo
 * elige el encabezado, que es lo que le dice a quien mira si el problema es de permisos, de lo que
 * eligió o de la instalación.
 *
 * @param estadoHttp el código con el que respondió el BFF
 * @returns el encabezado del bloque de error
 */
function tituloDeFallo (estadoHttp: number): string {
  if (estadoHttp === 403) return 'No tenés permiso para recalcular'
  if (estadoHttp === 404) return `Ese ${GLOSARIO.espacio.singular} no está disponible`
  if (estadoHttp === 409) return 'Esta instalación no guarda la foto diaria'
  if (estadoHttp === 422) return 'Revisá lo que pediste'

  return 'No se pudo recalcular'
}

/** Un fallo de la API: su código, para el encabezado, y su mensaje, que se muestra tal cual. */
interface FalloDeRecalculo {
  titulo: string
  mensaje: string
}

/**
 * Dispara el recálculo y devuelve el detalle, o el fallo con el código y el mensaje de la API.
 *
 * No usa `escribirEnBff` porque acá hace falta el **código** de la respuesta y no solo su mensaje:
 * 403, 404, 409 y 422 son cuatro conversaciones distintas —permisos, {@link GLOSARIO.espacio} que no
 * se ve, instalación sin la tabla, y rango mal pedido— y bajo un único encabezado genérico las
 * cuatro se leen como «algo falló». El mensaje que se muestra sigue siendo el de la API, que es el
 * mismo que produce `escribirEnBff`.
 *
 * Nunca lanza: el error es un valor, y la pantalla que lo provocó tiene que poder mostrarlo sin
 * desmontarse.
 *
 * @param cuerpo el `project_id` y el rango ya validados en el navegador
 * @returns el resultado del recálculo, o el fallo listo para mostrar
 */
async function recalcular (
  cuerpo: { project_id: number, desde: string, hasta: string }
): Promise<{ ok: true, datos: ResultadoDeRecalculo } | { ok: false, fallo: FalloDeRecalculo }> {
  let respuesta: Response

  try {
    respuesta = await fetch(`/api/bff/${RUTA_RECALCULO}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    })
  } catch {
    return {
      ok: false,
      fallo: {
        titulo: 'No se pudo recalcular',
        mensaje: 'No se pudo contactar al servidor. Revisa tu conexión.'
      }
    }
  }

  if (!respuesta.ok) {
    return {
      ok: false,
      fallo: { titulo: tituloDeFallo(respuesta.status), mensaje: await mensajeDeRespuesta(respuesta) }
    }
  }

  try {
    const sobre = await respuesta.json() as { data: ResultadoDeRecalculo }

    return { ok: true, datos: sobre.data }
  } catch {
    // La escritura entró —la API respondió 2xx— pero el detalle no se pudo leer. Decirlo es lo
    // único honesto: callar dejaría creyendo que no se tocó nada.
    return {
      ok: false,
      fallo: {
        titulo: 'El recálculo corrió, pero no se pudo leer el detalle',
        mensaje: 'El servidor respondió algo que no se pudo interpretar. Volvé a pedir el mismo rango para ver en qué quedó.'
      }
    }
  }
}

/**
 * Valida el pedido antes de gastar un viaje.
 *
 * Repite las reglas del contrato —{@link GLOSARIO.espacio} elegido, dos fechas en orden, sin futuro
 * y con tope de días— para que el mensaje diga cuál falta en vez de un 422 genérico. No reemplaza a
 * la API: la compuerta real está allá, y su mensaje se muestra igual cuando esta copia se queda
 * corta.
 *
 * @param espacio el id elegido, en texto; cadena vacía si todavía no se eligió ninguno
 * @param desde fecha de inicio en `YYYY-MM-DD`
 * @param hasta fecha de fin en `YYYY-MM-DD`
 * @param hoy el día de hoy en la zona del negocio
 * @returns el motivo por el que el pedido no sirve, o `null` si se puede mandar
 */
function motivoParaNoRecalcular (
  espacio: string,
  desde: string,
  hasta: string,
  hoy: string
): string | null {
  if (espacio === '') return `Elegí el ${GLOSARIO.espacio.singular.toLowerCase()} a recalcular.`
  if (desde === '' || hasta === '') return 'Hacen falta las dos fechas del rango.'
  if (desde > hasta) return 'La fecha de inicio no puede ser posterior a la de fin.'
  if (hasta > hoy) return 'No se puede recalcular una foto que todavía no se tomó.'

  const dias = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1

  if (!Number.isFinite(dias) || dias < 1) return 'Las fechas del rango no son válidas.'
  if (dias > DIAS_MAXIMO) return `El rango no puede pasar de ${DIAS_MAXIMO} días; se pidieron ${dias}.`

  return null
}

/**
 * Presenta un valor crudo de la foto diaria.
 *
 * `null` se distingue del cero y del vacío a propósito: en una tabla de antes y después, «no había
 * dato» y «el dato era cero» son dos cosas distintas y la comparación pierde sentido si se pintan
 * igual.
 *
 * @param valor el valor tal como vino de la API
 * @returns el texto a mostrar en la celda
 */
function comoTexto (valor: unknown): string {
  if (valor === null || valor === undefined) return 'sin dato'
  if (typeof valor === 'boolean') return valor ? 'sí' : 'no'

  const texto = String(valor).trim()

  return texto === '' ? 'sin dato' : texto
}

interface PropsRecalculo {
  /** El catálogo de {@link GLOSARIO.espacio} entre los que se elige. */
  espacios: OpcionFiltro[]
  /** Por qué no se pudo traer el catálogo, si no se pudo. */
  errorCatalogo: string | null
}

/**
 * El formulario del recálculo, con su advertencia, su confirmación y su resultado.
 *
 * @param espacios catálogo completo para el selector
 * @param errorCatalogo motivo por el que el catálogo no vino, o `null`
 */
export function RecalculoDeFotoDiaria ({ espacios, errorCatalogo }: PropsRecalculo): ReactElement {
  const hoy = hoyLocal()

  const [espacio, setEspacio] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [enCurso, setEnCurso] = useState(false)
  const [fallo, setFallo] = useState<FalloDeRecalculo | null>(null)
  const [resultado, setResultado] = useState<ResultadoDeRecalculo | null>(null)

  const motivo = motivoParaNoRecalcular(espacio, desde, hasta, hoy)
  const elegido = espacios.find((opcion) => opcion.valor === espacio) ?? null

  /**
   * Abre la confirmación si el pedido sirve, o muestra por qué no.
   *
   * La validación corre acá y no dentro del diálogo para no abrir una confirmación de algo que se
   * sabe que va a ser rechazado.
   */
  function pedirConfirmacion (evento: React.FormEvent): void {
    evento.preventDefault()
    setFallo(null)

    if (motivo !== null) {
      setFallo({ titulo: 'Revisá lo que pediste', mensaje: motivo })
      return
    }

    setConfirmando(true)
  }

  /** Confirma y escribe. El resultado anterior se descarta antes de empezar: ya no describe nada. */
  async function confirmar (): Promise<void> {
    setConfirmando(false)
    setEnCurso(true)
    setFallo(null)
    setResultado(null)

    const salida = await recalcular({ project_id: Number(espacio), desde, hasta })

    setEnCurso(false)

    if (!salida.ok) {
      setFallo(salida.fallo)
      return
    }

    setResultado(salida.datos)
  }

  if (errorCatalogo !== null) {
    return (
      <ErrorEstado
        titulo={`No se pudo traer la lista de ${GLOSARIO.espacio.plural.toLowerCase()}`}
        detalle={errorCatalogo}
      />
    )
  }

  if (espacios.length === 0) {
    return (
      <Vacio
        titulo={`No hay ${GLOSARIO.espacio.plural.toLowerCase()} que recalcular`}
        descripcion={`Sin ${GLOSARIO.espacio.plural.toLowerCase()} visibles no hay ninguna foto diaria sobre la que trabajar.`}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Advertencia />

      <form className="flex flex-col gap-4" onSubmit={pedirConfirmacion}>
        <Campo
          etiqueta={GLOSARIO.espacio.singular}
          requerido
          ayuda={`Se recalcula un solo ${GLOSARIO.espacio.singular.toLowerCase()} por vez. Uno archivado conserva su histórico: la API no lo vuelve a calcular.`}
        >
          {(props) => (
            <SelectorBuscable
              id={props.id}
              valor={espacio}
              onElegir={setEspacio}
              opciones={espacios}
              marcador={`Elegí un ${GLOSARIO.espacio.singular.toLowerCase()}`}
              nombre={GLOSARIO.espacio.singular.toLowerCase()}
            />
          )}
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Desde" requerido>
            {(props) => (
              <Entrada
                {...props}
                type="date"
                value={desde}
                max={hasta === '' ? hoy : hasta}
                onChange={(e) => { setDesde(e.target.value) }}
              />
            )}
          </Campo>

          <Campo
            etiqueta="Hasta"
            requerido
            ayuda={`Hasta hoy, y a lo sumo ${DIAS_MAXIMO} días de rango.`}
          >
            {(props) => (
              <Entrada
                {...props}
                type="date"
                value={hasta}
                min={desde === '' ? undefined : desde}
                max={hoy}
                onChange={(e) => { setHasta(e.target.value) }}
              />
            )}
          </Campo>
        </div>

        <div className="flex justify-end">
          {/* El botón queda habilitado aunque el pedido no sirva: apagado, no hay forma de saber qué
              falta. Al enviarlo, `pedirConfirmacion` lo dice con palabras. */}
          <Boton type="submit" variante="peligro" cargando={enCurso}>
            Recalcular y reescribir
          </Boton>
        </div>
      </form>

      {fallo !== null && <ErrorEstado titulo={fallo.titulo} detalle={fallo.mensaje} />}

      {resultado !== null && <Resultado resultado={resultado} nombreDelEspacio={elegido?.etiqueta ?? null} />}

      <Dialogo open={confirmando} onOpenChange={setConfirmando}>
        <ContenidoDialogo
          titulo="Vas a reescribir historia guardada"
          descripcion="Esto no es una consulta: las fotos diarias de ese rango se vuelven a calcular y se sobreescriben. No hay forma de deshacerlo."
        >
          <div className="flex flex-col gap-4">
            <dl className="border-linea bg-superficie-hundida rounded-tarjeta flex flex-col gap-1 border p-3 text-sm">
              <div className="flex gap-2">
                <dt className="text-texto-tenue shrink-0 font-medium">{GLOSARIO.espacio.singular}:</dt>
                <dd className="text-texto truncate">{elegido?.etiqueta ?? `#${espacio}`}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-texto-tenue shrink-0 font-medium">Rango:</dt>
                <dd className="text-texto">{formatearFecha(desde)} — {formatearFecha(hasta)}</dd>
              </div>
            </dl>

            <p className="text-texto-sutil text-xs">
              Los días del rango que nunca tuvieron foto no se crean: se listan aparte. Queda
              constancia de quién lo pidió, sobre qué {GLOSARIO.espacio.singular.toLowerCase()} y en
              qué rango.
            </p>

            <div className="flex justify-end gap-2">
              <CerrarDialogo asChild>
                <Boton variante="secundario">Cancelar</Boton>
              </CerrarDialogo>
              <Boton variante="peligro" onClick={() => { void confirmar() }}>
                Sí, reescribir
              </Boton>
            </div>
          </div>
        </ContenidoDialogo>
      </Dialogo>
    </div>
  )
}

/**
 * El aviso que precede al formulario.
 *
 * Va arriba y siempre visible, no detrás de un icono de ayuda: quien abre esta pantalla por primera
 * vez tiene que leer qué hace **antes** de elegir nada, y un aviso que aparece recién al confirmar
 * llega cuando la decisión ya está tomada.
 */
function Advertencia (): ReactElement {
  return (
    <div className="border-linea bg-superficie-elevada rounded-tarjeta flex flex-col gap-2 border p-4 text-sm">
      <p className="text-texto font-medium">Esto reescribe historia, no la consulta.</p>
      <p className="text-texto-tenue text-pretty">
        La foto diaria de un {GLOSARIO.espacio.singular.toLowerCase()} es inmutable a propósito: guarda
        cómo estaban las cosas ese día, y es lo único que permite comparar un mes con otro. Recalcular
        un rango sobreescribe esas filas con lo que dicen los datos de hoy, así que un número ya
        reportado puede quedar distinto.
      </p>
      <p className="text-texto-tenue text-pretty">
        Se usa <strong className="text-texto">después</strong> de una corrección justificada —una fecha
        de entrega mal cargada que ya se arregló— y sobre el tramo que esa corrección tocó. No es una
        forma de «poner al día» el histórico.
      </p>
    </div>
  )
}

/**
 * El detalle de lo que el recálculo hizo.
 *
 * Se muestra entero y sin recortes —contadores, `nota`, antes y después por fecha y columna, y los
 * días sin foto— porque es lo único que permite explicar después por qué un número cambió. Un
 * resumen de dos cifras deja la reescritura sin auditoría.
 *
 * @param resultado la respuesta de la API, tal como vino
 * @param nombreDelEspacio cómo se llama el {@link GLOSARIO.espacio}, para no mostrar solo su id
 */
function Resultado (
  { resultado, nombreDelEspacio }: { resultado: ResultadoDeRecalculo, nombreDelEspacio: string | null }
): ReactElement {
  const { dias_en_rango: diasEnRango, reescritas, con_cambios: conCambios, sin_foto: sinFoto, cambios } = resultado

  return (
    <section className="flex flex-col gap-4" aria-label="Resultado del recálculo">
      <div className="border-linea bg-superficie-hundida rounded-tarjeta flex flex-col gap-3 border p-4">
        <p className="text-texto text-sm font-medium">
          {nombreDelEspacio ?? `${GLOSARIO.espacio.singular} #${resultado.project_id}`}
          <span className="text-texto-tenue font-normal">
            {' · '}{formatearFecha(resultado.desde)} — {formatearFecha(resultado.hasta)}
          </span>
        </p>

        <dl className="grid gap-3 sm:grid-cols-3">
          <Contador etiqueta="Días en el rango" valor={diasEnRango} />
          <Contador etiqueta="Fotos reescritas" valor={reescritas} />
          <Contador etiqueta="Fotos que cambiaron" valor={conCambios} />
        </dl>

        {/* La `nota` de la API, literal. Dice qué parte del contexto no tiene historial y quedó con
            el valor de hoy: quien lea los números de abajo necesita saberlo, y parafrasearla acá la
            desincronizaría de lo que el servidor efectivamente hizo. */}
        <p className="text-texto-tenue border-linea border-t pt-3 text-xs text-pretty">{resultado.nota}</p>
      </div>

      {reescritas === 0
        ? (
          <Vacio
            titulo="No había ninguna foto en ese rango"
            descripcion={`Un día sin foto es un día que nadie fotografió, y no se inventa. Revisá las fechas o elegí otro ${GLOSARIO.espacio.singular.toLowerCase()}.`}
          />
          )
        : conCambios === 0
          ? (
            <Vacio
              titulo="Ninguna foto cambió"
              descripcion={`Se recalcularon ${reescritas} fila(s) y todas dieron lo mismo que ya estaba guardado. El histórico quedó igual.`}
            />
            )
          : <TablaDeCambios cambios={cambios} />}

      {sinFoto.length > 0 && <DiasSinFoto dias={sinFoto} />}
    </section>
  )
}

/** Una cifra del resumen, con su nombre. */
function Contador ({ etiqueta, valor }: { etiqueta: string, valor: number }): ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-texto-sutil text-xs">{etiqueta}</dt>
      <dd className="text-texto font-titular text-xl font-extrabold tabular-nums">{valor}</dd>
    </div>
  )
}

/**
 * El antes y el después, una fila por columna cambiada.
 *
 * Se aplana a `fecha × columna` en vez de agrupar por día: lo que se revisa es «qué número se movió
 * y cuánto», y con las columnas anidadas dentro de cada fecha esa comparación obliga a saltar entre
 * bloques de alto distinto. La fecha se repite en cada fila, que es lo que deja ordenar la lectura
 * de arriba abajo.
 *
 * @param cambios el detalle de la API, ya en orden de fecha
 */
function TablaDeCambios ({ cambios }: { cambios: CambioDeFecha[] }): ReactElement {
  return (
    <div className="border-linea rounded-tarjeta overflow-x-auto border">
      <table className="w-full text-sm">
        <caption className="sr-only">Cambios de la foto diaria, por fecha y columna</caption>
        <thead className="bg-superficie-elevada text-texto-tenue">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">Fecha</th>
            <th scope="col" className="px-3 py-2 text-left font-medium">Columna</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Antes</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Después</th>
          </tr>
        </thead>
        <tbody className="divide-linea-suave divide-y">
          {cambios.flatMap((cambio) => (
            Object.entries(cambio.campos).map(([columna, valores]) => (
              <tr key={`${cambio.fecha}-${columna}`}>
                <td className="text-texto-tenue whitespace-nowrap px-3 py-2">{formatearFecha(cambio.fecha)}</td>
                <td className="text-texto px-3 py-2">
                  {NOMBRE_DE_COLUMNA[columna] ?? columna}
                  {COLUMNAS_SIN_HISTORIAL.has(columna) && (
                    <span className="text-texto-sutil ml-2 text-xs">sin historial: es el valor de hoy</span>
                  )}
                </td>
                <td className="text-texto-sutil whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {comoTexto(valores.antes)}
                </td>
                <td className="text-texto whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                  {comoTexto(valores.despues)}
                </td>
              </tr>
            ))
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Los días del rango que nunca tuvieron foto.
 *
 * Se listan y no se esconden: es lo único que permite distinguir «no cambió nada» de «no había nada
 * que cambiar». Un día sin foto es un día que nadie fotografió —el cron no corrió, o el
 * {@link GLOSARIO.espacio} todavía no existía—, y fabricar hoy esa fila sería inventar un pasado que
 * no se midió.
 *
 * @param dias las fechas sin foto, en orden
 */
function DiasSinFoto ({ dias }: { dias: string[] }): ReactElement {
  return (
    <div className="border-linea bg-superficie-hundida rounded-tarjeta flex flex-col gap-2 border p-4">
      <p className="text-texto text-sm font-medium">
        {dias.length === 1 ? 'Un día del rango no tenía foto' : `${dias.length} días del rango no tenían foto`}
      </p>
      <p className="text-texto-tenue text-xs text-pretty">
        No se crearon. Nadie los fotografió en su momento, y escribirlos hoy sería inventar un pasado
        que no se midió.
      </p>
      <ul className="text-texto-sutil flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums">
        {dias.map((dia) => <li key={dia}>{formatearFecha(dia)}</li>)}
      </ul>
    </div>
  )
}
