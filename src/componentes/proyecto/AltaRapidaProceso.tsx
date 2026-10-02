'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { useAccionPresencia } from '@/componentes/auditoria/accion'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { CamposPersonalizados } from '@/componentes/formularios/CamposPersonalizados'
import { valoresPorDefecto } from '@/dominio/campos-personalizados'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo,
  DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import { interpretarAltaRapida, type CatalogosAlta } from '@/dominio/alta-rapida'
import { agregarEtiqueta } from '@/dominio/etiquetas'
import { fusionarInterpretacion, type CatalogosTarea, type TareaFusionada } from '@/dominio/ia-tarea'
import { claseDeEspacio, espaciosDeClase, type RelacionTarea } from '@/dominio/espacios-destino'
import { GLOSARIO } from '@/dominio/glosario'
import { relacionQuePuedeExigir, type RelacionConCliente } from '@/dominio/vencimiento-requerido'
import { useVencimientoRequerido } from './useVencimientoRequerido'
import type { Referencia } from '@/datos/recursos'
import { useAviso } from '@/componentes/estado/useAviso'
import {
  borradorInicial, camposManuales, cuerpoComunDelAlta, cuerpoDeUnDestino, destinoDelAlta,
  falloDelAltaPorCampos, marcasDeLinea, MODOS, NINGUNO, nombreDeEspacio, type Modo
} from './alta/modelo'
import { useBorradorAlta } from './alta/useBorradorAlta'
import { useCatalogosAlta, type CargaDelAlta } from './alta/useCatalogosAlta'
import { useEnvioAlta } from './alta/useEnvioAlta'
import { useSugerenciasIa } from './alta/useSugerenciasIa'
import { useTiposYHitos } from './alta/useTiposYHitos'
import { CampoDescripcion } from './alta/CampoDescripcion'
import { CamposDeDestino } from './alta/CamposDeDestino'
import { CamposDeFacturacion } from './alta/CamposDeFacturacion'
import { CamposDePlanificacion } from './alta/CamposDePlanificacion'
import { EntradaEnLinea } from './alta/EntradaEnLinea'
import { PanelIa } from './alta/PanelIa'
import { ParteAltaMultiple } from './alta/ParteAltaMultiple'

/** Formulario único de creación, con entrada por campos o interpretación de una línea. */
interface PropsAltaRapida {
  /** Personas, Espacios y prioridades contra los que resolver `@`, `#` y `!`. */
  catalogos?: CatalogosAlta
  /**
   * Etiquetas que ya existen (`lookups.tags`).
   *
   * Se sugieren mientras se escribe (`SelectorEtiquetas`), no son un limite: una etiqueta escrita
   * que no esta en el catalogo se crea en el alta. Solo las usa el modo por campos.
   */
  etiquetas?: Referencia[]
  /**
   * Si la capa de IA esta encendida (`ia_habilitada`).
   *
   * Apagada, el campo de texto libre y su boton no se pintan: la API responde 404 a `/ia/*` y
   * ofrecer un boton que falla es peor que no ofrecerlo.
   */
  conIa: boolean
  proyectoId?: number
  hitoInicial?: number
  integrado?: boolean
  abrirInicialmente?: boolean
  onCreada?: () => void
  onCerrar?: () => void
  onOcupado?: (ocupado: boolean) => void
}

export function AltaRapidaProceso ({
  catalogos: catalogosRecibidos, etiquetas: etiquetasRecibidas, conIa,
  proyectoId, hitoInicial, integrado = false, abrirInicialmente = false, onCreada, onCerrar, onOcupado
}: PropsAltaRapida): ReactElement {
  const router = useRouter()
  const aviso = useAviso()
  const [abierto, setAbierto] = useState(integrado || abrirInicialmente)
  useAccionPresencia('creando_tarea', abierto)

  const { borrador, cambiar, cambiarVarios, actualizar, restablecer } = useBorradorAlta(() => borradorInicial({
    proyectoId,
    hitoInicial,
    relacion: 'project',
    asignados: [],
    personalizados: {},
    // Nace marcada: el portal solo muestra lo visible, y una tarea que arranca oculta le deja al
    // cliente la impresion de que nadie esta trabajando. Lo interno se desmarca a mano.
    visibleCliente: true
  }))
  const { relacion, relacionId, espacios } = borrador
  const destino = destinoDelAlta(borrador)
  const { espacio, multiple, vaAEspacio } = destino

  /**
   * Da al borrador los valores que dependen de los catálogos recién cargados.
   *
   * Abierta desde una Licitacion o un Upsell, la relacion arranca en su clase: si no, el Espacio
   * fijado no estaria en el catalogo que se muestra. Los asignados solo se ponen si nadie eligio
   * todavia: un reintento de carga no pisa lo que la persona ya decidio.
   *
   * @param carga los campos personalizados, los destinos y los asignados iniciales
   */
  function alCargar ({ definiciones, destinos, asignados }: CargaDelAlta): void {
    actualizar((actual) => ({
      ...actual,
      personalizados: valoresPorDefecto(definiciones),
      ...(proyectoId === undefined ? {} : { relacion: claseDeEspacio(proyectoId, destinos) }),
      asignados: actual.asignados.length === 0 ? asignados : actual.asignados
    }))
  }

  const carga = useCatalogosAlta({ abierto, proyectoId, catalogosRecibidos, etiquetasRecibidas, alCargar })
  const { catalogos, licitaciones, upsells, definiciones, cargando, errorCarga } = carga
  const tiposYHitos = useTiposYHitos(abierto, destino)

  const envio = useEnvioAlta({
    definiciones,
    personalizados: borrador.personalizados,
    adjuntos: borrador.adjuntos,
    vaciarAdjuntos: () => { cambiar('adjuntos', []) },
    cargando,
    errorCarga,
    nombreDeEspacio: (id) => nombreDeEspacio(id, catalogos.espacios),
    alFallarPersonalizados: () => { cambiar('modo', 'campos') },
    alCrear: cerrarTrasCrear,
    alQuedarPendientes: (pendientes) => { cambiar('espacios', pendientes) },
    onOcupado
  })
  const { creadaId, enCurso, parcial } = envio

  /**
   * Las relaciones con las que nacerian las tareas: un Proyecto por destino, o el Cliente elegido.
   * De ahi sale si la fecha de vencimiento es obligatoria; con varios destinos basta con que uno la
   * exija, porque la fecha es la misma para todos.
   */
  const relacionesDelAlta = useMemo<RelacionConCliente[]>(
    () => (vaAEspacio ? espacios.map((id) => relacionQuePuedeExigir('project', id)) : [relacionQuePuedeExigir(relacion, relacionId)])
      .filter((relacionDelAlta): relacionDelAlta is RelacionConCliente => relacionDelAlta !== null),
    [vaAEspacio, espacios, relacion, relacionId]
  )
  const vencimientoRequerido = useVencimientoRequerido(relacionesDelAlta, abierto && creadaId === null)

  const cajaDescripcion = useRef<HTMLDivElement | null>(null)

  /** Los catalogos con los que se valida todo lo que devuelve el modelo. */
  const catalogosConEtiquetas: CatalogosTarea = { ...catalogos, etiquetas: carga.etiquetas }

  const ia = useSugerenciasIa({
    catalogos,
    catalogosConEtiquetas,
    espacio,
    capturar: () => camposManuales(borrador),
    volcar,
    restaurar: cambiarVarios,
    onOcupado
  })

  /** Deja el hito y el tipo sin elegir, con su catálogo vacío. */
  function olvidarHitoYTipo (): void {
    cambiarVarios({ hito: NINGUNO, tipo: NINGUNO })
    tiposYHitos.olvidar()
  }

  /**
   * Elige UN Espacio y descarta el tipo que hubiera. La usan la línea y la interpretación de IA,
   * que resuelven un solo destino.
   *
   * El descarte va aca y no en el efecto: un tipo del Espacio anterior es justo lo que la API
   * rechaza con `422 no_pertenece_al_espacio`, y dejarlo puesto convertiria un cambio de Espacio en
   * un error al crear.
   */
  function elegirEspacio (valor: string): void {
    cambiar('relacion', valor === NINGUNO ? (vaAEspacio ? relacion : 'project') : claseDeEspacio(Number(valor), { licitaciones, upsells }))
    if (valor === espacio && espacios.length <= 1) return
    cambiar('espacios', valor === NINGUNO ? [] : [Number(valor)])
    olvidarHitoYTipo()
  }

  /**
   * Elige la lista completa de Espacios destino.
   *
   * El hito y el tipo se descartan cuando cambia el primer Espacio —de él salen sus catálogos— y
   * también al pasar a varios destinos, porque ahí dejan de existir: son por Espacio y la API los
   * rechaza en el alta múltiple.
   */
  function elegirEspacios (ids: number[]): void {
    cambiar('espacios', ids)
    envio.olvidarParcial()
    if (ids[0] !== espacios[0] || ids.length > 1) olvidarHitoYTipo()
  }

  /**
   * Cambia con que se relaciona la Tarea.
   *
   * Los Espacios elegidos se descartan al cambiar de clase: el selector solo muestra los de la clase
   * nueva, y dejar puestos los de la anterior crearia la tarea en un destino que ya no se ve.
   */
  function cambiarRelacion (nueva: RelacionTarea): void {
    if (nueva === relacion) return
    cambiarVarios({ relacion: nueva, relacionId: '' })
    elegirEspacios([])
  }

  /** Los Espacios de la clase elegida: Proyectos, Licitaciones o Upsells, cada uno por su lado. */
  const espaciosVisibles = useMemo(
    () => espaciosDeClase({ espacios: catalogos.espacios, licitaciones, upsells }, relacion),
    [catalogos.espacios, licitaciones, upsells, relacion]
  )

  // Se recalcula mientras se escribe: la vista previa es lo que hace confiable a una sintaxis que
  // nadie leyo en un manual.
  const leido = useMemo(
    () => interpretarAltaRapida(borrador.texto, catalogos),
    [borrador.texto, catalogos]
  )

  /** Restablece los valores del alta y conserva el contexto de apertura. */
  function limpiar (): void {
    restablecer(borradorInicial({
      proyectoId,
      hitoInicial,
      relacion: proyectoId === undefined ? 'project' : claseDeEspacio(proyectoId, { licitaciones, upsells }),
      asignados: carga.yoId === null ? [] : [carga.yoId],
      personalizados: valoresPorDefecto(definiciones),
      visibleCliente: false
    }))
    tiposYHitos.olvidar()
    envio.reiniciar()
    carga.reiniciarCarga()
    ia.reiniciar()
  }

  /** Cambia la descripción; el reclamo de "falta la descripcion" deja de tener sentido en cuanto algo la llena. */
  function cambiarDescripcion (texto: string): void {
    cambiar('descripcion', texto)
    envio.mostrarErrorDescripcion(null)
  }

  /**
   * Vuelca en los campos lo que resolvio la fusion.
   *
   * Solo escribe lo que tiene valor: un campo que quedo en `null` no borra lo que ya se habia
   * escrito a mano antes de apretar el boton.
   */
  function volcar (resultado: TareaFusionada, espacioElegido: number | null): void {
    if (resultado.name !== '') cambiar('nombre', resultado.name)
    if (espacioElegido !== null) elegirEspacio(String(espacioElegido))
    if (resultado.assignees.length > 0) cambiar('asignados', [...resultado.assignees])
    if (resultado.priority !== null) cambiar('prioridad', String(resultado.priority))
    if (resultado.start_date !== null) cambiar('inicio', resultado.start_date)
    if (resultado.due_date !== null) cambiar('vencimiento', resultado.due_date)
    if (resultado.tags.length > 0) cambiar('etiquetasEscritas', resultado.tags.reduce<string[]>((lista, nombre) => agregarEtiqueta(lista, nombre, carga.nombresDelCatalogo), []))
    if (resultado.description !== null) cambiarDescripcion(resultado.description)
  }

  /**
   * Cierra el diálogo como en un alta que salió bien.
   *
   * @param mensaje el aviso de éxito, que nombra la tarea creada; sin él no se avisa, porque el
   *   parte de un alta a medias ya quedó a la vista
   */
  function cerrarTrasCrear (mensaje?: string): void {
    if (mensaje !== undefined) aviso.exito(mensaje)
    limpiar()
    setAbierto(false)
    onCerrar?.()
    onCreada?.()
    router.refresh()
  }

  /**
   * Alta por campos.
   *
   * Solo el nombre es obligatorio; lo que quedo sin elegir no viaja. Las etiquetas viajan como
   * nombres: la API resuelve las que existen y crea las que no. El selector sugiere las creadas
   * para que la variante con typo sea la excepcion y no la regla.
   */
  async function crearPorCampos (): Promise<void> {
    if (creadaId !== null) { await envio.enviar({}); return }

    const fallo = falloDelAltaPorCampos(borrador, vencimientoRequerido)

    if (fallo?.campo === 'descripcion') {
      envio.mostrarErrorDescripcion(fallo.mensaje)
      envio.mostrarError(null)
      cajaDescripcion.current?.querySelector('textarea')?.focus()
      return
    }
    if (fallo !== null) {
      envio.mostrarError(fallo.mensaje)
      return
    }

    const comun = cuerpoComunDelAlta(borrador)

    // Dos o mas Espacios: la ruta multiple. Con cero o uno se manda el mismo `POST /tasks` de
    // siempre, con el mismo cuerpo, para que el alta de todos los dias no dependa de esto.
    if (vaAEspacio && multiple) {
      await envio.enviarEnVariosEspacios(comun, espacios)

      return
    }

    await envio.enviar({ ...comun, ...cuerpoDeUnDestino(borrador) })
  }

  /** Manda el alta del modo activo. */
  async function crear (evento: FormEvent): Promise<void> {
    evento.preventDefault()

    await crearPorCampos()
  }

  const bloqueado = enCurso || ia.interpretando || cargando || errorCarga !== null

  const formulario = (
    <form className="flex flex-col gap-4" onSubmit={(evento) => { void crear(evento) }}>
      {errorCarga !== null && <div role="alert" className="text-texto-peligro text-sm">{errorCarga} <Boton onClick={carga.reintentar}>Reintentar carga</Boton></div>}
      {cargando && <p role="status">Cargando campos…</p>}
      <fieldset disabled={bloqueado || creadaId !== null} className="flex min-w-0 flex-col gap-4">
        <Segmentado
          etiqueta="Cómo escribir la tarea"
          opciones={MODOS}
          activo={borrador.modo}
          onElegir={(valor) => { cambiar('modo', valor as Modo); envio.mostrarError(null) }}
        />

        {borrador.modo === 'linea' && (
          <EntradaEnLinea
            texto={borrador.texto}
            onTexto={(texto) => { cambiar('texto', texto) }}
            leido={leido}
            marcas={marcasDeLinea(leido, catalogos)}
            onCompletar={() => {
              volcar(fusionarInterpretacion(leido, null, catalogosConEtiquetas), leido.rel_id)
              cambiar('modo', 'campos')
            }}
          />
        )}
        {conIa && <PanelIa ia={ia} />}

        <Campo etiqueta="Nombre" requerido>
          {(props) => (
            <Entrada
              {...props}
              value={borrador.nombre}
              autoFocus
              placeholder="Revisar el contrato"
              onChange={(evento) => { cambiar('nombre', evento.target.value) }}
            />
          )}
        </Campo>

        <CamposDeDestino
          borrador={borrador}
          cambiar={cambiar}
          onRelacion={cambiarRelacion}
          onEspacios={elegirEspacios}
          espaciosVisibles={espaciosVisibles}
          opcionesDeClientes={carga.opcionesDeClientes}
          prioridades={catalogos.prioridades}
          estados={carga.lookups?.task_statuses}
          hitos={tiposYHitos.hitos}
          avisoTipos={tiposYHitos.avisoTipos}
          conFallo={parcial?.pendientes ?? []}
        />

        <CamposDePlanificacion
          borrador={borrador}
          cambiar={cambiar}
          personas={carga.personas}
          vencimientoRequerido={vencimientoRequerido}
          nombresDelCatalogo={carga.nombresDelCatalogo}
          tipos={tiposYHitos.tipos}
          avisoTipos={tiposYHitos.avisoTipos}
        />

        <CampoDescripcion
          caja={cajaDescripcion}
          titulo={borrador.nombre}
          descripcion={borrador.descripcion}
          onDescripcion={cambiarDescripcion}
          error={envio.errorDescripcion}
          adjuntos={borrador.adjuntos}
          onAdjuntos={(archivos) => { cambiar('adjuntos', archivos) }}
          onAdjuntosRechazados={(motivos) => { envio.mostrarError(motivos.length === 0 ? null : motivos.join(' · ')) }}
          conIa={conIa}
          proyectoId={vaAEspacio && espacio !== NINGUNO ? Number(espacio) : null}
          deshabilitado={enCurso}
        />

        <CamposDeFacturacion borrador={borrador} cambiar={cambiar} />
      </fieldset>
      <CamposPersonalizados definiciones={definiciones} valores={borrador.personalizados} errores={envio.erroresCampos}
        onCambiar={(valores) => { cambiar('personalizados', valores); envio.olvidarErroresCampos() }} deshabilitado={enCurso || cargando || errorCarga !== null} />

      {parcial !== null && <ParteAltaMultiple parcial={parcial} />}

      {envio.error !== null && (
        <AvisoEnLinea variante="error" mensaje={envio.error} className="text-sm" />
      )}

      <div className="flex justify-end gap-2">
        <CerrarDialogo asChild>
          <Boton variante="sutil" type="button">Cancelar</Boton>
        </CerrarDialogo>
        {/* Nada que reintentar y todas las tareas ya creadas: el boton no puede seguir diciendo
            "Crear", porque otro clic las duplicaria. */}
        {parcial !== null && parcial.pendientes.length === 0
          ? (
            <Boton variante="primario" type="button" onClick={() => { cerrarTrasCrear() }}>Entendido, cerrar</Boton>
            )
          : (
            <Boton type="submit" variante="primario" cargando={enCurso} disabled={bloqueado}>
              {creadaId !== null
                ? 'Reintentar campos personalizados'
                : parcial === null
                  ? 'Crear'
                  : `Reintentar en ${parcial.pendientes.length} ${parcial.pendientes.length === 1 ? GLOSARIO.espacio.singular.toLowerCase() : GLOSARIO.espacio.plural.toLowerCase()}`}
            </Boton>
            )}
      </div>
    </form>
  )

  if (integrado) return formulario

  return (
    <Dialogo open={abierto} onOpenChange={(valor) => {
      if (envio.enviando.current || ia.interpretando) return
      setAbierto(valor)
      if (!valor) { limpiar(); onCerrar?.() }
    }}>
      <DisparadorDialogo asChild><Boton variante="primario">Nueva tarea</Boton></DisparadorDialogo>
      <ContenidoDialogo titulo="Nueva tarea" ancho="grande" descripcion="Completa todos los campos antes de crear la tarea.">
        {formulario}
      </ContenidoDialogo>
    </Dialogo>
  )
}
