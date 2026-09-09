import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from '@/componentes/datos/Tabla'
import { ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import type {
  ClasificacionCorreoEntrante, ConfiguracionCasillaEntrante, FichaCorreoEntrante, ModoCasillaEntrante,
  ResumenCorreosEntrantes
} from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'

export const metadata = { title: 'Correos entrantes · WiWO Ops' }

/** Rótulo y tono de cada clasificación. El reclamo es el único en rojo: es el que hay que ver. */
const CATEGORIAS: Record<ClasificacionCorreoEntrante, { etiqueta: string, tono: TonoInsignia }> = {
  reclamo: { etiqueta: 'Reclamo', tono: 'peligro' },
  solicitud: { etiqueta: 'Solicitud', tono: 'acento' },
  consulta: { etiqueta: 'Consulta', tono: 'neutro' },
  coordinacion: { etiqueta: 'Coordinación', tono: 'neutro' },
  aprobacion: { etiqueta: 'Aprobación', tono: 'exito' },
  comercial: { etiqueta: 'Comercial', tono: 'acento' },
  administrativo: { etiqueta: 'Administrativo', tono: 'contorno' },
  automatico: { etiqueta: 'Automático', tono: 'contorno' },
  otro: { etiqueta: 'Otro', tono: 'contorno' }
}

/** Qué significa cada modo del lector, en la misma escala de riesgo que usa el backend. */
const MODOS: Record<ModoCasillaEntrante, { etiqueta: string, tono: TonoInsignia, detalle: string }> = {
  apagado: {
    etiqueta: 'Apagado',
    tono: 'neutro',
    detalle: 'El cron corre y no se conecta a la casilla. Es como se mergeó y como se queda hasta que alguien lo cambie.'
  },
  prueba: {
    etiqueta: 'Prueba',
    tono: 'aviso',
    detalle: 'Lee y ficha, pero no toca la casilla: no marca leído y no mueve nada. Sirve para mirar las fichas antes de mover un solo correo.'
  },
  real: {
    etiqueta: 'Real',
    tono: 'exito',
    detalle: 'Ficha, marca leído y mueve el original a la carpeta de procesados. El correo no se borra: cambia de carpeta.'
  }
}

/**
 * Tono del score según la escala del prompt: bajo es relación en riesgo, alto es cliente conforme.
 *
 * Los cortes son los mismos que enumera `Prompts::CORREO_ENTRANTE`. Están acá duplicados a propósito
 * y no importados del backend: son la traducción a color de una escala que el prompt define en
 * palabras, y si el prompt cambia los tramos, esta tabla tiene que cambiar con él a mano.
 */
function tonoDeScore (score: number): TonoInsignia {
  if (score <= 25) return 'peligro'
  if (score <= 50) return 'aviso'
  if (score <= 75) return 'neutro'

  return 'exito'
}

/**
 * Distingue el resumen de esta pantalla de cualquier otro que viaje en `meta.pagination.summary`.
 *
 * Hace falta porque ese campo está tipado como la unión de todos los resúmenes de cola del proyecto.
 * Es un guard y no un `as`: si el backend cambia la forma, acá se ve una pantalla sin contadores en
 * vez de un `undefined` explotando al pintar.
 */
function esResumenDeCorreos (valor: unknown): valor is ResumenCorreosEntrantes {
  return typeof valor === 'object' && valor !== null && 'sin_cliente' in valor && 'reclamos' in valor
}

interface Cargado {
  fichas: FichaCorreoEntrante[]
  resumen: ResumenCorreosEntrantes | null
  config: ConfiguracionCasillaEntrante
}

/**
 * Trae las fichas y el estado de la casilla, o el error de la API como valor.
 *
 * Separada de la página para no construir JSX dentro del `try`, igual que en `/administracion`: el
 * lint del proyecto rechaza un `catch` que envuelva render.
 */
async function cargar (): Promise<Cargado | ErrorApi> {
  try {
    const [lista, config] = await Promise.all([
      pedir<FichaCorreoEntrante[]>('/correos-entrantes'),
      pedir<ConfiguracionCasillaEntrante>('/correos-entrantes/settings')
    ])

    const summary = lista.meta?.pagination?.summary

    return {
      fichas: lista.data,
      resumen: esResumenDeCorreos(summary) ? summary : null,
      config: config.data
    }
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/**
 * Correos entrantes: lo que están diciendo los clientes, resumido y puntuado.
 *
 * Un cron lee la casilla corporativa, le saca a cada correo un brief y un score de salud de la
 * relación con el modelo, lo resuelve a un cliente por el dominio del remitente, y deja la ficha.
 * Esta pantalla es la única vista de esas fichas.
 *
 * Es tabla estática y no `TablaRecurso` a propósito: `TablaRecurso` guarda el estado de la vista en
 * la query de la URL y pide sus páginas contra `/api/bff/...`, lo que además exige declarar el
 * prefijo en la lista blanca del BFF. Mientras esto sea una pantalla de lectura sin filtros, la
 * primera página que trajo el servidor alcanza, y el total real lo dice el resumen. Cuando haga
 * falta filtrar por cliente o por clasificación, esto pide su `DefinicionRecurso` propia.
 *
 * `is_superadmin` se revisa antes de pedir nada: la ruta de la API ya exige superadministrador —ahí
 * está la compuerta real— pero pedirla igual gastaría un viaje que sabemos que vuelve 403.
 */
export default async function CorreosEntrantesPage () {
  const { data: yo } = await pedir<Yo>('/me')

  if (!yo.is_superadmin) return <SinPermiso className="mt-10" />

  const cargado = await cargar()

  if (cargado instanceof ErrorApi) {
    if (cargado.codigo === 'forbidden') return <SinPermiso className="mt-10" />

    return <ErrorEstado detalle={cargado.message} className="mt-10" />
  }

  const { fichas, resumen, config } = cargado

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-texto text-xl font-semibold">Correos entrantes</h1>
        <p className="text-texto-tenue mt-1 text-sm">
          Qué están diciendo los clientes. De cada correo que llega a la casilla corporativa queda un
          resumen y un puntaje de salud de la relación. El correo original no se borra nunca al leerlo.
        </p>
      </div>

      <EstadoDeLaCasilla config={config} />

      {resumen !== null && <Contadores resumen={resumen} />}

      {fichas.length === 0
        ? (
          <Vacio
            titulo="Todavía no hay fichas"
            descripcion="Acá aparece un resumen por cada correo que llegue a la casilla. Mientras el lector esté apagado no se lee nada."
          />
          )
        : <TablaDeFichas fichas={fichas} />}
    </section>
  )
}

/**
 * El interruptor y lo que falta para poder prenderlo.
 *
 * Muestra qué falta por nombre de opción —incluida la clave del `.env`— porque sin eso "no anda" es
 * indistinguible de "está apagado a propósito", que es el estado normal.
 */
function EstadoDeLaCasilla ({ config }: { config: ConfiguracionCasillaEntrante }) {
  const modo = MODOS[config.mode]

  return (
    <div className="border-linea bg-superficie-hundida rounded-tarjeta flex flex-col gap-3 border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-texto text-sm font-medium">Lector de la casilla</span>
        <Insignia tono={modo.tono}>{modo.etiqueta}</Insignia>
        {config.purge_enabled && <Insignia tono="peligro">Purga a {config.purge_days} días</Insignia>}
      </div>

      <p className="text-texto-tenue text-sm">{modo.detalle}</p>

      <dl className="text-texto-tenue grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
        <Dato etiqueta="Casilla" valor={config.username === '' ? '—' : config.username} />
        <Dato etiqueta="Servidor" valor={config.host === '' ? '—' : `${config.host}:${config.port}`} />
        <Dato etiqueta="Carpeta" valor={config.folder} />
        <Dato etiqueta="Procesados" valor={config.processed_folder} />
      </dl>

      {!config.imap_available && (
        <p className="text-texto-peligro text-xs">
          Este servidor no tiene la extensión <code>imap</code> de PHP. El lector no puede conectarse
          aunque se encienda.
        </p>
      )}

      {config.missing.length > 0 && (
        <p className="text-texto-aviso text-xs">
          Falta sembrar:{' '}
          {config.missing.map((clave, indice) => (
            <span key={clave}>
              {indice > 0 && ', '}
              <code>{clave}</code>
            </span>
          ))}
          . La contraseña no es un ajuste: va en el <code>.env</code> del servidor.
        </p>
      )}
    </div>
  )
}

function Dato ({ etiqueta, valor }: { etiqueta: string, valor: string }) {
  return (
    <div>
      <dt className="text-texto-sutil">{etiqueta}</dt>
      <dd className="text-texto truncate">{valor}</dd>
    </div>
  )
}

/** Los cuatro números del conjunto entero, no de la página que se está viendo. */
function Contadores ({ resumen }: { resumen: ResumenCorreosEntrantes }) {
  const celdas = [
    { etiqueta: 'fichas', valor: String(resumen.total) },
    { etiqueta: 'reclamos', valor: String(resumen.reclamos) },
    { etiqueta: 'sin cliente', valor: String(resumen.sin_cliente) },
    { etiqueta: 'score promedio', valor: resumen.score_promedio === null ? '—' : String(resumen.score_promedio) }
  ]

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {celdas.map((celda) => (
        <div key={celda.etiqueta} className="border-linea rounded-tarjeta border p-3">
          <dt className="text-texto-tenue text-xs">{celda.etiqueta}</dt>
          <dd className="text-texto text-lg font-semibold">{celda.valor}</dd>
        </div>
      ))}
    </dl>
  )
}

function TablaDeFichas ({ fichas }: { fichas: FichaCorreoEntrante[] }) {
  return (
    <div className="overflow-x-auto">
      <Tabla>
        <EncabezadoTabla>
          <tr>
            <CeldaEncabezado>Remitente</CeldaEncabezado>
            <CeldaEncabezado>Cliente</CeldaEncabezado>
            <CeldaEncabezado>Asunto y resumen</CeldaEncabezado>
            <CeldaEncabezado>Tipo</CeldaEncabezado>
            <CeldaEncabezado numerica>Score</CeldaEncabezado>
            <CeldaEncabezado>Recibido</CeldaEncabezado>
          </tr>
        </EncabezadoTabla>
        <CuerpoTabla>
          {fichas.map((ficha) => (
            <FilaTabla key={ficha.id}>
              <CeldaTabla>
                <span className="text-texto">{ficha.sender_name === '' ? ficha.sender : ficha.sender_name}</span>
                <span className="text-texto-tenue block text-xs">{ficha.domain}</span>
              </CeldaTabla>

              <CeldaTabla>
                {ficha.client_name === null
                  // Sin cliente NO es un error: es el correo que pide que alguien lo mire. Un
                  // prospecto, un proveedor, o un cliente cuyos contactos nunca se cargaron.
                  ? <span className="text-texto-sutil">Sin resolver</span>
                  : ficha.client_name}
              </CeldaTabla>

              <CeldaTabla>
                <span className="text-texto block">{ficha.subject === '' ? '(sin asunto)' : ficha.subject}</span>
                {ficha.brief === null
                  ? <span className="text-texto-aviso block text-xs">Sin resumen: la IA no pudo procesarlo.</span>
                  : <span className="text-texto-tenue block text-xs">{ficha.brief}</span>}
              </CeldaTabla>

              <CeldaTabla>
                <Insignia tono={CATEGORIAS[ficha.category]?.tono ?? 'contorno'}>
                  {CATEGORIAS[ficha.category]?.etiqueta ?? ficha.category}
                </Insignia>
              </CeldaTabla>

              <CeldaTabla numerica>
                {ficha.score === null
                  ? <span className="text-texto-sutil">—</span>
                  : <Insignia tono={tonoDeScore(ficha.score)}>{ficha.score}</Insignia>}
              </CeldaTabla>

              <CeldaTabla><Fecha valor={ficha.received_at} conHora /></CeldaTabla>
            </FilaTabla>
          ))}
        </CuerpoTabla>
      </Tabla>
    </div>
  )
}
