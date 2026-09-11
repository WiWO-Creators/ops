'use client'

import { useMemo, useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Vacio } from '@/componentes/estado/Estados'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { armarArbol, areasProhibidasComoSuperior } from '@/datos/jerarquia'
import type { AreaDelArbol, ArbolDeJerarquia, NodoDelArbol, PersonaDelArbol } from '@/datos/jerarquia'

/** Clases del `<select>` nativo, las mismas que ya usan los filtros de tabla. */
const CLASES_SELECT = 'border-control-borde bg-control text-texto rounded-control h-9 border px-2 text-sm'

/** Lo que se está editando: un área existente, una nueva, o nada. */
type EnEdicion = { id: number | null, name: string, superior: string, jefe: string } | null

/** Un área recién abierta para crear: todo en blanco. */
const AREA_NUEVA: EnEdicion = { id: null, name: '', superior: '', jefe: '' }

/**
 * La pantalla de jefaturas: quién depende de quién, configurable sin tocar la base.
 *
 * === QUÉ RESUELVE ===
 *
 * El árbol de áreas existe en `tblareas` desde la migración 137 y el modo En Vivo ya recorta por él,
 * pero **no había forma de llenarlo**: hoy son 0 áreas y 184 personas sin área, y la única manera de
 * cambiarlo era un `UPDATE` a mano o el catálogo del panel viejo, que es sólo para administradores.
 * Acá una jefatura acomoda su propia rama y mueve a su gente.
 *
 * === POR QUÉ NO HAY ARRASTRAR Y SOLTAR ===
 *
 * Porque el dato que falta es *dónde va cada persona*, y eso se contesta más rápido con un
 * desplegable al lado de cada nombre que arrastrando 184 tarjetas. El desplegable además funciona con
 * teclado y con lector de pantalla sin una línea extra, y el nativo da búsqueda por letra gratis:
 * con 184 nombres eso importa más que la animación.
 *
 * === EL ESTADO VIENE ENTERO DE LA API ===
 *
 * Cada escritura devuelve el árbol completo y reemplaza el que había. No hay actualización optimista
 * ni reconciliación: mover a alguien puede cambiar quién cuelga de quién y qué se puede editar, y
 * recalcular eso acá sería una segunda copia de las reglas que ya resuelve `Escritura\Jerarquia`.
 *
 * @param inicial el árbol tal como lo resolvió el servidor al pintar la página
 */
export function Jerarquia ({ inicial }: { inicial: ArbolDeJerarquia }) {
  const [arbol, setArbol] = useState(inicial)
  const [edicion, setEdicion] = useState<EnEdicion>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const raices = useMemo(() => armarArbol(arbol.areas), [arbol.areas])
  const nombrePorPersona = useMemo(
    () => new Map(arbol.asignables.map((persona) => [persona.id, persona.full_name])),
    [arbol.asignables]
  )

  /** Manda una escritura y reemplaza el árbol con lo que conteste la API. */
  const escribir = async (
    ruta: string,
    metodo: 'POST' | 'PUT',
    cuerpo: unknown
  ): Promise<boolean> => {
    setOcupado(true)
    setError(null)

    const resultado = await escribirEnBff<ArbolDeJerarquia>(ruta, metodo, cuerpo)

    setOcupado(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return false
    }

    setArbol(resultado.datos)

    return true
  }

  const guardarArea = async (): Promise<void> => {
    if (edicion === null) return

    const cuerpo = {
      name: edicion.name,
      area_superior_id: edicion.superior === '' ? null : Number(edicion.superior),
      jefe_staffid: edicion.jefe === '' ? null : Number(edicion.jefe)
    }

    const ok = edicion.id === null
      ? await escribir('jerarquia/areas', 'POST', cuerpo)
      : await escribir(`jerarquia/areas/${edicion.id}`, 'PUT', cuerpo)

    if (ok) setEdicion(null)
  }

  const moverPersona = async (id: number, areaId: string): Promise<void> => {
    await escribir(`jerarquia/personas/${id}`, 'PUT', {
      area_id: areaId === '' ? null : Number(areaId)
    })
  }

  // Una instalación sin las columnas del árbol no tiene nada que configurar, y ofrecer los controles
  // sería ofrecer botones que la API contesta con 409.
  if (!arbol.hay_organigrama) {
    return (
      <Vacio
        titulo="Esta instalación todavía no tiene el organigrama"
        descripcion="Las columnas del árbol de áreas las crea el módulo wiwo_core. Pídele a quien administre el sistema que lo active."
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {error !== null && (
        <p
          role="alert"
          className="border-relleno-peligro text-texto rounded-tarjeta border px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <GuiaDeCarga arbol={arbol} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-texto text-titulo font-semibold">Árbol de dependencias</h2>

          {arbol.es_admin && edicion === null && (
            <Boton variante="secundario" onClick={() => { setEdicion(AREA_NUEVA) }}>
              Nueva área
            </Boton>
          )}
        </div>

        {edicion !== null && (
          <FormularioDeArea
            edicion={edicion}
            areas={arbol.areas}
            personas={arbol.asignables}
            ocupado={ocupado}
            onCambio={setEdicion}
            onGuardar={() => { void guardarArea() }}
            onCancelar={() => { setEdicion(null); setError(null) }}
          />
        )}

        {raices.length === 0
          ? (
            <Vacio
              titulo="El organigrama está vacío"
              descripcion={arbol.es_admin
                ? 'Todavía no hay ninguna área. Crea la primera con “Nueva área”, ponle una jefatura y después reparte a la gente que aparece abajo.'
                : 'Todavía no hay ninguna área. Pídele a quien administre el sistema que cree la primera y te ponga como jefatura de la tuya.'}
            />
            )
          : (
            <ul className="flex flex-col gap-3">
              {raices.map((nodo) => (
                <RamaDeArea
                  key={nodo.area.id}
                  nodo={nodo}
                  areas={arbol.areas}
                  nombrePorPersona={nombrePorPersona}
                  ocupado={ocupado}
                  onEditar={(area) => {
                    setError(null)
                    setEdicion({
                      id: area.id,
                      name: area.name,
                      superior: area.area_superior_id === null ? '' : String(area.area_superior_id),
                      jefe: area.jefe_staffid === null ? '' : String(area.jefe_staffid)
                    })
                  }}
                  onMover={(id, areaId) => { void moverPersona(id, areaId) }}
                />
              ))}
            </ul>
            )}
      </section>

      <SinArea
        personas={arbol.sin_area}
        areas={arbol.areas}
        ocupado={ocupado}
        onMover={(id, areaId) => { void moverPersona(id, areaId) }}
      />
    </div>
  )
}

/**
 * El resumen de lo que falta cargar, arriba de todo.
 *
 * No es decoración: con el árbol vacío —que es el estado real— esta pantalla no tiene nada que
 * mostrar, y lo único útil que puede hacer es decir qué hay que hacer y en qué orden.
 */
function GuiaDeCarga ({ arbol }: { arbol: ArbolDeJerarquia }) {
  const sinJefe = arbol.areas.filter((area) => area.jefe_staffid === null).length
  const pendientes = arbol.sin_area.length

  if (arbol.areas.length > 0 && sinJefe === 0 && pendientes === 0) {
    return (
      <p className="text-texto-tenue text-sm">
        El árbol está completo: todas las áreas tienen jefatura y no queda nadie sin área.
      </p>
    )
  }

  return (
    <ul className="border-linea bg-superficie-hundida rounded-tarjeta flex flex-col gap-1.5 border p-3 text-sm">
      <li className="text-texto font-medium">Para que cada líder vea a su gente falta:</li>

      {arbol.areas.length === 0 && (
        <li className="text-texto-tenue">
          1. Crear las áreas del equipo y colgar cada una de la que está por encima.
        </li>
      )}

      {sinJefe > 0 && (
        <li className="text-texto-tenue">
          {sinJefe === 1
            ? '1 área todavía no tiene jefatura: su gente no reporta a nadie.'
            : `${sinJefe} áreas todavía no tienen jefatura: su gente no reporta a nadie.`}
        </li>
      )}

      {pendientes > 0 && (
        <li className="text-texto-tenue">
          {pendientes === 1
            ? '1 persona no está en ninguna área.'
            : `${pendientes} personas no están en ninguna área.`}
        </li>
      )}
    </ul>
  )
}

/** Una rama del árbol: el área, su gente, y debajo sus áreas hijas. */
function RamaDeArea ({
  nodo,
  areas,
  nombrePorPersona,
  ocupado,
  onEditar,
  onMover
}: {
  nodo: NodoDelArbol
  areas: AreaDelArbol[]
  nombrePorPersona: Map<number, string>
  ocupado: boolean
  onEditar: (area: AreaDelArbol) => void
  onMover: (id: number, areaId: string) => void
}) {
  const { area } = nodo
  const jefe = area.jefe_staffid === null ? null : nombrePorPersona.get(area.jefe_staffid) ?? null

  return (
    <li className="border-linea bg-superficie rounded-tarjeta border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-texto font-semibold">{area.name}</span>

          {area.jefe_staffid === null
            ? <Insignia tono="peligro">Sin jefatura</Insignia>
            : <Insignia tono="acento">{jefe ?? `Persona #${area.jefe_staffid}`}</Insignia>}

          <span className="text-texto-tenue text-xs">
            {area.personas.length === 1 ? '1 persona' : `${area.personas.length} personas`}
          </span>
        </div>

        {area.editable && (
          <Boton variante="secundario" tamano="chico" disabled={ocupado} onClick={() => { onEditar(area) }}>
            Editar
          </Boton>
        )}
      </div>

      {area.personas.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {area.personas.map((persona) => (
            <li key={persona.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-texto text-sm">
                {persona.full_name}
                {persona.id === area.jefe_staffid && (
                  <span className="text-texto-tenue"> · dirige esta área</span>
                )}
                {!persona.active && <span className="text-texto-tenue"> · inactiva</span>}
              </span>

              {area.editable && (
                <SelectorDeArea
                  persona={persona}
                  areas={areas}
                  valor={String(area.id)}
                  ocupado={ocupado}
                  onMover={onMover}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {nodo.hijas.length > 0 && (
        <ul className="border-linea mt-3 flex flex-col gap-3 border-l pl-3">
          {nodo.hijas.map((hija) => (
            <RamaDeArea
              key={hija.area.id}
              nodo={hija}
              areas={areas}
              nombrePorPersona={nombrePorPersona}
              ocupado={ocupado}
              onEditar={onEditar}
              onMover={onMover}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/** La gente que no cuelga de nadie. Con el árbol vacío son todas, y es el trabajo pendiente. */
function SinArea ({
  personas,
  areas,
  ocupado,
  onMover
}: {
  personas: PersonaDelArbol[]
  areas: AreaDelArbol[]
  ocupado: boolean
  onMover: (id: number, areaId: string) => void
}) {
  if (personas.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-texto text-titulo font-semibold">
        Sin área ({personas.length})
      </h2>

      <p className="text-texto-tenue text-sm">
        Estas personas no dependen de nadie: no aparecen en el tablero de ninguna jefatura.
      </p>

      <ul className="border-linea bg-superficie rounded-tarjeta flex flex-col gap-1.5 border p-3">
        {personas.map((persona) => (
          <li key={persona.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-texto text-sm">{persona.full_name}</span>

            <SelectorDeArea
              persona={persona}
              areas={areas}
              valor=""
              ocupado={ocupado || areas.length === 0}
              onMover={onMover}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** El desplegable que mueve a una persona de área. Sólo ofrece las áreas que quien mira puede tocar. */
function SelectorDeArea ({
  persona,
  areas,
  valor,
  ocupado,
  onMover
}: {
  persona: PersonaDelArbol
  areas: AreaDelArbol[]
  valor: string
  ocupado: boolean
  onMover: (id: number, areaId: string) => void
}) {
  return (
    <select
      aria-label={`Área de ${persona.full_name}`}
      className={CLASES_SELECT}
      disabled={ocupado}
      value={valor}
      onChange={(evento) => { onMover(persona.id, evento.target.value) }}
    >
      <option value="">Sin área</option>
      {areas.filter((area) => area.editable).map((area) => (
        <option key={area.id} value={area.id}>{area.name}</option>
      ))}
    </select>
  )
}

/**
 * Alta y edición de un área: su nombre, de quién cuelga y quién la dirige.
 *
 * El selector de área superior esconde la propia área y su descendencia, que es exactamente lo que
 * la API rechaza con un 422 (`Escritura\Jerarquia::exigirSinCiclo()`). Esconderlo no es la validación
 * —esa vive en la API y no se puede saltar— sino no ofrecer una opción que sólo lleva a un error.
 */
function FormularioDeArea ({
  edicion,
  areas,
  personas,
  ocupado,
  onCambio,
  onGuardar,
  onCancelar
}: {
  edicion: NonNullable<EnEdicion>
  areas: AreaDelArbol[]
  personas: PersonaDelArbol[]
  ocupado: boolean
  onCambio: (edicion: EnEdicion) => void
  onGuardar: () => void
  onCancelar: () => void
}) {
  const prohibidas = useMemo(
    () => edicion.id === null ? new Set<number>() : areasProhibidasComoSuperior(areas, edicion.id),
    [areas, edicion.id]
  )

  return (
    <form
      className="border-linea bg-superficie-hundida rounded-tarjeta flex flex-col gap-3 border p-3"
      onSubmit={(evento) => { evento.preventDefault(); onGuardar() }}
    >
      <Campo etiqueta="Nombre del área" requerido>
        {(props) => (
          <Entrada
            {...props}
            value={edicion.name}
            maxLength={191}
            required
            onChange={(evento) => { onCambio({ ...edicion, name: evento.target.value }) }}
          />
        )}
      </Campo>

      <Campo etiqueta="Depende de" ayuda="Déjalo en “Ninguna” si es una de las áreas de arriba de todo.">
        {(props) => (
          <select
            {...props}
            className={CLASES_SELECT}
            value={edicion.superior}
            onChange={(evento) => { onCambio({ ...edicion, superior: evento.target.value }) }}
          >
            <option value="">Ninguna</option>
            {areas.filter((area) => !prohibidas.has(area.id)).map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </select>
        )}
      </Campo>

      <Campo
        etiqueta="La dirige"
        ayuda="Quien la dirige ve a su gente en En Vivo, y también a la de las áreas que cuelgan de ésta."
      >
        {(props) => (
          <select
            {...props}
            className={CLASES_SELECT}
            value={edicion.jefe}
            onChange={(evento) => { onCambio({ ...edicion, jefe: evento.target.value }) }}
          >
            <option value="">Nadie todavía</option>
            {personas.map((persona) => (
              <option key={persona.id} value={persona.id}>{persona.full_name}</option>
            ))}
          </select>
        )}
      </Campo>

      <div className="flex flex-wrap gap-2">
        <Boton type="submit" variante="primario" cargando={ocupado}>
          {edicion.id === null ? 'Crear área' : 'Guardar cambios'}
        </Boton>

        <Boton type="button" variante="secundario" disabled={ocupado} onClick={onCancelar}>
          Cancelar
        </Boton>
      </div>
    </form>
  )
}
