import { Bloque } from '@/app/portal/(dentro)/detalle'
import { GLOSARIO } from '@/dominio/glosario'
import { Vacio } from '@/componentes/estado/Estados'
import { FilaDeProceso, InsigniaDeResponsable, Nota } from './piezas'
import { rotularResponsable, separarTrabas } from '@/dominio/gestion'
import type { TrabaGestion } from '@/datos/portal'

/**
 * Lo que está detenido, empezando por lo que ustedes pueden destrabar.
 *
 * Es el primer bloque del tablero y no por orden alfabético: el objetivo declarado del cliente es
 * «ver qué se cumple, qué no, y cuáles son las trabas actuales», y de las tres cosas ésta es la
 * única sobre la que se puede hacer algo saliendo de la reunión. Un tablero que abre con volúmenes
 * se mira; uno que abre con la lista de decisiones pendientes se usa.
 *
 * Por eso `responsable = 'cliente'` va separado y arriba, con acento propio: es lo único de toda la
 * pantalla que la gerencia del cliente resuelve sola.
 */
export function Trabas ({ trabas }: { trabas: TrabaGestion[] }) {
  const { del_cliente: delCliente, del_resto: delResto } = separarTrabas(trabas)

  return (
    <Bloque titulo="Trabas y decisiones pendientes">
      {trabas.length === 0
        ? (
          <Vacio
            titulo="Nada detenido al cierre del mes"
            descripcion={`Ninguna ${GLOSARIO.proceso.singular} quedó bloqueada esperando una decisión.`}
          />
          )
        : (
          <div className="flex flex-col gap-6">
            <GrupoDeTrabas
              titulo="Esperan una decisión de ustedes"
              descripcion="Cada día acá es un día que el trabajo no avanza y que se resuelve de este lado."
              trabas={delCliente}
              propia
            />
            <GrupoDeTrabas
              titulo="Las estamos resolviendo nosotros o un tercero"
              descripcion="Van para que la lista esté completa, no porque haya algo que hacer de su lado."
              trabas={delResto}
              propia={false}
            />
          </div>
          )}

      <div className="mt-4">
        <Nota>
          Un bloqueo dice quién tiene que actuar, no quién lo trabó: «depende de ustedes» es la
          decisión que falta, no un reproche. Los días se cuentan hasta el cierre del mes que se está
          mirando, no hasta hoy.
        </Nota>
      </div>
    </Bloque>
  )
}

/**
 * Un grupo de trabas con su encabezado.
 *
 * Un grupo vacío no se dibuja: «no hay ninguna esperando a ustedes» ya se lee en que el grupo de al
 * lado es el único que está.
 */
function GrupoDeTrabas (
  { titulo, descripcion, trabas, propia }:
  { titulo: string, descripcion: string, trabas: TrabaGestion[], propia: boolean }
) {
  if (trabas.length === 0) return null

  return (
    <section
      className={propia ? 'border-acento border-l-2 pl-4' : ''}
      aria-label={titulo}
    >
      <h3 className="text-texto text-sm font-semibold">
        {titulo}
        <span className="text-texto-sutil ml-2 font-normal tabular-nums">{trabas.length}</span>
      </h3>
      <p className="text-texto-tenue mt-0.5 text-xs">{descripcion}</p>

      <ul className="mt-2">
        {trabas.map((traba) => (
          <FilaDeProceso
            key={traba.id}
            proceso={traba}
            destaque={traba.dias_bloqueada === null ? '—' : String(traba.dias_bloqueada)}
            rotuloDelDestaque={traba.dias_bloqueada === 1 ? 'día detenida' : 'días detenida'}
            tono={propia ? 'aviso' : 'neutro'}
            cuerpo={
              <div className="flex flex-col gap-1.5">
                {/* La acción necesaria es el titular y el motivo la explicación, y no al revés: la
                    frase que destraba es lo que alguien tiene que leer para actuar. */}
                {traba.accion_necesaria !== null && (
                  <p className="text-texto text-sm">{traba.accion_necesaria}</p>
                )}
                <p className="text-texto-tenue max-w-prose text-xs leading-relaxed">
                  {traba.motivo}
                </p>
                <InsigniaDeResponsable
                  texto={rotularResponsable(traba.responsable)}
                  propia={propia}
                />
              </div>
            }
          />
        ))}
      </ul>
    </section>
  )
}
