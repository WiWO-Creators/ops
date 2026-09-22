'use client'

import Link from 'next/link'
import type { ReactElement } from 'react'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { EnlacePersonalizado } from '@/componentes/presentadores/EnlacePersonalizado'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { BarraProgreso } from './CabeceraProyecto'
import { Metrica, formatearNumero } from './ResumenProyecto'
import { GraficoHoras } from './GraficoHoras'
import { useRecurso } from './carga'
import { aTextoPlano, formatearImporte, segundosAHoraMinuto } from './formatos'
import { DatoDeFicha as Dato } from './DatoDeFicha'
import {
  montosDeLaFicha,
  simboloDelResumen,
  textoDeDias,
  textoDelPlazo,
  type ProyectoDeFicha,
  type ResumenDeProyecto,
  type TiempoRegistradoDeResumen
} from './overview'
import type { CampoPersonalizado } from '@/datos/recursos'
import type { FuenteDeProyecto } from '@/dominio/fuente-proyecto'

/**
 * Pestaña Descripcion: el resumen del Proyecto en un viaje.
 *
 * **La misma la abren el equipo y el cliente.** Lo unico que cambia es de donde bajan los datos
 * —`fuente`— y cuanto manda cada contrato: el del contacto no publica etiquetas, campos
 * personalizados, tipo de facturacion, gastos ni los importes del tiempo registrado. La regla es una
 * sola y no hay ninguna rama por sujeto: **la clave que no llega no se dibuja**, que no es lo mismo
 * que pintar un cero.
 *
 * Todo lo cuantitativo sale de `{fuente.resumen}`, que replica los calculos del panel (avance,
 * tareas abiertas, dias restantes, tiempo registrado y gastos). **No se recalcula nada aca**:
 * duplicar esas reglas del lado del navegador haria que las dos pantallas del sistema informaran
 * cifras distintas en cuanto una de las dos se toque.
 *
 * Los bloques de dinero se pintan solo si `logged_time.muestra_finanzas` es `true`. Es la regla del
 * panel: sin `create projects` o con facturacion de costo fijo los importes vienen en cero, y
 * mostrarlos seria inventar un "$0" donde no hay dato.
 */

interface PropsPanelDescripcion {
  proyecto: ProyectoDeFicha
  /** Nombre y color del estado, ya resueltos contra `project_statuses`. */
  estado: { nombre: string, color: string | null }
  /**
   * Cliente del Proyecto, ya resuelto por quien monta el panel.
   *
   * Llega resuelto y no como parte del Proyecto porque los dos contratos lo dicen distinto: el del
   * equipo lo trae adentro (`client`), y al contacto la API no le manda el cliente del Proyecto
   * —que es el suyo— sino su propia empresa, en `GET /portal/company`. `href` en `null` cuando quien
   * mira no tiene una pantalla de clientes a donde ir: un enlace que responde 403 es peor que texto.
   */
  cliente: { nombre: string, href: string | null } | null
  /**
   * Nombre del tipo de facturacion, ya resuelto contra `billing_types`.
   *
   * Ausente cuando el contrato del sujeto no lo publica: la fila no se dibuja.
   */
  tipoFacturacion?: string
  /** `true` si quien mira tiene `edit projects`: el panel esconde los montos al resto. */
  puedeVerMontos: boolean
  /** De donde bajan los datos de este Proyecto. Ver `dominio/fuente-proyecto.ts`. */
  fuente: FuenteDeProyecto
  /**
   * Ruta del grafico de horas registradas por dia.
   *
   * `null` cuando el sujeto no tiene ese recurso —el contacto no lo tiene— y entonces el bloque no
   * se monta. No sale de `fuente` porque es un subrecurso del resumen y no una pestaña: el unico
   * que lo pide es este panel.
   */
  rutaDelGrafico: string | null
  /**
   * Si el panel dibuja su fila de indicadores —avance, {procesos}, días y {hitos}—.
   *
   * `true` por defecto, que es como lo usa el panel del equipo. El portal del cliente lo pone en
   * `false` porque debajo de esta ficha va el tablero del Proyecto, que publica esos mismos
   * números con su forma y mejor explicados. Dibujar los dos deja al cliente comparando dos
   * lecturas del mismo dato: un «— DÍAS RESTANTES» sin valor, o una barra de avance del 20 % encima
   * de un medidor que dice 55 % —son dos cuentas distintas, y el cliente no tiene cómo saberlo—.
   *
   * En `false`, y sin gráfico de horas, a la derecha de la ficha no queda nada: la ficha se abre a
   * todo el ancho y reparte sus datos en columnas, en vez de quedar como una tarjeta angosta sola en
   * su fila.
   */
  conIndicadores?: boolean
}

export function PanelDescripcion ({
  proyecto,
  estado,
  cliente,
  tipoFacturacion,
  puedeVerMontos,
  fuente,
  rutaDelGrafico,
  conIndicadores = true
}: PropsPanelDescripcion): ReactElement {
  const { estado: carga, recargar } = useRecurso<ResumenDeProyecto>(
    fuente.resumen,
    'No se pudo cargar el resumen del proyecto.'
  )
  // Si a la derecha de la ficha va algo. Sin nada, la columna lateral no se reserva.
  const conLateral = conIndicadores || rutaDelGrafico !== null

  return (
    <div className="flex flex-col gap-4">
      {/* El avance se dibuja solo si el contrato mando los contadores de Tareas: es su proyeccion
          (`progress_from_tasks`), y sin la pestaña de Tareas el cliente tendria en pantalla un
          porcentaje que no puede explicarse contra ninguna lista. La cabecera del Proyecto publica
          igual el avance del Espacio, asi que no se pierde el dato. Es un indicador mas, y sale
          con ellos: quien los apaga es porque otro bloque ya publica el avance. */}
      {conIndicadores && carga.fase === 'listo' && carga.datos.tasks !== undefined && (
        <div className="flex items-center gap-3">
          <BarraProgreso porcentaje={carga.datos.progress} className="min-w-0 flex-1" />
          <span data-numerico className="text-texto text-sm font-semibold">
            {Math.round(carga.datos.progress)}%
          </span>
        </div>
      )}

      <div className={cn('grid gap-4', conLateral && 'xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]')}>
        <FichaProyecto
          proyecto={proyecto}
          estado={estado}
          cliente={cliente}
          tipoFacturacion={tipoFacturacion}
          puedeVerMontos={puedeVerMontos}
          aTodoElAncho={!conLateral}
        />

        {conLateral && (
          <div className="flex flex-col gap-4">
            {conIndicadores && carga.fase === 'cargando' && <Cargando alto="min-h-52" mensaje="Cargando los indicadores…" />}
            {conIndicadores && carga.fase === 'error' && <ErrorEstado detalle={carga.mensaje} onReintentar={recargar} />}
            {conIndicadores && carga.fase === 'listo' && <Indicadores resumen={carga.datos} />}

            {rutaDelGrafico !== null && <GraficoHoras ruta={rutaDelGrafico} />}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Ficha del proyecto: la lista de campos del resumen del panel.
 *
 * El monto de facturacion solo se muestra con `edit projects`, igual que en el panel: el costo del
 * proyecto y la tarifa por hora son informacion comercial y no la ve cualquier miembro.
 */
type PropsFicha = Pick<PropsPanelDescripcion, 'proyecto' | 'estado' | 'cliente' | 'tipoFacturacion' | 'puedeVerMontos'> & {
  /**
   * `true` cuando la ficha ocupa todo el ancho: los datos se reparten en columnas. Una lista de una
   * sola columna estirada a 1400 px deja el rótulo y su valor a un metro de distancia.
   */
  aTodoElAncho: boolean
}

function FichaProyecto ({
  proyecto,
  estado,
  cliente,
  tipoFacturacion,
  puedeVerMontos,
  aTodoElAncho
}: PropsFicha): ReactElement {
  // El panel viejo guarda la descripcion como HTML. Sin despojarla se leen los `<p>` en pantalla,
  // igual que pasaba con la descripcion de una tarea antes de `aTextoPlano`.
  const descripcion = aTextoPlano(proyecto.description ?? '')
  const montos = montosDeLaFicha(proyecto, puedeVerMontos)

  return (
    <section className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-3 border p-5">
      <h2 className="text-texto text-sm font-semibold">Resumen del {GLOSARIO.espacio.singular.toLowerCase()}</h2>

      <dl className={aTodoElAncho ? 'grid gap-x-8 md:grid-cols-2 xl:grid-cols-3' : 'flex flex-col'}>
        <Dato termino={`${GLOSARIO.espacio.singular} #`}>{proyecto.id}</Dato>

        <Dato termino={GLOSARIO.cliente.singular}>
          {cliente === null
            ? 'Sin cliente'
            : cliente.href === null
              ? cliente.nombre
              : (
                <Link href={cliente.href} className="text-acento underline underline-offset-4">
                  {cliente.nombre}
                </Link>
                )}
        </Dato>

        {tipoFacturacion !== undefined && (
          <Dato termino="Tipo de facturación">{tipoFacturacion}</Dato>
        )}

        {montos.costo !== null && <Dato termino="Costo total">{formatearImporte(montos.costo)}</Dato>}
        {montos.tarifa !== null && (
          <Dato termino="Tarifa por hora">{formatearImporte(montos.tarifa)}</Dato>
        )}

        <Dato termino="Estado"><Insignia color={estado.color}>{estado.nombre}</Insignia></Dato>

        {proyecto.project_created !== undefined && (
          <Dato termino="Fecha de creación"><Fecha valor={proyecto.project_created} /></Dato>
        )}

        <Dato termino="Fecha de inicio"><Fecha valor={proyecto.start_date} /></Dato>

        {proyecto.deadline !== null && (
          <Dato termino="Fecha límite"><Fecha valor={proyecto.deadline} comoVencimiento /></Dato>
        )}
        {proyecto.date_finished !== null && (
          <Dato termino="Fecha de finalización">
            <span className="text-texto-exito"><Fecha valor={proyecto.date_finished} /></span>
          </Dato>
        )}

        {proyecto.estimated_hours !== undefined && (
          <Dato termino="Horas estimadas">{formatearNumero(proyecto.estimated_hours, ' h')}</Dato>
        )}

        {(proyecto.custom_fields ?? []).map((campo) => (
          <Dato key={campo.id} termino={campo.name}>
            <ValorDeCampo campo={campo} />
          </Dato>
        ))}
      </dl>

      {(proyecto.tags ?? []).length > 0 && <Etiquetas etiquetas={proyecto.tags ?? []} maximo={8} />}

      <div className="flex flex-col gap-1">
        <h3 className="text-texto-sutil text-xs">Descripción</h3>
        <p className="text-texto text-sm whitespace-pre-line">
          {descripcion === '' ? 'Sin descripción' : descripcion}
        </p>
      </div>
    </section>
  )
}

/**
 * El valor de un campo personalizado en la ficha.
 *
 * Un campo `type: link` se pinta como enlace abrible y no como texto plano: es lo unico que hace que
 * un "Link de Drive" pegado a mano sirva de algo desde el panel. Se valida antes de convertirlo en
 * `<a>` porque el valor lo escribio una persona y un `href` con un esquema raro es un enlace que el
 * navegador no deberia seguir.
 *
 * `rel="noreferrer"` acompaña a `target="_blank"`: sin el, la pestaña nueva recibe el `Referer` del
 * panel y, en navegadores viejos, un `window.opener` que puede navegar esta.
 */
function ValorDeCampo ({ campo }: { campo: CampoPersonalizado }): ReactElement {
  if (campo.type === 'link') return <EnlacePersonalizado valor={campo.value} />
  return <>{campo.value || '—'}</>
}

/**
 * Tarjetas de Procesos abiertos, Dias restantes, Hitos, Registro total de horas y Gastos.
 *
 * Cada tarjeta y cada bloque dependen de que su clave haya llegado. No es defensa contra un backend
 * roto: es el contrato. `logged_time` solo viaja con `view_task_total_logged_time`, `expenses` solo
 * en el contrato del equipo —produccion no usa el modulo de ventas—, `milestones` solo en el del
 * contacto y `tasks` solo cuando el sujeto tiene la pestaña de Tareas. Pintar un "00:00", un "$0" o
 * un "0 completadas de 9" donde la clave no llego seria inventar una cifra.
 */
function Indicadores ({ resumen }: { resumen: ResumenDeProyecto }): ReactElement {
  const simbolo = simboloDelResumen(resumen)
  const tiempo = resumen.logged_time
  const tareas = resumen.tasks

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tareas !== undefined && (
          <Metrica
            etiqueta={`${GLOSARIO.proceso.plural} abiertas`}
            valor={`${tareas.open} / ${tareas.total}`}
          />
        )}
        <Metrica etiqueta="Días restantes" valor={textoDeDias(resumen.days)} />

        {resumen.milestones !== undefined && (
          <Metrica
            etiqueta={GLOSARIO.hito.plural}
            valor={resumen.milestones.overdue > 0
              ? `${resumen.milestones.total} · ${resumen.milestones.overdue} vencidos`
              : String(resumen.milestones.total)}
          />
        )}

        {tiempo !== undefined && (
          <Metrica etiqueta="Registro total de horas" valor={segundosAHoraMinuto(tiempo.total_seconds)} />
        )}

        {resumen.expenses !== undefined && (
          <Metrica etiqueta="Gastos" valor={formatearImporte(resumen.expenses.total, simbolo)} />
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {tareas !== undefined && (
          <section className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-2 border p-4">
            <h3 className="text-texto text-sm font-semibold">{GLOSARIO.proceso.plural}</h3>
            <BarraProgreso porcentaje={tareas.completed_percent} />
            <p className="text-texto-tenue text-xs">
              {tareas.completed} completadas de {tareas.total} ({Math.round(tareas.completed_percent)}%)
            </p>
          </section>
        )}

        {resumen.days !== null && (
          <section className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-2 border p-4">
            <h3 className="text-texto text-sm font-semibold">Plazo</h3>
            <BarraProgreso porcentaje={resumen.days.left_percent} />
            <p className="text-texto-tenue text-xs">
              {textoDelPlazo(resumen.days)} · {Math.round(resumen.days.left_percent)}%
            </p>
          </section>
        )}
      </div>

      {tiempo !== undefined && tiempo.muestra_finanzas === true && (
        <BloqueDeFinanzas tiempo={tiempo} simbolo={simbolo} />
      )}

      {resumen.expenses !== undefined && (
        <section className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-3 border p-4">
          <h3 className="text-texto text-sm font-semibold">Gastos</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Cifra etiqueta="Total" tiempo={null} importe={resumen.expenses.total} simbolo={simbolo} />
            <Cifra etiqueta="Facturables" tiempo={null} importe={resumen.expenses.billable} simbolo={simbolo} />
            <Cifra etiqueta="Facturados" tiempo={null} importe={resumen.expenses.billed} simbolo={simbolo} />
            <Cifra etiqueta="No facturados" tiempo={null} importe={resumen.expenses.unbilled} simbolo={simbolo} />
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * Desglose facturable / facturado / no facturado del tiempo registrado.
 *
 * Solo se monta con `muestra_finanzas`, que es el unico contrato donde los cuatro pares de claves
 * viajan; los `?? 0` son el piso del tipo, no un valor de negocio.
 *
 * @param tiempo el bloque `logged_time` del resumen
 * @param simbolo simbolo de la moneda, o `null` para el de la instalacion
 * @returns el bloque de importes
 */
function BloqueDeFinanzas ({
  tiempo,
  simbolo
}: {
  tiempo: TiempoRegistradoDeResumen
  simbolo: string | null
}): ReactElement {
  return (
    <section className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-3 border p-4">
      <h3 className="text-texto text-sm font-semibold">Registro total de horas</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cifra etiqueta="Registradas" tiempo={tiempo.total_seconds} importe={null} simbolo={simbolo} />
        <Cifra
          etiqueta="Facturables"
          tiempo={tiempo.billable_seconds ?? 0}
          importe={tiempo.billable_amount ?? 0}
          simbolo={simbolo}
        />
        <Cifra
          etiqueta="Facturadas"
          tiempo={tiempo.billed_seconds ?? 0}
          importe={tiempo.billed_amount ?? 0}
          simbolo={simbolo}
        />
        <Cifra
          etiqueta="No facturadas"
          tiempo={tiempo.unbilled_seconds ?? 0}
          importe={tiempo.unbilled_amount ?? 0}
          simbolo={simbolo}
        />
      </div>
    </section>
  )
}

interface PropsCifra {
  etiqueta: string
  /** Segundos, o `null` si la cifra no tiene componente de tiempo. */
  tiempo: number | null
  /** Importe, o `null` si la cifra no tiene componente de dinero. */
  importe: number | null
  simbolo: string | null
}

/** Una cifra del bloque financiero: tiempo arriba, importe debajo. */
function Cifra ({ etiqueta, tiempo, importe, simbolo }: PropsCifra): ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">
        {etiqueta}
      </span>
      {tiempo !== null && (
        <span data-numerico className="text-texto text-sm font-semibold">{segundosAHoraMinuto(tiempo)}</span>
      )}
      {importe !== null && (
        <span data-numerico className="text-texto-tenue text-sm">{formatearImporte(importe, simbolo)}</span>
      )}
    </div>
  )
}
