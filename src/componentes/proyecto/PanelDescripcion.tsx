'use client'

import Link from 'next/link'
import type { ReactElement, ReactNode } from 'react'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { GLOSARIO } from '@/dominio/glosario'
import { BarraProgreso } from './CabeceraProyecto'
import { Metrica, formatearNumero } from './ResumenProyecto'
import { GraficoHoras } from './GraficoHoras'
import { useRecurso } from './carga'
import { formatearImporte, segundosAHoraMinuto } from './formatos'
import { textoDeDias } from './overview'
import type { Espacio, ResumenEspacio } from '@/datos/recursos'

/**
 * Pestaña Descripcion: el resumen del Proyecto en un viaje.
 *
 * Todo lo cuantitativo sale de `GET /projects/{id}/overview`, que replica los calculos del panel
 * (avance, tareas abiertas, dias restantes, tiempo registrado y gastos). **No se recalcula nada aca**:
 * duplicar esas reglas del lado del navegador haria que las dos pantallas del sistema informaran
 * cifras distintas en cuanto una de las dos se toque.
 *
 * Los bloques de dinero se pintan solo si `logged_time.muestra_finanzas` es `true`. Es la regla del
 * panel: sin `create projects` o con facturacion de costo fijo los importes vienen en cero, y
 * mostrarlos seria inventar un "$0" donde no hay dato.
 */

interface PropsPanelDescripcion {
  proyecto: Espacio
  /** Nombre y color del estado, ya resueltos contra `project_statuses`. */
  estado: { nombre: string, color: string | null }
  /** Nombre del tipo de facturacion, ya resuelto contra `billing_types`. */
  tipoFacturacion: string
  /** `true` si quien mira tiene `edit projects`: el panel esconde los montos al resto. */
  puedeVerMontos: boolean
}

export function PanelDescripcion ({
  proyecto,
  estado,
  tipoFacturacion,
  puedeVerMontos
}: PropsPanelDescripcion): ReactElement {
  const { estado: carga, recargar } = useRecurso<ResumenEspacio>(
    `projects/${proyecto.id}/overview`,
    'No se pudo cargar el resumen del proyecto.'
  )

  return (
    <div className="flex flex-col gap-4">
      {carga.fase === 'listo' && (
        <div className="flex items-center gap-3">
          <BarraProgreso porcentaje={carga.datos.progress} className="min-w-0 flex-1" />
          <span data-numerico className="text-texto text-sm font-semibold">
            {Math.round(carga.datos.progress)}%
          </span>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <FichaProyecto
          proyecto={proyecto}
          estado={estado}
          tipoFacturacion={tipoFacturacion}
          puedeVerMontos={puedeVerMontos}
        />

        <div className="flex flex-col gap-4">
          {carga.fase === 'cargando' && <Cargando filas={2} alto="h-24" />}
          {carga.fase === 'error' && <ErrorEstado detalle={carga.mensaje} onReintentar={recargar} />}
          {carga.fase === 'listo' && <Indicadores resumen={carga.datos} />}

          <GraficoHoras proyectoId={proyecto.id} />
        </div>
      </div>
    </div>
  )
}

/** Una entrada de la ficha: termino y definicion, en una fila. */
function Dato ({ termino, children }: { termino: string, children: ReactNode }): ReactElement {
  return (
    <div className="border-linea-suave flex flex-wrap items-baseline justify-between gap-2 border-b py-2 last:border-b-0">
      <dt className="text-texto-sutil text-xs">{termino}</dt>
      <dd className="text-texto min-w-0 text-sm">{children}</dd>
    </div>
  )
}

/**
 * Ficha del proyecto: la lista de campos del resumen del panel.
 *
 * El monto de facturacion solo se muestra con `edit projects`, igual que en el panel: el costo del
 * proyecto y la tarifa por hora son informacion comercial y no la ve cualquier miembro.
 */
function FichaProyecto ({
  proyecto,
  estado,
  tipoFacturacion,
  puedeVerMontos
}: PropsPanelDescripcion): ReactElement {
  return (
    <section className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-3 border p-5">
      <h2 className="text-texto text-sm font-semibold">Resumen del {GLOSARIO.espacio.singular.toLowerCase()}</h2>

      <dl className="flex flex-col">
        <Dato termino={`${GLOSARIO.espacio.singular} #`}>{proyecto.id}</Dato>

        <Dato termino={GLOSARIO.cliente.singular}>
          {proyecto.client === null
            ? 'Sin cliente'
            : (
              <Link
                href={`/clientes?filter[id]=${proyecto.client.id}`}
                className="text-acento underline underline-offset-4"
              >
                {proyecto.client.company}
              </Link>
              )}
        </Dato>

        <Dato termino="Tipo de facturación">{tipoFacturacion}</Dato>

        {puedeVerMontos && proyecto.billing_type === 1 && (
          <Dato termino="Costo total">{formatearImporte(proyecto.project_cost)}</Dato>
        )}
        {puedeVerMontos && proyecto.billing_type === 2 && (
          <Dato termino="Tarifa por hora">{formatearImporte(proyecto.project_rate_per_hour)}</Dato>
        )}

        <Dato termino="Estado"><Insignia color={estado.color}>{estado.nombre}</Insignia></Dato>
        <Dato termino="Fecha de creación"><Fecha valor={proyecto.project_created} /></Dato>
        <Dato termino="Fecha de inicio"><Fecha valor={proyecto.start_date} /></Dato>

        {proyecto.deadline !== null && (
          <Dato termino="Fecha límite"><Fecha valor={proyecto.deadline} comoVencimiento /></Dato>
        )}
        {proyecto.date_finished !== null && (
          <Dato termino="Fecha de finalización">
            <span className="text-texto-exito"><Fecha valor={proyecto.date_finished} /></span>
          </Dato>
        )}

        <Dato termino="Horas estimadas">{formatearNumero(proyecto.estimated_hours, ' h')}</Dato>

        {(proyecto.custom_fields ?? []).map((campo) => (
          <Dato key={campo.id} termino={campo.name}>{campo.value ?? '—'}</Dato>
        ))}
      </dl>

      {proyecto.tags.length > 0 && <Etiquetas etiquetas={proyecto.tags} maximo={8} />}

      <div className="flex flex-col gap-1">
        <h3 className="text-texto-sutil text-xs">Descripción</h3>
        <p className="text-texto text-sm whitespace-pre-line">
          {proyecto.description ?? 'Sin descripción'}
        </p>
      </div>
    </section>
  )
}

/**
 * Tarjetas de Tareas abiertas, Dias restantes, Registro total de horas y Gastos.
 *
 * Las dos ultimas dependen de `muestra_finanzas`: cuando el backend lo apaga, los importes vienen en
 * cero y no se pintan.
 */
function Indicadores ({ resumen }: { resumen: ResumenEspacio }): ReactElement {
  const simbolo = resumen.currency?.symbol ?? null

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metrica
          etiqueta={`${GLOSARIO.proceso.plural} abiertas`}
          valor={`${resumen.tasks.open} / ${resumen.tasks.total}`}
        />
        <Metrica etiqueta="Días restantes" valor={textoDeDias(resumen.days)} />
        <Metrica
          etiqueta="Registro total de horas"
          valor={segundosAHoraMinuto(resumen.logged_time.total_seconds)}
        />
        <Metrica etiqueta="Gastos" valor={formatearImporte(resumen.expenses.total, simbolo)} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-2 border p-4">
          <h3 className="text-texto text-sm font-semibold">{GLOSARIO.proceso.plural}</h3>
          <BarraProgreso porcentaje={resumen.tasks.completed_percent} />
          <p className="text-texto-tenue text-xs">
            {resumen.tasks.completed} completadas de {resumen.tasks.total} ({Math.round(resumen.tasks.completed_percent)}%)
          </p>
        </section>

        {resumen.days !== null && (
          <section className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-2 border p-4">
            <h3 className="text-texto text-sm font-semibold">Plazo</h3>
            <BarraProgreso porcentaje={resumen.days.left_percent} />
            <p className="text-texto-tenue text-xs">
              {textoDeDias(resumen.days)} días · {Math.round(resumen.days.left_percent)}%
            </p>
          </section>
        )}
      </div>

      {resumen.logged_time.muestra_finanzas && (
        <section className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-3 border p-4">
          <h3 className="text-texto text-sm font-semibold">Registro total de horas</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Cifra
              etiqueta="Registradas"
              tiempo={resumen.logged_time.total_seconds}
              importe={null}
              simbolo={simbolo}
            />
            <Cifra
              etiqueta="Facturables"
              tiempo={resumen.logged_time.billable_seconds}
              importe={resumen.logged_time.billable_amount}
              simbolo={simbolo}
            />
            <Cifra
              etiqueta="Facturadas"
              tiempo={resumen.logged_time.billed_seconds}
              importe={resumen.logged_time.billed_amount}
              simbolo={simbolo}
            />
            <Cifra
              etiqueta="No facturadas"
              tiempo={resumen.logged_time.unbilled_seconds}
              importe={resumen.logged_time.unbilled_amount}
              simbolo={simbolo}
            />
          </div>
        </section>
      )}

      <section className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-3 border p-4">
        <h3 className="text-texto text-sm font-semibold">Gastos</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Cifra etiqueta="Total" tiempo={null} importe={resumen.expenses.total} simbolo={simbolo} />
          <Cifra etiqueta="Facturables" tiempo={null} importe={resumen.expenses.billable} simbolo={simbolo} />
          <Cifra etiqueta="Facturados" tiempo={null} importe={resumen.expenses.billed} simbolo={simbolo} />
          <Cifra etiqueta="No facturados" tiempo={null} importe={resumen.expenses.unbilled} simbolo={simbolo} />
        </div>
      </section>
    </div>
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
      <span className="text-texto-sutil text-[0.6875rem] font-medium tracking-[0.08em] uppercase">
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
