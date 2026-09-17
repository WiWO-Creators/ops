'use client'

import { Suspense, useCallback, useMemo, useState, type ReactElement } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { LimiteDeError } from '@/componentes/estado/LimiteDeError'
import { BloqueCopiable } from '@/componentes/presentadores/BloqueCopiable'
import { ACTAS } from '@/definiciones/actas'
import { conId, type FuenteDeProyecto } from '@/dominio/fuente-proyecto'
import { useRecurso } from './carga'
import { AsistenteDeActa } from './AsistenteDeActa'
import { DetalleActa } from './DetalleActa'
import { PanelRecurso } from './PanelRecurso'
import { EnlaceActa, TarjetaActa } from './TarjetaActa'
import type { Acta } from '@/datos/recursos'
import type { EstadoIa } from '@/dominio/ajustes'
import type { Capacidad, Yo } from '@/datos/tipos'
import type { DefinicionRecurso } from '@/definiciones/tipos'

/**
 * Pestaña Meeting Paper del Proyecto.
 *
 * Es la funcionalidad de MeetingMatico traída al Proyecto del que habla el acta: se le da el audio de
 * la reunión, una foto de la pizarra o los apuntes, y un modelo escribe el documento.
 *
 * A diferencia de las Notas —que siguen existiendo aparte y son privadas de quien las escribió—, un
 * Meeting Paper lo ven **todos los miembros del Proyecto**, que es para lo que sirve un acta: la lee
 * el que no fue a la reunión.
 *
 * Qué se está mirando vive en la URL, igual que en Discusiones: `?acta={id}` abre una, `?acta=nuevo`
 * abre el asistente. Así se comparte por enlace, "atrás" hace lo que la persona espera, y el título
 * de la lista puede ser un enlace de verdad en vez de un `onClick`.
 *
 * === LA MISMA PESTAÑA LA ABRE EL CLIENTE ===
 *
 * Con `fuente={fuenteDelPortal(id)}` y `capacidades={[]}` este panel es el Meeting Paper del portal,
 * en solo lectura: sin alta, sin asistente, sin corregir, sin borrar y sin cambiar la marca. No hay
 * ninguna rama por sujeto acá adentro —lo que cambia son las rutas y las capacidades—, y la lista y
 * el documento son los mismos que ve el equipo. Ver `dominio/fuente-proyecto.ts`.
 *
 * `ia`, `yo` y `capacidadesTareas` son **opcionales por eso**: los tres solo gobiernan escrituras
 * —`ia` decide si el alta genera o explica por qué no puede, `yo` decide si se ofrece borrar, y
 * `capacidadesTareas` decide si las tareas propuestas del acta se pueden crear—, así que sin
 * capacidades no se leen. El portal no puede pasarlos aunque quisiera: `GET /settings` y `GET /me` son rutas del
 * equipo, y un contacto no las tiene. Inventar un valor para cumplir con la firma habría sido
 * escribir dos veces la misma decisión.
 *
 * **La pestaña se muestra aunque la capa de IA esté apagada.** Diverge del criterio de la pestaña del
 * asistente, y a propósito: el CRUD de actas no cuelga de `/ia/*`, así que sigue respondiendo con el
 * interruptor en cero. Esconder la pestaña dejaría inalcanzables las actas ya escritas por mover un
 * ajuste de instalación, que es peor que una pestaña donde no se puede crear.
 */

interface PropsPanelActas {
  proyectoId: number
  /** De donde bajan los Meeting Papers de este Proyecto. Ver `dominio/fuente-proyecto.ts`. */
  fuente: FuenteDeProyecto
  /**
   * Qué se puede escribir en esta pestaña: `create` el alta, `edit` corregir y cambiar la marca,
   * `delete` eliminar. Con `[]` el panel queda en solo lectura, que es como lo monta el portal.
   */
  capacidades: Capacidad[]
  /**
   * Estado de la capa de IA. Sin ella se puede leer y corregir, pero no generar ni reescribir.
   *
   * Llega con el motivo y no como booleano porque la pantalla lo dice en voz alta: ver `MOTIVO_IA`.
   * Solo se lee con capacidad de escritura; ausente vale "no hay IA".
   */
  ia?: EstadoIa
  /** Para saber si esta persona puede borrar un acta ajena. Solo se lee con capacidad `delete`. */
  yo?: Yo
  /**
   * Capacidades sobre **Tareas**, no sobre el acta: las gobierna `yo.permissions.tasks`.
   *
   * Sirven solo a las tareas propuestas del acta abierta, que es lo unico de esta pestaña que crea
   * Procesos. Ausentes —el portal— la seccion queda en solo lectura. Van aparte de `capacidades`
   * porque son otro permiso: quien corrige actas no necesariamente reparte trabajo en el Espacio.
   */
  capacidadesTareas?: Capacidad[]
}

/**
 * Que se le dice a la persona por cada motivo por el que no hay IA.
 *
 * Los tres se veian igual —un boton gris y "esta desactivada"— y se arreglan en lugares distintos:
 * uno es un interruptor del panel, otro una instalacion a la que nunca se le escribio el ajuste, y
 * el tercero la API que no contesta. Decir cual es no es un lujo de depuracion: es la diferencia
 * entre que la persona sepa a quien pedirselo y que abra un ticket que dice "no funciona".
 *
 * `chip` es la version corta que vive en la barra. La frase entera al lado del boton competia con el
 * boton y empujaba la barra a dos lineas en pantallas angostas; el motivo completo sigue estando, a
 * un clic, donde ademas viene con el detalle copiable.
 */
const MOTIVO_IA: Record<EstadoIa['motivo'], { chip: string, titulo: string, ayuda: string }> = {
  encendida: { chip: '', titulo: '', ayuda: '' },
  apagada: {
    chip: 'IA apagada',
    titulo: 'La escritura con IA está apagada en esta instalación.',
    ayuda: 'Se enciende en Administración → Ajustes → Funciones con IA. Los Meeting Papers ya escritos se siguen leyendo y corrigiendo igual.'
  },
  ausente: {
    chip: 'IA sin configurar',
    titulo: 'Esta instalación nunca configuró las funciones con IA.',
    ayuda: 'El ajuste "Funciones con IA" no tiene valor guardado. Hay que entrar a Administración → Ajustes, encenderlo y guardar una vez.'
  },
  no_se_pudo_leer: {
    chip: 'Estado de la IA desconocido',
    titulo: 'No se pudo leer si la IA está disponible.',
    ayuda: 'Falló la lectura de los ajustes contra la API. No es el Meeting Paper: mientras esto falle, media aplicación va a comportarse raro.'
  }
}

/** Lo que dice el estado de la IA cuando nadie lo pasó: sin capacidad de escritura no se consulta. */
const SIN_IA: EstadoIa = { activa: false, motivo: 'apagada' }

export function PanelActas (props: PropsPanelActas): ReactElement {
  // Lee `useSearchParams`: sin este límite de Suspense falla el build de la página que lo monta.
  return (
    <Suspense fallback={<Cargando mensaje="Cargando los Meeting Papers…" />}>
      <ActasDelProyecto {...props} />
    </Suspense>
  )
}

function ActasDelProyecto ({
  proyectoId, fuente, capacidades, ia = SIN_IA, yo, capacidadesTareas = []
}: PropsPanelActas): ReactElement {
  const router = useRouter()
  const params = useSearchParams()
  const [revision, setRevision] = useState(0)
  const [motivoALaVista, setMotivoALaVista] = useState(false)

  const recargar = useCallback(() => { setRevision((n) => n + 1) }, [])
  const pedida = params.get('acta')
  const puedeCrear = capacidades.includes('create')
  const puedeEditar = capacidades.includes('edit')

  /** Escribe `?acta` conservando el resto de la vista; `null` la saca. */
  const ir = useCallback((valor: string | null) => {
    const siguientes = new URLSearchParams(params.toString())
    if (valor === null) siguientes.delete('acta')
    else siguientes.set('acta', valor)

    router.replace(`?${siguientes.toString()}`, { scroll: false })
  }, [params, router])

  const definicion = useMemo<DefinicionRecurso<Acta>>(
    () => ({
      ...ACTAS,
      // Se acota por ruta y no por filtro, igual que el resto de las pestañas: así el id del
      // Proyecto no queda editable en la URL de quien mira. La ruta la pone la fuente, que es lo
      // único que separa la lista del equipo de la del cliente: las dos columnas, el orden y la
      // búsqueda son las mismas porque `listarParaContacto()` usa la misma consulta.
      ruta: fuente.actas,
      columnas: ACTAS.columnas.map((columna) => (
        columna.clave === 'title'
          ? { ...columna, presentar: (a: Acta) => <EnlaceActa acta={a} /> }
          : columna
      ))
    }),
    [fuente.actas]
  )

  // La URL la escribe cualquiera: sin esta guarda, un cliente que escribiera `?acta=nuevo` abriría
  // el asistente de un alta que su API contesta con 404.
  if (puedeCrear && pedida === 'nuevo') {
    return (
      <LimiteDeError zona="Meeting Paper — asistente de creación">
        <AsistenteDeActa
          proyectoId={proyectoId}
          onCreada={(acta) => {
            recargar()
            ir(String(acta.id))
          }}
          onCancelar={() => { ir(null) }}
        />
      </LimiteDeError>
    )
  }

  const abierta = idPositivo(pedida)
  if (abierta !== null) {
    return (
      <LimiteDeError zona="Meeting Paper — acta abierta">
        <ActaAbierta
          actaId={abierta}
          proyectoId={proyectoId}
          fuente={fuente}
          puedeEditar={puedeEditar}
          // Borrar exige la capacidad Y ser el autor o quien administra, que es la misma regla que
          // aplica la API. Sin `yo` no hay a quién comparar: no se ofrece.
          puedeBorrar={capacidades.includes('delete') && yo !== undefined ? { yo } : null}
          conIa={ia.activa}
          puedeCrearTareas={capacidadesTareas.includes('create')}
          onCambiada={recargar}
          onBorrada={() => {
            recargar()
            ir(null)
          }}
          onVolver={() => { ir(null) }}
        />
      </LimiteDeError>
    )
  }

  const motivo = MOTIVO_IA[ia.motivo]

  // El boton no se deshabilita aunque no haya IA. Un boton gris no dice por que lo esta, y quien lo
  // aprieta se queda sin saber si falta un ajuste, si la API se cayo o si el sistema se rompio: el
  // clic abre el motivo, que es lo unico que esa persona puede reportar o arreglar.
  const barra = !puedeCrear
    ? undefined
    : (
      <div className="flex items-center justify-end gap-3">
        {!ia.activa && <Insignia tono="aviso" tamano="chico">{motivo.chip}</Insignia>}
        <Boton
          variante="primario"
          tamano="chico"
          onClick={() => {
            if (ia.activa) ir('nuevo')
            else setMotivoALaVista(true)
          }}
        >
          {/* El icono va `aria-hidden`: el nombre del boton ya lo dice la etiqueta de al lado, y un
              `+` anunciado por el lector de pantalla solo agrega ruido. El tamaño y el grosor son los
              del resto del panel (`BarraLateral`), a escala de boton chico. */}
          <Plus size={16} strokeWidth={2} aria-hidden="true" className="shrink-0" />
          Nuevo Meeting Paper
        </Boton>
      </div>
      )

  return (
    <div className="flex flex-col gap-4">
      {motivoALaVista && !ia.activa && (
        <div className="flex flex-col gap-3">
          <ErrorEstado
            titulo={motivo.titulo}
            detalle={motivo.ayuda}
            onReintentar={() => { setMotivoALaVista(false) }}
          />
          <BloqueCopiable titulo="Detalle para reportarlo" texto={detalleDelMotivo(proyectoId, ia)} />
        </div>
      )}

      <PanelRecurso
        definicion={definicion}
        claveFila={(acta) => acta.id}
        barra={barra}
        revision={revision}
        // El catálogo del equipo con una sesión de contacto devuelve 401: la ruta entra por la
        // fuente, igual que la del listado.
        rutaLookups={fuente.lookups}
        tarjeta={(acta) => <TarjetaActa acta={acta} className="w-full" />}
      />
    </div>
  )
}

/**
 * El texto que la persona copia cuando el Meeting Paper no la deja crear nada.
 *
 * Lleva el Espacio y la URL porque el mismo motivo en dos Espacios puede ser un permiso y no un
 * ajuste, y `detalle` porque cuando la API es la que falla, su codigo y su estado HTTP son lo unico
 * que separa "se cayo" de "la sesion vencio".
 *
 * @param proyectoId el Espacio desde el que se reporta
 * @param ia el estado de la capa de IA tal como lo leyo el servidor
 * @returns el detalle en texto plano, listo para pegar
 */
function detalleDelMotivo (proyectoId: number, ia: EstadoIa): string {
  return [
    'Zona: Meeting Paper — botón "Nuevo Meeting Paper"',
    `Espacio: ${proyectoId}`,
    `URL: ${typeof window === 'undefined' ? '(servidor)' : window.location.href}`,
    `IA activa: ${String(ia.activa)}`,
    `Motivo: ${ia.motivo}`,
    ia.detalle === undefined ? '' : `Detalle: ${ia.detalle}`
  ].filter((linea) => linea !== '').join('\n')
}

/**
 * Trae el acta completa y la muestra.
 *
 * El listado no incluye `content` —la API lo omite a propósito, son ~20.000 caracteres por fila—, así
 * que abrir una es siempre un pedido más.
 */
function ActaAbierta ({
  actaId,
  proyectoId,
  fuente,
  puedeEditar,
  puedeBorrar,
  conIa,
  puedeCrearTareas,
  onCambiada,
  onBorrada,
  onVolver
}: {
  actaId: number
  proyectoId: number
  fuente: FuenteDeProyecto
  puedeEditar: boolean
  /** Quien mira, solo si tiene la capacidad de borrar. `null` = no se ofrece eliminar. */
  puedeBorrar: { yo: Yo } | null
  conIa: boolean
  puedeCrearTareas: boolean
  onCambiada: () => void
  onBorrada: () => void
  onVolver: () => void
}): ReactElement {
  const { estado, recargar } = useRecurso<Acta>(
    conId(fuente.acta, actaId),
    'No se pudo cargar el Meeting Paper.'
  )

  if (estado.fase === 'cargando') return <Cargando alto="min-h-48" mensaje="Cargando el Meeting Paper…" />
  if (estado.fase === 'error') return <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />

  const acta = estado.datos

  return (
    <DetalleActa
      acta={acta}
      proyectoId={proyectoId}
      fuente={fuente}
      puedeEditar={puedeEditar}
      // La misma regla que aplica la API: el autor o quien administra. Comprobarlo acá solo evita
      // ofrecer un botón que va a devolver 403; la decisión real la toma el backend.
      puedeBorrar={puedeBorrar !== null && (acta.staff_id === puedeBorrar.yo.id || puedeBorrar.yo.is_admin)}
      conIa={conIa}
      puedeCrearTareas={puedeCrearTareas}
      onCambiada={() => {
        recargar()
        onCambiada()
      }}
      onBorrada={onBorrada}
      onVolver={onVolver}
    />
  )
}

/**
 * Lee un id de la URL.
 *
 * La URL la escribe cualquiera: `?acta=abc` o `?acta=-3` no pueden terminar en un pedido al BFF.
 */
function idPositivo (crudo: string | null): number | null {
  if (crudo === null || crudo.trim() === '') return null

  const id = Number(crudo)

  return Number.isInteger(id) && id > 0 ? id : null
}
