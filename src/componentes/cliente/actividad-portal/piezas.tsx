import Link from 'next/link'
import { Avatar } from '@/componentes/presentadores/Avatar'
import {
  CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla
} from '@/componentes/datos/Tabla'
import {
  etiquetaDeClick,
  etiquetaDeRuta,
  formatearDuracion,
  fraccionDeBarra,
  type ClickRanking,
  type ContactoActivo,
  type DiaDeActividad,
  type FilaDeRanking,
  type ProyectoVisto
} from '@/dominio/actividad-portal'
import { formatearFecha, formatearRelativo } from '@/lib/fechas'
import { cn } from '@/lib/clases'

/** Una cifra grande con su rotulo. `data-contar` la hace subir en la entrada del tablero. */
export function Cifra ({ etiqueta, valor, formato, nota }: {
  etiqueta: string
  valor: number
  formato: 'entero' | 'duracion'
  nota?: string
}) {
  return (
    <div className="flex flex-col gap-1 lg:px-6 lg:first:pl-0">
      <span className="text-texto-tenue text-sm">{etiqueta}</span>
      <span
        data-contar={valor}
        data-formato={formato}
        className="text-texto text-3xl font-semibold tabular-nums"
      >
        {formato === 'duracion' ? formatearDuracion(valor) : new Intl.NumberFormat('es-CL').format(valor)}
      </span>
      {nota !== undefined && <span className="text-texto-sutil text-xs">{nota}</span>}
    </div>
  )
}

/** Una cifra que es una fecha relativa ("hace 2 días"); no sube, solo entra con el resto. */
export function CifraDeFecha ({ etiqueta, valor }: { etiqueta: string, valor: string | null }) {
  return (
    <div className="flex flex-col gap-1 lg:px-6">
      <span className="text-texto-tenue text-sm">{etiqueta}</span>
      <span className="text-texto text-2xl leading-9 font-semibold">{valor === null ? 'Sin visitas' : formatearRelativo(valor)}</span>
      {valor !== null && <span className="text-texto-sutil text-xs">{formatearFecha(valor, true)}</span>}
    </div>
  )
}

/**
 * Sesiones por dia, una columna por dia. Los dias sin actividad se dibujan como una raya fina y no
 * se saltan: un hueco en el eje se lee como "ese dia no existe". La altura es proporcional al dia
 * con mas sesiones del periodo.
 */
export function RitmoDiario ({ serie }: { serie: DiaDeActividad[] }) {
  const maximo = Math.max(0, ...serie.map((d) => d.sesiones))
  const total = serie.reduce((suma, d) => suma + d.sesiones, 0)

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`Sesiones por día: ${total} en ${serie.length} días`}
        className="border-linea flex h-28 items-end gap-0.5 border-b"
      >
        {serie.map((d) => {
          const fraccion = fraccionDeBarra(d.sesiones, maximo)

          return (
            <div
              key={d.dia}
              title={`${formatearFecha(d.dia)}: ${d.sesiones} ${d.sesiones === 1 ? 'sesión' : 'sesiones'}, ${formatearDuracion(d.segundos)}`}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
            >
              {fraccion === 0
                ? <div className="bg-linea h-px" />
                : (
                  <div
                    data-columna
                    style={{ height: `${Math.max(4, Math.round(fraccion * 100))}%` }}
                    className="bg-acento rounded-t-chico origin-bottom"
                  />
                  )}
            </div>
          )
        })}
      </div>
      <div className="text-texto-sutil flex justify-between text-xs tabular-nums">
        <span>{formatearFecha(serie[0]?.dia)}</span>
        <span>{formatearFecha(serie.at(-1)?.dia)}</span>
      </div>
    </div>
  )
}

/** Lista de barras horizontales: lo mas o lo menos visto. Lo que nunca se abrio se dice con palabras. */
export function BarrasDeVistas ({ titulo, descripcion, filas, maximo, vacio }: {
  titulo: string
  descripcion: string
  filas: FilaDeRanking[]
  maximo: number
  vacio: string
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={titulo}>
      <div>
        <h3 className="text-texto text-base font-semibold">{titulo}</h3>
        <p className="text-texto-tenue text-sm">{descripcion}</p>
      </div>
      {filas.length === 0
        ? <p className="text-texto-tenue text-sm">{vacio}</p>
        : (
          <ul className="flex flex-col gap-3">
            {filas.map((f) => (
              <li key={f.clave} data-entrada="item" className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className={cn('min-w-0 truncate', f.nunca ? 'text-texto-tenue' : 'text-texto')}>{f.etiqueta}</span>
                  <span className="text-texto-tenue shrink-0 tabular-nums">
                    {f.nunca
                      ? 'Nunca abierto'
                      : `${f.visitas} ${f.visitas === 1 ? 'visita' : 'visitas'} y ${formatearDuracion(f.segundos)}`}
                  </span>
                </div>
                {!f.nunca && (
                  <div className="h-1.5">
                    <div
                      data-barra
                      style={{ width: `${Math.max(2, Math.round(fraccionDeBarra(f.visitas, maximo) * 100))}%` }}
                      className="bg-acento rounded-chico h-full origin-left"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
          )}
    </section>
  )
}

/** Los Proyectos que mas abren: es el nivel que `Lo mas visto` no puede dar, porque junta todos en uno. */
export function ProyectosMasMirados ({ proyectos }: { proyectos: ProyectoVisto[] }) {
  const maximo = Math.max(0, ...proyectos.map((p) => p.visitas))

  return (
    <section className="flex flex-col gap-3" aria-label="Proyectos que más miran">
      <div>
        <h3 className="text-texto text-base font-semibold">Proyectos que más miran</h3>
        <p className="text-texto-tenue text-sm">Cuáles abren de verdad, y cuánto tiempo pasan en cada uno.</p>
      </div>
      {proyectos.length === 0
        ? <p className="text-texto-tenue text-sm">Todavía no abrieron ningún proyecto en este período.</p>
        : (
          <ul className="flex flex-col gap-3">
            {proyectos.slice(0, 8).map((p) => (
              <li key={p.id} data-entrada="item" className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-texto min-w-0 truncate">{p.nombre ?? 'Un proyecto que ya no existe'}</span>
                  <span className="text-texto-tenue shrink-0 tabular-nums">
                    {`${p.visitas} ${p.visitas === 1 ? 'visita' : 'visitas'} y ${formatearDuracion(p.segundos)}`}
                  </span>
                </div>
                <div className="h-1.5">
                  <div
                    data-barra
                    style={{ width: `${Math.max(2, Math.round(fraccionDeBarra(p.visitas, maximo) * 100))}%` }}
                    className="bg-acento rounded-chico h-full origin-left"
                  />
                </div>
              </li>
            ))}
          </ul>
          )}
    </section>
  )
}

/** Los botones mas pulsados, con la misma forma que las barras de vistas. */
export function ListaDeClicks ({ clicks }: { clicks: ClickRanking[] }) {
  const maximo = Math.max(0, ...clicks.map((c) => c.clicks))

  return (
    <section className="flex flex-col gap-3" aria-label="Botones más pulsados">
      <div>
        <h3 className="text-texto text-base font-semibold">Botones más pulsados</h3>
        <p className="text-texto-tenue text-sm">Lo que el cliente hace, no solo lo que mira.</p>
      </div>
      {clicks.length === 0
        ? <p className="text-texto-tenue text-sm">Todavía no pulsaron ningún botón en este período.</p>
        : (
          <ul className="flex flex-col gap-3">
            {clicks.slice(0, 8).map((c) => (
              <li key={c.objetivo} data-entrada="item" className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-texto min-w-0 truncate">{etiquetaDeClick(c.objetivo)}</span>
                  <span className="text-texto-tenue shrink-0 tabular-nums">{c.clicks}</span>
                </div>
                <div className="h-1.5">
                  <div
                    data-barra
                    style={{ width: `${Math.max(2, Math.round(fraccionDeBarra(c.clicks, maximo) * 100))}%` }}
                    className="bg-acento rounded-chico h-full origin-left"
                  />
                </div>
              </li>
            ))}
          </ul>
          )}
    </section>
  )
}

/** Una fila por contacto que entro al portal en el periodo, con enlace a su recorrido. */
export function TablaDeContactos ({ clienteId, contactos }: {
  clienteId: number
  contactos: ContactoActivo[]
}) {
  return (
    <section className="flex flex-col gap-3" aria-label="Contactos">
      <div>
        <h3 className="text-texto text-base font-semibold">Quién entra</h3>
        <p className="text-texto-tenue text-sm">Pulsa un contacto para ver su recorrido sesión por sesión.</p>
      </div>
      <Tabla>
        <EncabezadoTabla>
          <FilaTabla>
            <CeldaEncabezado>Contacto</CeldaEncabezado>
            <CeldaEncabezado numerica>Sesiones</CeldaEncabezado>
            <CeldaEncabezado numerica>Tiempo</CeldaEncabezado>
            <CeldaEncabezado>Última visita</CeldaEncabezado>
            <CeldaEncabezado>Lo que más abre</CeldaEncabezado>
          </FilaTabla>
        </EncabezadoTabla>
        <CuerpoTabla>
          {contactos.map((c) => (
            <FilaTabla key={c.id} data-entrada="item">
              <CeldaTabla>
                <Link
                  href={`/clientes/${clienteId}/actividad/${c.id}`}
                  className="hover:text-acento flex min-w-0 items-center gap-2"
                >
                  <Avatar nombre={c.nombre} tamano="chico" sinTitulo />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-texto truncate font-medium">{c.nombre}</span>
                    <span className="text-texto-tenue truncate text-xs">{c.email}</span>
                  </span>
                </Link>
              </CeldaTabla>
              <CeldaTabla numerica>{c.sesiones}</CeldaTabla>
              <CeldaTabla numerica>{formatearDuracion(c.segundos)}</CeldaTabla>
              <CeldaTabla sinCortar>{c.ultima_visita === null ? 'Sin visitas' : formatearRelativo(c.ultima_visita)}</CeldaTabla>
              <CeldaTabla>{c.vista_favorita === null ? 'Sin datos' : etiquetaDeRuta(c.vista_favorita)}</CeldaTabla>
            </FilaTabla>
          ))}
        </CuerpoTabla>
      </Tabla>
    </section>
  )
}
