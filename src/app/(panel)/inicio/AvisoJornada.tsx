'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { avisarCambioDeMedidor, escucharMedidor } from '@/componentes/live/medidor'
import type { EstadoDeJornada, MedidorEnVivo } from '@/datos/live'
import { GLOSARIO } from '@/dominio/glosario'
import { mensajeDeFalloDeJornada } from '@/dominio/live'

/**
 * Lo que le falta a la jornada de hoy para que el tiempo quede imputado.
 *
 * `null` es "no falta nada", y es el caso en el que el aviso NO se pinta. Una tarjeta que felicita
 * por lo normal ocupa el lugar de la que avisa de verdad y entrena a saltearse las dos.
 */
type Falta = 'jornada' | 'medidor' | 'tarea'

/**
 * Las claves del medidor **plano**, el que devuelve hoy `GET /me/jornada`.
 *
 * `MedidorEnVivo` describe la forma de `GET /live` —`project` y `task` anidados— y las dos rutas no
 * coinciden: la jornada propia manda `project_id`, `project_name`, `task_id` y `task_name` sueltos,
 * con `task_id: 0` (no `null`) cuando se mide sobre el Proyecto entero. Verificado contra la API.
 *
 * Se declara acá y no en `datos/live.ts` porque ese tipo es de la pantalla de otro: el día que la
 * API unifique las dos formas, esto se borra entero y no queda nada suelto en el resto del panel.
 */
interface MedidorPlano {
  task_id?: number | null
  project_id?: number | null
  project_name?: string | null
}

/** El destino del medidor, leído de cualquiera de las dos formas que devuelve la API. */
interface DestinoDelMedidor {
  /** `true` si el tiempo se está imputando a una Tarea y no solo al Proyecto. */
  tarea: boolean
  proyectoId: number | null
  proyectoNombre: string | null
}

/**
 * Resuelve sobre qué está corriendo el medidor, tolerando las dos formas de la API.
 *
 * @param medidor el medidor tal como vino, anidado o plano
 * @returns si hay Tarea, y el Proyecto al que pertenece el medidor
 */
function destinoDelMedidor (medidor: MedidorEnVivo): DestinoDelMedidor {
  const plano = medidor as unknown as MedidorPlano

  return {
    tarea: medidor.task != null || (plano.task_id ?? 0) > 0,
    proyectoId: medidor.project?.id ?? plano.project_id ?? null,
    proyectoNombre: medidor.project?.name ?? plano.project_name ?? null
  }
}

/**
 * Qué hay que recordarle a la persona, en orden de urgencia.
 *
 * @param estado el estado de la jornada, o `null` si no se pudo leer
 * @returns lo que falta, o `null` si no falta nada o no hay con qué saberlo
 */
function queFalta (estado: EstadoDeJornada | null): Falta | null {
  // Sin dato no hay aviso: un recordatorio que no se puede sostener es peor que ninguno, y quien
  // ya abrió su jornada no tiene por qué ver "no la iniciaste" porque la API tardó.
  if (estado === null) return null

  if (estado.open === null) return 'jornada'
  if (estado.timer === null) return 'medidor'

  return destinoDelMedidor(estado.timer).tarea ? null : 'tarea'
}

const TITULOS: Record<Falta, string> = {
  jornada: 'Aún no has iniciado tu jornada',
  medidor: 'Tu jornada está abierta, pero no estás midiendo nada',
  tarea: `Elige la ${GLOSARIO.proceso.singular} en la que estás trabajando`
}

/**
 * El texto que explica por qué importa.
 *
 * @param falta qué se está recordando
 * @param proyecto nombre del Proyecto que se está midiendo, si lo hay
 * @returns la frase lista para mostrar
 */
function detalle (falta: Falta, proyecto: string | null): string {
  if (falta === 'jornada') {
    return 'La jornada es la ventana en la que se puede medir: sin ella abierta ningún cronómetro arranca y lo que trabajes hoy no queda registrado.'
  }

  if (falta === 'medidor') {
    return `Elige el ${GLOSARIO.espacio.singular} y la ${GLOSARIO.proceso.singular} en los que vas a trabajar ahora, o las horas de la jornada quedan sin cubrir.`
  }

  const sobre = proyecto === null ? `un ${GLOSARIO.espacio.singular}` : `«${proyecto}»`

  return `Estás midiendo sobre ${sobre}, pero sin ${GLOSARIO.proceso.singular} el tiempo no se imputa a ningún trabajo concreto.`
}

/**
 * Recordatorio de jornada en la portada.
 *
 * === POR QUÉ ACÁ SI EL CONTROL YA ESTÁ EN LA CABECERA ===
 *
 * Porque el control de la cabecera es un botón de 8 px de alto que hay que abrir para enterarse de
 * algo: sirve para operar, no para recordar. Este aviso no opera —salvo el caso de "todavía no
 * empezaste", que es un clic— y no duplica el selector de Espacio: lleva a donde ya se elige. Un
 * tercer selector sería la tercera forma de arrancar el mismo medidor.
 *
 * === POR QUÉ SOLO APARECE CUANDO FALTA ALGO ===
 *
 * Los cuatro estados posibles no valen lo mismo. Tres son un problema que la persona puede arreglar
 * en un clic; el cuarto —jornada abierta, Proyecto y Tarea elegidos— es simplemente el trabajo
 * andando, y no merece un cartel. Ver `queFalta()`.
 *
 * === POR QUÉ EL ESTADO BAJA DEL SERVIDOR ===
 *
 * Igual que en `/live`: si el aviso naciera vacío y preguntara al montar, aparecería de golpe unos
 * cientos de milisegundos después de la portada, en cada navegación al Inicio. El primer pintado ya
 * sabe la verdad; lo que sigue lo corrige el pub/sub del medidor.
 *
 * @param inicial el estado ya resuelto en el servidor, o `null` si la API no lo pudo dar
 */
export function AvisoJornada ({ inicial }: { inicial: EstadoDeJornada | null }) {
  const [estado, setEstado] = useState<EstadoDeJornada | null>(inicial)
  const [enCurso, setEnCurso] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  /**
   * Vuelve a preguntarle a la API cómo quedó la jornada. Nunca lanza.
   *
   * Un fallo deja el último estado conocido en pantalla: el control de la cabecera pide el MISMO
   * endpoint y ya muestra los errores de red, y dos quejas del mismo hecho en la misma pantalla no
   * agregan información.
   */
  const refrescar = useCallback(async (senal: AbortSignal): Promise<void> => {
    try {
      const respuesta = await fetch('/api/bff/me/jornada', { signal: senal })

      if (!respuesta.ok) return

      const sobre = await respuesta.json() as { data: EstadoDeJornada }

      if (!senal.aborted) setEstado(sobre.data)
    } catch {
      // Red caída o petición abortada al desmontar: se conserva lo último que se supo.
    }
  }, [])

  useEffect(() => {
    const control = new AbortController()

    // La jornada y el medidor se tocan desde la cabecera, desde `/live` y desde la ficha de cada
    // proceso. Sin esta suscripción, quien arranca su jornada en la cabecera seguiría viendo acá
    // que no la inició hasta la próxima navegación.
    const dejarDeEscuchar = escucharMedidor(() => { void refrescar(control.signal) })

    return () => {
      dejarDeEscuchar()
      control.abort()
    }
  }, [refrescar])

  /**
   * Abre la jornada y avisa al resto del panel.
   *
   * El `409` no es un error que mostrar: significa que ya había una jornada abierta —otra pestaña se
   * adelantó— y lo único que hace falta es volver a leer el estado, que es justo lo que dispara
   * `avisarCambioDeMedidor()` a través de la suscripción de arriba.
   */
  async function iniciar (): Promise<void> {
    setEnCurso(true)
    setAviso(null)

    let estadoHttp: number

    try {
      const respuesta = await fetch('/api/bff/me/jornada', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      })

      estadoHttp = respuesta.status
    } catch {
      // Sin respuesta no hay código: `0` es lo que `mensajeDeFalloDeJornada` traduce a "revisa la
      // conexión" en vez de a un número inventado.
      estadoHttp = 0
    }

    setEnCurso(false)

    if ((estadoHttp >= 200 && estadoHttp < 300) || estadoHttp === 409) {
      avisarCambioDeMedidor()
      return
    }

    setAviso(mensajeDeFalloDeJornada(estadoHttp, true))
  }

  const falta = queFalta(estado)

  if (falta === null) return null

  const medidor = estado?.timer ?? null
  const destino = medidor === null ? null : destinoDelMedidor(medidor)

  return (
    <section
      role="status"
      className="border-linea-fuerte bg-superficie-aviso rounded-tarjeta flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-l-4 p-4"
    >
      <div className="min-w-56 flex-1">
        <h2 className="text-texto-aviso text-sm font-semibold">{TITULOS[falta]}</h2>
        <p className="text-texto-tenue mt-1 text-pretty text-sm">
          {detalle(falta, destino?.proyectoNombre ?? null)}
        </p>
        {aviso !== null && <p role="alert" className="text-texto-peligro mt-2 text-pretty text-xs">{aviso}</p>}
      </div>

      {falta === 'jornada'
        ? (
          <Boton variante="primario" cargando={enCurso} onClick={() => { void iniciar() }}>
            Iniciar jornada
          </Boton>
          )
        : (
          <Link
            href={enlaceDe(falta, destino)}
            className="text-acento flex items-center gap-1 text-sm font-semibold hover:underline"
          >
            {falta === 'medidor'
              ? `Elegir ${GLOSARIO.espacio.singular}`
              : `Elegir ${GLOSARIO.proceso.singular}`}
            <ArrowRight size={16} strokeWidth={2.5} aria-hidden="true" />
          </Link>
          )}
    </section>
  )
}

/**
 * A dónde mandar a elegir.
 *
 * El Proyecto se elige en el control de jornada, que vive en `/live`. La Tarea no: se arranca desde
 * su ficha, así que el destino es el Proyecto que ya se está midiendo, donde están sus Tareas. Sin
 * Proyecto conocido queda el listado completo, que es el único lugar seguro.
 *
 * @param falta qué se está recordando; `jornada` no llega acá, se resuelve con un botón
 * @param destino sobre qué corre el medidor, si corre
 * @returns la ruta del panel
 */
function enlaceDe (falta: Falta, destino: DestinoDelMedidor | null): string {
  if (falta === 'medidor') return '/live'

  return destino?.proyectoId == null ? '/procesos' : `/espacios/${destino.proyectoId}`
}
