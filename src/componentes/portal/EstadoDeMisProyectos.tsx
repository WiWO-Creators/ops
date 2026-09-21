import Link from 'next/link'
import {
  AlertTriangle, ArrowRight, CircleCheck, CircleHelp, Flag, ListChecks, OctagonAlert
} from 'lucide-react'
import { Cifra } from '@/componentes/gestion/piezas'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { Vacio } from '@/componentes/estado/Estados'
import { SIN_DATO, formatearPorcentaje } from '@/dominio/gestion'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { formatearVencimiento } from '@/lib/fechas'
import type { EspacioPortal, ResumenPortal } from '@/datos/portal'
import { Aclaracion, BloqueDeLista, LoQueEstaTrabado, ProximosHitos, Tarjeta } from './piezas'
import {
  MOTIVO_SIN_BLOQUEOS,
  MOTIVO_SIN_ESPERA,
  MOTIVO_SIN_PROCESOS,
  leerBloqueos,
  leerHitos,
  leerProximosHitos
} from './resumen'
import {
  MOTIVO_SIN_EN_CURSO,
  MOTIVO_SIN_ESPACIOS,
  TEXTO_HITO_FUERA_DE_LISTA,
  TEXTO_SIN_HITOS,
  contarEnCurso,
  filasDeAvance,
  leerLoQueNecesitaAlCliente,
  leerProcesos,
  textoDeTareasAbiertas,
  type FilaDeAvance,
  type LecturaDeEnCurso,
  type LecturaDelProximoHito,
  type LoQueNecesitaAlCliente
} from './estado'

/**
 * El estado de los {espacios} del cliente, en una pantalla.
 *
 * === POR QUE EXISTE, Y QUE NO ES ===
 *
 * El cliente pidio «ver el estado del proyecto» y ese dato ya estaba: repartido entre la portada
 * —que tiene los totales de todos sus {espacios} juntos— y la ficha de cada {espacio} —que tiene el
 * detalle de uno—. Lo que faltaba es el medio: sus {espacios} uno al lado del otro, cada uno con su
 * avance, su proxima entrega y lo que tenga detenido. Sin eso, responder «¿cómo vamos?» costaba
 * abrir los {espacios} de a uno y sumarlos de cabeza.
 *
 * NO es el tablero mensual de `/portal/gestion`: ese mide al equipo para la gerencia, vive detras de
 * un interruptor y habla de medianas y de retrabajo. Este lo ve cualquier contacto, esta siempre
 * disponible y contesta una sola pregunta: **cómo van mis {espacios} y qué necesita algo de mí**.
 *
 * === EL ORDEN DE LA PANTALLA ES EL ARGUMENTO ===
 *
 * Arriba de todo, lo unico que le pide algo al cliente. Despues el panorama, que le dice si tiene
 * que preocuparse. Despues el avance {espacio} por {espacio}, que es lo que vino a ver. Y al final
 * las dos listas transversales —que se entrega y que esta detenido—, que son el detalle de lo que
 * las señales de arriba ya anunciaron.
 *
 * === LAS AUSENCIAS SE DIBUJAN COMO AUSENCIAS ===
 *
 * `procesos` y `bloqueados` pueden NO VENIR como clave, y `esperando_tu_respuesta` y
 * `dias_bloqueada` pueden ser `null`. Ninguno de los cuatro se pinta como 0: un cero acá se lee «no
 * te falta nada» y los cuatro significan «no hay de donde contarlo». Quien lo decide es
 * `componentes/portal/estado.ts` y `componentes/portal/resumen.ts`, nunca este archivo.
 *
 * Server Component sin estado: no hay nada que tocar, solo enlaces.
 *
 * @param resumen lo que devolvio `GET /portal/resumen`, el unico agregado que no se pagina
 * @param espacios las filas de `GET /portal/projects`, o `null` si la seccion no es para este
 *   contacto
 */
export function EstadoDeMisProyectos (
  { resumen, espacios }: { resumen: ResumenPortal, espacios: EspacioPortal[] | null }
) {
  if (resumen.espacios.total === 0) {
    return (
      <Vacio
        titulo={`Todavía no hay ${GLOSARIO.espacio.plural.toLowerCase()} para mostrarte`}
        descripcion={MOTIVO_SIN_ESPACIOS}
      />
    )
  }

  const enCurso = contarEnCurso(espacios ?? [], resumen.espacios.total)

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header>
        <h1 className="font-titular text-texto text-xl font-semibold">
          Estado de mis {GLOSARIO.espacio.plural.toLowerCase()}
        </h1>
        <p className="text-texto-tenue mt-1 text-sm">
          Cómo van tus {GLOSARIO.espacio.plural.toLowerCase()} y qué necesita algo de tu parte.
        </p>
      </header>

      <LoQueTeNecesita lectura={leerLoQueNecesitaAlCliente(resumen)} />

      <Panorama resumen={resumen} enCurso={enCurso} />

      <AvancePorEspacio resumen={resumen} espacios={espacios} />

      <ProximosHitos lectura={leerProximosHitos(resumen.proximos_hitos, resumen.hitos)} />

      <LoQueEstaTrabado lectura={leerBloqueos(resumen.bloqueados)} />
    </section>
  )
}

/**
 * Lo unico accionable de la pantalla, arriba de todo y en el tono que le corresponda.
 *
 * Son dos preguntas distintas con la misma respuesta practica —«¿tengo que hacer algo?»—: las
 * {procesos} que esperan su visto bueno y lo que esta detenido de su lado. Van juntas porque
 * separarlas obligaria al cliente a leer dos carteles para contestarse una sola cosa.
 *
 * Tres caras, y la tercera es la que se suele olvidar: cuando alguna de las dos mitades no se puede
 * averiguar, la tarjeta se dibuja apagada y lo dice. Un cartel verde sobre un dato que nadie pudo
 * mirar tranquiliza al cliente sobre algo que no se sabe.
 *
 * @param lectura lo que decidio `leerLoQueNecesitaAlCliente()`
 */
function LoQueTeNecesita ({ lectura }: { lectura: LoQueNecesitaAlCliente }) {
  if (lectura.hayAlgoQueHacer) {
    return (
      <Tarjeta
        tono="atencion"
        icono={<AlertTriangle size={16} aria-hidden="true" className="shrink-0" />}
      >
        <p className="text-texto text-sm font-semibold">Esto te está esperando</p>
        <Pendientes lectura={lectura} />
        <Link
          href="/portal/proyectos"
          className="text-acento mt-3 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
        >
          Ir a mis {GLOSARIO.espacio.plural.toLowerCase()}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </Tarjeta>
    )
  }

  if (lectura.hayAlgoQueNoSeSabe) {
    return (
      <Tarjeta
        tono="apagado"
        icono={<CircleHelp size={16} aria-hidden="true" className="shrink-0" />}
      >
        <p className="text-texto text-sm font-semibold">No podemos decirte si algo te espera</p>
        <Pendientes lectura={lectura} />
      </Tarjeta>
    )
  }

  return (
    <Tarjeta
      tono="tranquilo"
      icono={<CircleCheck size={16} aria-hidden="true" className="shrink-0" />}
    >
      <p className="text-texto text-sm font-semibold">Nada necesita tu respuesta</p>
      <p className="text-texto-tenue mt-1 text-sm">
        Cuando necesitemos tu visto bueno para seguir, o algo se trabe esperándote, lo vas a ver
        acá.
      </p>
    </Tarjeta>
  )
}

/**
 * Las dos mitades de lo que espera al cliente, escritas una debajo de la otra.
 *
 * Se dibujan SIEMPRE las dos, tambien la que esta al dia: si solo se escribiera la que pide algo,
 * el cliente no podria distinguir «lo otro está bien» de «lo otro no lo miramos», que es justo la
 * diferencia que esta pantalla se propone no borrar.
 *
 * @param lectura lo que decidio `leerLoQueNecesitaAlCliente()`
 */
function Pendientes ({ lectura }: { lectura: LoQueNecesitaAlCliente }) {
  const { aprobaciones, trabas } = lectura

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div>
        <p className="text-texto text-sm">
          {aprobaciones.clase === 'pendiente' && (
            <>
              <span data-numerico className="tabular-nums font-semibold">
                {aprobaciones.cuantas}
              </span>
              {' '}
              {aprobaciones.cuantas === 1
                ? `${GLOSARIO.proceso.singular.toLowerCase()} espera`
                : `${GLOSARIO.proceso.plural.toLowerCase()} esperan`}
              {' '}tu visto bueno
            </>
          )}
          {aprobaciones.clase === 'al_dia'
            && `Ninguna ${GLOSARIO.proceso.singular.toLowerCase()} espera tu visto bueno`}
          {aprobaciones.clase === 'no_se_sabe'
            && `No podemos contar las ${GLOSARIO.proceso.plural.toLowerCase()} que esperan tu visto bueno`}
        </p>
        {aprobaciones.clase === 'no_se_sabe' && (
          <p className="text-texto-tenue mt-0.5 text-xs">{MOTIVO_SIN_ESPERA}</p>
        )}
      </div>

      <div>
        <p className="text-texto text-sm">
          {trabas.clase === 'tuyas' && (
            <>
              <span data-numerico className="tabular-nums font-semibold">
                {trabas.filas.length}
              </span>
              {' '}
              {trabas.filas.length === 1 ? 'cosa trabada depende' : 'cosas trabadas dependen'}
              {' '}de vos
            </>
          )}
          {trabas.clase === 'ninguna' && 'Nada trabado depende de vos'}
          {trabas.clase === 'no_se_sabe' && 'No podemos decirte si hay algo trabado esperándote'}
        </p>
        {trabas.clase === 'no_se_sabe' && (
          <p className="text-texto-tenue mt-0.5 text-xs">{MOTIVO_SIN_BLOQUEOS}</p>
        )}
        {trabas.clase === 'tuyas' && (
          <ul className="mt-1 flex flex-col gap-0.5">
            {trabas.filas.map((bloqueo) => (
              <li key={bloqueo.id} className="text-texto-tenue text-xs">
                {bloqueo.name} · {bloqueo.project.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * Los cuatro numeros que contestan «¿tengo que preocuparme?» antes de mirar nada mas.
 *
 * Salen de `GET /portal/resumen` —el unico agregado que el servidor calcula sobre TODOS los
 * {espacios}— y no de la lista de abajo, que viene paginada. La excepcion es «en curso», que si
 * necesita la lista porque depende de la fecha de cierre de cada {espacio}: cuando la lista vino
 * cortada, el numero no se da y se explica por que. Un contador calculado sobre media lista es
 * menor que el verdadero y no lo parece.
 *
 * @param resumen lo que devolvio `GET /portal/resumen`
 * @param enCurso lo que decidio `contarEnCurso()`
 */
function Panorama (
  { resumen, enCurso }: { resumen: ResumenPortal, enCurso: LecturaDeEnCurso }
) {
  const procesos = leerProcesos(resumen.procesos)
  const hitos = leerHitos(resumen.hitos)

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Dato
          etiqueta={`${GLOSARIO.espacio.plural} en curso`}
          valor={enCurso.clase === 'contados' ? String(enCurso.enCurso) : SIN_DATO}
          detalle={`${enCurso.total} en total`}
        />
        <Dato
          etiqueta={`${GLOSARIO.proceso.plural} abiertas`}
          valor={procesos.clase === 'sabido' ? String(procesos.abiertas) : SIN_DATO}
        />
        <Dato
          etiqueta="Avance"
          valor={procesos.clase === 'sabido' ? formatearPorcentaje(procesos.avance) : SIN_DATO}
          detalle={procesos.clase === 'sabido' ? 'De todo lo que compartimos' : undefined}
        />
        <Dato
          etiqueta={`${GLOSARIO.hito.plural} vencidos`}
          valor={hitos.clase === 'sin_hitos' ? SIN_DATO : String(resumen.hitos.overdue)}
          tono={hitos.clase === 'vencidos' ? 'peligro' : 'neutro'}
          detalle={
            hitos.clase === 'sin_hitos' ? 'Ninguno comprometido' : `de ${resumen.hitos.total}`
          }
        />
      </div>

      {enCurso.clase === 'incompleto' && <Aclaracion>{MOTIVO_SIN_EN_CURSO}</Aclaracion>}
      {procesos.clase === 'no_se_sabe' && <Aclaracion>{MOTIVO_SIN_PROCESOS}</Aclaracion>}
    </div>
  )
}

/**
 * Una cifra del panorama dentro de su tarjeta.
 *
 * `Cifra` es la misma pieza que usa el tablero de gestion —con su guion para lo que no se sabe y su
 * semaforo— y acá solo se le pone el marco: dos componentes distintos para el mismo numero es como
 * las dos pantallas del portal empiezan a escribir los porcentajes distinto.
 */
function Dato (props: React.ComponentProps<typeof Cifra>) {
  return (
    <div className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 border p-4">
      <Cifra {...props} />
    </div>
  )
}

/**
 * El corazon de la pantalla: un {espacio} por fila, con lo que hace falta para no abrirlo.
 *
 * Lo que la fila cruza —el proximo {hito} y lo detenido— llega en dos listas transversales del
 * resumen, no dentro de cada {espacio}: ese cruce es `filasDeAvance()`, que ademas sube al principio
 * los que necesitan atencion. El orden importa mas que el contenido: una lista alfabetica obliga a
 * leerla entera para encontrar el {espacio} con problemas, que es exactamente lo que esta pantalla
 * vino a evitar.
 *
 * @param resumen lo que devolvio `GET /portal/resumen`
 * @param espacios las filas de `GET /portal/projects`, o `null` si no se pudieron pedir
 */
function AvancePorEspacio (
  { resumen, espacios }: { resumen: ResumenPortal, espacios: EspacioPortal[] | null }
) {
  if (espacios === null || espacios.length === 0) {
    return (
      <Tarjeta tono="apagado" icono={<CircleHelp size={16} aria-hidden="true" className="shrink-0" />}>
        <p className="text-texto text-sm font-medium">
          No pudimos traer el detalle de tus {GLOSARIO.espacio.plural.toLowerCase()}
        </p>
        <p className="text-texto-tenue mt-1 text-sm">
          Los números de arriba siguen siendo ciertos. Probá de nuevo en un rato, o abrí la lista
          completa desde el menú.
        </p>
      </Tarjeta>
    )
  }

  const filas = filasDeAvance(espacios, resumen.proximos_hitos, resumen.bloqueados)

  return (
    <BloqueDeLista
      titulo={`Avance por ${GLOSARIO.espacio.singular.toLowerCase()}`}
      icono={<ListChecks size={14} aria-hidden="true" className="shrink-0" />}
    >
      {filas.map((fila) => <FilaDeEspacio key={fila.espacio.id} fila={fila} />)}
    </BloqueDeLista>
  )
}

/**
 * Un {espacio} con su avance, sus {procesos} abiertas, su proxima entrega y sus señales.
 *
 * La barra lleva su porcentaje al lado y no encima: el numero es el dato exacto y la barra es la
 * comparacion de un vistazo entre filas, y las dos hacen falta. El resto de la fila es texto —no hay
 * un segundo grafico— porque una fila con dos dibujos deja de compararse con la de arriba.
 *
 * Las señales son insignia CON palabra y nunca un color solo: quien no distingue el rojo del gris
 * tiene que poder leer «Trabado» y «{Hito} vencido».
 *
 * @param fila la fila ya cruzada y ordenada por `filasDeAvance()`
 */
function FilaDeEspacio ({ fila }: { fila: FilaDeAvance }) {
  const { espacio } = fila
  const trabado = fila.trabados !== null && fila.trabados.length > 0
  const vencido = fila.hito.clase === 'proximo' && fila.hito.hito.vencido

  return (
    <li
      className={cn(
        'rounded-tarjeta border p-3',
        trabado || vencido
          ? 'border-linea-fuerte bg-superficie-hundida border-l-4'
          : 'border-linea-suave'
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Link
          href={`/portal/proyectos/${espacio.id}`}
          className="text-texto hover:text-acento min-w-0 text-sm font-medium underline-offset-4 hover:underline"
        >
          {espacio.name}
        </Link>

        <span className="flex flex-wrap items-center gap-1.5">
          {trabado && (
            <Insignia tono={fila.esperaAlCliente ? 'acento' : 'aviso'} tamano="chico">
              <OctagonAlert size={12} aria-hidden="true" className="shrink-0" />
              {fila.esperaAlCliente ? 'Trabado · depende de vos' : 'Trabado'}
            </Insignia>
          )}
          {vencido && (
            <Insignia tono="peligro" tamano="chico">
              <Flag size={12} aria-hidden="true" className="shrink-0" />
              {GLOSARIO.hito.singular} vencido
            </Insignia>
          )}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <BarraProgreso porcentaje={espacio.progress} className="min-w-0 flex-1" />
        <span data-numerico className="text-texto w-12 text-right text-sm font-semibold tabular-nums">
          {formatearPorcentaje(espacio.progress)}
        </span>
      </div>

      <p className="text-texto-tenue mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
        <span>{textoDeTareasAbiertas(espacio.counts)}</span>
        <ProximaEntrega lectura={fila.hito} />
      </p>
    </li>
  )
}

/**
 * Que entrega viene en este {espacio}, o por que no se puede nombrar ninguna.
 *
 * Los tres casos se escriben distinto porque significan cosas distintas: hay uno y es este; hay
 * {hitos} pero ninguno entro en la lista que manda el servidor; y no hay ninguno comprometido.
 * Juntar los dos ultimos en «sin {hitos}» contradiria al contador que esta en la misma fila.
 *
 * @param lectura lo que decidio `filasDeAvance()` para este {espacio}
 */
function ProximaEntrega ({ lectura }: { lectura: LecturaDelProximoHito }) {
  if (lectura.clase === 'sin_hitos') return <span>{TEXTO_SIN_HITOS}</span>
  if (lectura.clase === 'fuera_de_lista') return <span>{TEXTO_HITO_FUERA_DE_LISTA}</span>

  return (
    <span className={cn(lectura.hito.vencido && 'text-texto-peligro font-medium')}>
      {GLOSARIO.hito.singular}: {lectura.hito.name} · {formatearVencimiento(lectura.hito.due_date)}
    </span>
  )
}
