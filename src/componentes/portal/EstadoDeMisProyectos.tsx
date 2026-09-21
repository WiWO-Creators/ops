import Link from 'next/link'
import {
  AlertTriangle, ArrowRight, CalendarClock, CircleCheck, CircleHelp, Flag, ListChecks, OctagonAlert
} from 'lucide-react'
import { EstadoDelPortal } from '@/app/portal/(dentro)/detalle'
import { Cifra } from '@/componentes/gestion/piezas'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { textoDelPlazo, type ResumenDeProyecto } from '@/componentes/proyecto/overview'
import { Vacio } from '@/componentes/estado/Estados'
import { SIN_DATO, formatearPorcentaje } from '@/dominio/gestion'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { formatearVencimiento } from '@/lib/fechas'
import type { EspacioPortal, ResumenPortal } from '@/datos/portal'
import { Aclaracion, FilaTrabada, LoQueEstaTrabado, ProximosHitos, Tarjeta } from './piezas'
import type { BloqueoLeido } from './resumen'
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
  type FilaDeAvance,
  type LecturaDeEnCurso,
  type LecturaDeHitosDelEspacio,
  type LecturaDePlazo,
  type LecturaDeTareas,
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
 * @param detalles lo que devolvio `/overview` por {espacio}; los que no lo comparten no estan
 */
export function EstadoDeMisProyectos (
  { resumen, espacios, detalles }:
  {
    resumen: ResumenPortal
    espacios: EspacioPortal[] | null
    detalles: ReadonlyMap<number, ResumenDeProyecto>
  }
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

      <AvancePorEspacio resumen={resumen} espacios={espacios} detalles={detalles} />

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
 * El corazon de la pantalla: una tarjeta por {espacio}, con todo lo que se sabe de el.
 *
 * Es lo que separa un dashboard de un indice. Cada tarjeta cruza TRES respuestas distintas —la
 * lista, el resumen transversal y el detalle del propio {espacio}— y las presenta juntas: estado,
 * las tres fechas, el avance contra el plazo, las tres cuentas de {procesos}, los {hitos} que vienen
 * y lo que esta detenido. Ese cruce es `filasDeAvance()`, que ademas sube al principio los que
 * necesitan atencion: una lista alfabetica obliga a leerla entera para encontrar el {espacio} con
 * problemas, que es justo lo que esta pantalla vino a evitar.
 *
 * @param resumen lo que devolvio `GET /portal/resumen`
 * @param espacios las filas de `GET /portal/projects`, o `null` si no se pudieron pedir
 * @param detalles lo que devolvio `/overview` por {espacio}; los que no lo comparten no estan
 */
function AvancePorEspacio (
  { resumen, espacios, detalles }:
  {
    resumen: ResumenPortal
    espacios: EspacioPortal[] | null
    detalles: ReadonlyMap<number, ResumenDeProyecto>
  }
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

  const filas = filasDeAvance(espacios, resumen.proximos_hitos, resumen.bloqueados, detalles)

  return (
    <section aria-label={`Avance por ${GLOSARIO.espacio.singular.toLowerCase()}`} className="flex flex-col gap-3">
      <h2 className="font-titular text-texto flex items-center gap-1.5 text-sm font-semibold">
        <ListChecks size={14} aria-hidden="true" className="shrink-0" />
        Avance por {GLOSARIO.espacio.singular.toLowerCase()}
      </h2>

      {filas.map((fila) => <TarjetaDeEspacio key={fila.espacio.id} fila={fila} />)}
    </section>
  )
}

/**
 * Un {espacio} entero: estado, fechas, avance contra plazo, {procesos}, {hitos} y lo detenido.
 *
 * Deja de ser una fila y pasa a ser una tarjeta porque lo que se muestra dejo de caber en un
 * renglon, y apretarlo en uno lo volvia ilegible. Cada tarjeta se lee sola y responde «¿cómo va este
 * {espacio}?» sin abrirlo, que es lo que el cliente vino a preguntar.
 *
 * Las señales son insignia CON palabra y nunca un color solo: quien no distingue el rojo del gris
 * tiene que poder leer «Trabado», «{Hito} vencido» y «Entrega vencida».
 *
 * @param fila la tarjeta ya cruzada y ordenada por `filasDeAvance()`
 */
function TarjetaDeEspacio ({ fila }: { fila: FilaDeAvance }) {
  const { espacio, plazo } = fila
  const trabado = fila.trabados !== null && fila.trabados.length > 0
  const hitosVencidos = fila.hitos.clase === 'proximos' && fila.hitos.vencidos > 0
  const atencion = trabado || hitosVencidos || plazo.clase === 'vencido'

  return (
    <article
      className={cn(
        'rounded-tarjeta bg-superficie-elevada shadow-1 border p-4',
        atencion ? 'border-linea-fuerte border-l-4' : 'border-linea'
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        <h3 className="min-w-0 text-base font-semibold">
          <Link
            href={`/portal/proyectos/${espacio.id}`}
            className="text-texto hover:text-acento underline-offset-4 hover:underline"
          >
            {espacio.name}
          </Link>
        </h3>

        <span className="flex flex-wrap items-center gap-1.5">
          <EstadoDelPortal catalogo="project_statuses" valor={espacio.status} />
          {trabado && (
            <Insignia tono={fila.esperaAlCliente ? 'acento' : 'aviso'} tamano="chico">
              <OctagonAlert size={12} aria-hidden="true" className="shrink-0" />
              {fila.esperaAlCliente ? 'Trabado · depende de vos' : 'Trabado'}
            </Insignia>
          )}
          {hitosVencidos && (
            <Insignia tono="peligro" tamano="chico">
              <Flag size={12} aria-hidden="true" className="shrink-0" />
              {GLOSARIO.hito.singular} vencido
            </Insignia>
          )}
          {plazo.clase === 'vencido' && (
            <Insignia tono="peligro" tamano="chico">
              <CalendarClock size={12} aria-hidden="true" className="shrink-0" />
              Entrega vencida
            </Insignia>
          )}
        </span>
      </div>

      <Medidores fila={fila} />

      <dl className="border-linea-suave mt-4 grid gap-x-6 gap-y-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
        <Dupla rotulo="Inicio" valor={formatearVencimiento(espacio.start_date)} />
        <Dupla rotulo="Entrega" valor={<TextoDePlazo plazo={plazo} />} />
        <Dupla rotulo={GLOSARIO.proceso.plural} valor={<TextoDeTareas lectura={fila.tareas} />} />
        <Dupla rotulo={GLOSARIO.hito.plural} valor={<TextoDeHitos lectura={fila.hitos} />} />
      </dl>

      <ProximosDelEspacio lectura={fila.hitos} />
      <TrabadoDelEspacio trabados={fila.trabados} />

      <Link
        href={`/portal/proyectos/${espacio.id}`}
        className="text-acento mt-3 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
      >
        Ver el {GLOSARIO.espacio.singular.toLowerCase()}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </article>
  )
}

/**
 * Las dos barras del {espacio}: cuanto se avanzo y cuanto queda del plazo.
 *
 * Van juntas porque **la comparacion ES el dato**: «40% hecho» no dice nada hasta que al lado está
 * «queda el 15% del plazo». Separarlas obliga al cliente a hacer esa cuenta de cabeza, y es la única
 * cuenta que de verdad importa en un {espacio}.
 *
 * La del plazo solo aparece con detalle —`days` sale de `/overview`— y con fecha de entrega. Sin
 * eso no se dibuja media barra ni una barra en cero: no hay plazo que medir, y una barra vacía se
 * leería como «no queda tiempo».
 *
 * Y tampoco aparece en un {espacio} cerrado, aunque el detalle la mande: `days` se calcula contra
 * hoy, así que en un {espacio} entregado hace meses dice «Vencido» y quedaba contradiciendo al
 * «Cerrado» de dos renglones más abajo. Un plazo es el tiempo que queda de un compromiso abierto;
 * cerrado el {espacio}, no queda ninguno.
 *
 * @param fila la tarjeta ya cruzada
 */
function Medidores ({ fila }: { fila: FilaDeAvance }) {
  const dias = fila.plazo.clase === 'cerrado' ? null : fila.detalle?.days ?? null

  return (
    <div className="mt-3 flex flex-col gap-2">
      <Medidor
        rotulo="Avance"
        porcentaje={fila.espacio.progress}
        valor={formatearPorcentaje(fila.espacio.progress)}
      />
      {dias !== null && (
        <Medidor
          rotulo="Plazo"
          porcentaje={dias.left_percent}
          valor={textoDelPlazo(dias)}
          tenue
        />
      )}
    </div>
  )
}

/**
 * Una barra con su rotulo a la izquierda y su cifra a la derecha.
 *
 * El rotulo va afuera de la barra y no encima: dos barras sin rotulo, una debajo de la otra, se
 * leen como una sola cosa partida en dos, y son dos medidas distintas.
 *
 * @param rotulo que mide esta barra
 * @param porcentaje 0-100; `BarraProgreso` ya lo acota
 * @param valor el texto de la derecha, ya formateado
 * @param tenue la del plazo, que acompaña y no compite con la del avance
 */
function Medidor (
  { rotulo, porcentaje, valor, tenue = false }:
  { rotulo: string, porcentaje: number, valor: string, tenue?: boolean }
) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-texto-sutil w-14 shrink-0 text-xs font-medium tracking-[0.06em] uppercase">
        {rotulo}
      </span>
      <BarraProgreso porcentaje={porcentaje} className={cn('min-w-0 flex-1', tenue && 'opacity-60')} />
      <span
        data-numerico
        className={cn(
          'w-20 shrink-0 text-right text-sm tabular-nums',
          tenue ? 'text-texto-tenue' : 'text-texto font-semibold'
        )}
      >
        {valor}
      </span>
    </div>
  )
}

/** Un rotulo con su dato, para la grilla de datos de la tarjeta. */
function Dupla ({ rotulo, valor }: { rotulo: string, valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-texto-sutil text-xs font-medium tracking-[0.06em] uppercase">{rotulo}</dt>
      <dd className="text-texto mt-0.5 text-sm">{valor}</dd>
    </div>
  )
}

/**
 * La fecha de entrega, dicha segun lo que le pasa.
 *
 * Un {espacio} cerrado NO dice «vencido» aunque su fecha haya pasado: dice cuando se cerro. Quien
 * decide eso es `leerPlazo()`, y es la diferencia entre informar y acusar de atraso a un trabajo
 * que ya se entrego.
 *
 * @param plazo lo que decidio `leerPlazo()`
 */
function TextoDePlazo ({ plazo }: { plazo: LecturaDePlazo }) {
  if (plazo.clase === 'sin_fecha') return <span className="text-texto-tenue">{SIN_DATO}</span>

  if (plazo.clase === 'cerrado') {
    return (
      <span className="text-texto-exito">
        {plazo.fecha === null ? 'Cerrado' : `Cerrado el ${formatearVencimiento(plazo.fecha)}`}
      </span>
    )
  }

  if (plazo.clase === 'vencido') {
    return (
      <span className="text-texto-peligro font-medium">
        {formatearVencimiento(plazo.fecha)} · {plazo.dias === 1 ? 'hace 1 día' : `hace ${plazo.dias} días`}
      </span>
    )
  }

  if (plazo.clase === 'hoy') {
    return <span className="text-texto-aviso font-medium">{formatearVencimiento(plazo.fecha)} · es hoy</span>
  }

  return (
    <span>
      {formatearVencimiento(plazo.fecha)}
      <span className="text-texto-tenue">
        {' · '}{plazo.dias === 1 ? 'falta 1 día' : `faltan ${plazo.dias} días`}
      </span>
    </span>
  )
}

/**
 * Las tres cuentas de {procesos} del {espacio}.
 *
 * «0 de 0» no se escribe nunca: un {espacio} sin {procesos} compartidas no esta terminado, es uno
 * que no comparte esa lista. Quien lo decide es `leerTareas()`.
 *
 * @param lectura lo que decidio `leerTareas()`
 */
function TextoDeTareas ({ lectura }: { lectura: LecturaDeTareas }) {
  if (lectura.clase === 'sin_tareas') {
    return <span className="text-texto-tenue">Sin {GLOSARIO.proceso.plural.toLowerCase()} compartidas</span>
  }

  return (
    <span>
      <span data-numerico className="tabular-nums font-medium">{lectura.completas}</span>
      {' de '}
      <span data-numerico className="tabular-nums">{lectura.total}</span>
      {' listas'}
      <span className="text-texto-tenue">{' · '}{lectura.abiertas} abiertas</span>
    </span>
  )
}

/**
 * Cuantos {hitos} tiene el {espacio} y cuantos pasaron de fecha.
 *
 * El numero de vencidos sale del detalle del propio {espacio} cuando lo hay, no de contar la lista
 * transversal: esa viene recortada y contar ahi puede dar menos de los que son. Quien lo decide es
 * `leerHitosDelEspacio()`.
 *
 * @param lectura lo que decidio `leerHitosDelEspacio()`
 */
function TextoDeHitos ({ lectura }: { lectura: LecturaDeHitosDelEspacio }) {
  if (lectura.clase === 'sin_hitos') return <span className="text-texto-tenue">{TEXTO_SIN_HITOS}</span>

  if (lectura.clase === 'fuera_de_lista') {
    return (
      <span>
        <span data-numerico className="tabular-nums font-medium">{lectura.total}</span>
        <span className="text-texto-tenue">{' · '}{TEXTO_HITO_FUERA_DE_LISTA}</span>
      </span>
    )
  }

  return (
    <span>
      <span data-numerico className="tabular-nums font-medium">{lectura.total}</span>
      {lectura.vencidos > 0
        ? (
            <span className="text-texto-peligro">
              {' · '}{lectura.vencidos} {lectura.vencidos === 1 ? 'vencido' : 'vencidos'}
            </span>
          )
        : <span className="text-texto-tenue">{' · '}ninguno vencido</span>}
    </span>
  )
}

/**
 * Los {hitos} que vienen en este {espacio}, con nombre y fecha.
 *
 * Son TODOS los que entraron en la lista del servidor para este {espacio}, no solo el primero: el
 * cliente que mira su {espacio} quiere ver las entregas que se le vienen, y la siguiente sola no es
 * un plan. Cuando la lista trae menos de los que el {espacio} tiene, la grilla de arriba ya dijo
 * cuantos son en total.
 *
 * @param lectura lo que decidio `leerHitosDelEspacio()`
 */
function ProximosDelEspacio ({ lectura }: { lectura: LecturaDeHitosDelEspacio }) {
  if (lectura.clase !== 'proximos') return null

  return (
    <ul className="border-linea-suave mt-3 flex flex-col gap-1.5 border-t pt-3">
      {lectura.filas.map((hito) => (
        <li key={hito.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
          <span className="text-texto min-w-0">
            {hito.name}
            {hito.vencido && (
              <span className="text-texto-peligro ml-2 text-xs font-semibold uppercase">Vencido</span>
            )}
          </span>
          <span
            data-numerico
            className={cn(
              'tabular-nums',
              hito.vencido ? 'text-texto-peligro font-medium' : 'text-texto-tenue'
            )}
          >
            {formatearVencimiento(hito.due_date)}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Lo que esta detenido en este {espacio}, con su motivo y lo que hace falta para destrabarlo.
 *
 * Se dibuja solo cuando hay algo: la tarjeta de un {espacio} sano no lleva un cartel que diga «nada
 * trabado», porque son varias tarjetas y ese cartel repetido es ruido. Que no se pueda saber
 * tampoco se escribe acá —seria la misma salvedad en cada tarjeta—: la escribe una sola vez el
 * bloque «Qué está trabado» del final.
 *
 * @param trabados lo trabado de este {espacio}; `null` es «no se puede saber»
 */
function TrabadoDelEspacio ({ trabados }: { trabados: BloqueoLeido[] | null }) {
  if (trabados === null || trabados.length === 0) return null

  return (
    <ul className="mt-3 flex flex-col gap-2">
      {trabados.map((bloqueo) => (
        <FilaTrabada key={bloqueo.id} bloqueo={bloqueo} conEspacio={false} />
      ))}
    </ul>
  )
}
