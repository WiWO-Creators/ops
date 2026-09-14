'use client'

import { useMemo, useState } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Vacio } from '@/componentes/estado/Estados'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import {
  aplanarArbol,
  areasElegiblesComoSuperior,
  areasSinJefatura,
  construirArbol,
  personasParaSumar,
  cuantosEn,
  loQueRetieneElArea,
  type NodoArea
} from '@/dominio/jerarquia'
import type { AreaDelEquipo, Jerarquia as ArbolDeJerarquia, PersonaDeJerarquia } from '@/datos/jerarquia'

/** Largo máximo del nombre de un área. Es `Escritura\Jerarquia::TOPE_NOMBRE`, no el de la columna. */
const LARGO_NOMBRE = 191

/** Cuánta gente se ofrece a la vez en una lista. Con 184 personas, la lista entera no se lee. */
const TOPE_DE_LISTA = 25

/** El valor que usa el selector para "ninguna": Radix no acepta `null` ni la cadena vacía. */
const NINGUNA = 'ninguna'

/** Qué diálogo está abierto, y sobre qué área. */
type Formulario =
  | { modo: 'alta' }
  | { modo: 'edicion', nodo: NodoArea }
  | { modo: 'borrado', nodo: NodoArea }

/**
 * Jerarquías del equipo: el árbol de áreas, su alta y edición, y el reparto de la gente.
 *
 * El árbol llega resuelto del servidor y de ahí en adelante **no se vuelve a pedir**: las cuatro
 * escrituras devuelven el árbol entero, así que cada una reemplaza el que había. Eso evita un viaje
 * por operación —con 184 personas por ubicar, 184 viajes— y evita también el parpadeo de recargar la
 * pantalla entera cada vez que alguien cambia de área.
 *
 * Y es el árbol de la API el que manda, no uno recalculado acá: mover a alguien puede cambiar quién
 * cuelga de quién y qué se puede editar, y rehacer esas reglas en el navegador sería una segunda
 * copia que se desincroniza sola.
 */
export function Jerarquia ({ inicial }: { inicial: ArbolDeJerarquia }) {
  const [arbol, setArbol] = useState(inicial)
  const [formulario, setFormulario] = useState<Formulario | null>(null)
  const [elegida, setElegida] = useState<number | null>(null)

  const raices = useMemo(() => construirArbol(arbol.areas), [arbol.areas])
  const nodos = useMemo(() => aplanarArbol(raices), [raices])
  const nodoElegido = nodos.find((nodo) => nodo.area.id === elegida) ?? null

  // Sin las columnas del árbol no hay nada que configurar, y ofrecer "creá la primera área" sería
  // ofrecer un botón que la API rechaza con 409 en cada intento. Es del esquema, no de los datos.
  if (!arbol.hay_organigrama) {
    return (
      <Vacio
        titulo="Esta instalación todavía no tiene el organigrama"
        descripcion="Las columnas del árbol de áreas las crea el módulo wiwo_core. Pedile a quien administre el sistema que lo active."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-texto-tenue text-sm">
          {arbol.es_admin ? contar(arbol.areas.length, 'área', 'áreas') : `Tu rama: ${contar(arbol.areas.length, 'área', 'áreas')}`}
          {' · '}
          {contar(raices.length, 'raíz', 'raíces')}
        </p>

        {/* Crear un área es de quien administra: una nace fuera de la rama de quien la creó y nadie
            la vería. Sin `es_admin` el botón no se dibuja, en vez de ofrecer un 403. */}
        {arbol.es_admin && (
          <Boton variante="primario" onClick={() => { setFormulario({ modo: 'alta' }) }}>
            Nueva área
          </Boton>
        )}
      </div>

      <QueFalta arbol={arbol} />

      {/* Una sola columna hasta 1024px: el panel de gente debajo del árbol se recorre con el pulgar,
          y dos columnas a ancho de teléfono dejarían las dos ilegibles. */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
        {arbol.areas.length === 0
          ? (
            <Vacio
              titulo="Todavía no hay áreas"
              descripcion={arbol.es_admin
                ? 'Creá la primera y después colgale las que dependan de ella. Mientras no haya ninguna, en «En vivo» cada persona se ve solo a sí misma.'
                : 'Pedile a quien administre el sistema que cree la primera y te ponga como jefatura de la tuya.'}
              accion={arbol.es_admin
                ? <Boton variante="primario" onClick={() => { setFormulario({ modo: 'alta' }) }}>Crear la primera área</Boton>
                : undefined}
              className="border-linea rounded-tarjeta border"
            />
            )
          : (
            <ArbolDeAreas
              nodos={nodos}
              arbol={arbol}
              elegida={elegida}
              onElegir={setElegida}
              onEditar={(nodo) => { setFormulario({ modo: 'edicion', nodo }) }}
              onBorrar={(nodo) => { setFormulario({ modo: 'borrado', nodo }) }}
            />
            )}

        <div className="flex flex-col gap-4">
          <PanelSinArea arbol={arbol} nodo={nodoElegido} onArbol={setArbol} />
          {nodoElegido !== null && (
            <PanelDelArea arbol={arbol} nodo={nodoElegido} onArbol={setArbol} />
          )}
        </div>
      </div>

      {(formulario?.modo === 'alta' || formulario?.modo === 'edicion') && (
        <FormularioDeArea
          arbol={arbol}
          nodo={formulario.modo === 'edicion' ? formulario.nodo : null}
          onCerrar={() => { setFormulario(null) }}
          onArbol={(nuevo) => { setFormulario(null); setArbol(nuevo) }}
        />
      )}

      {formulario?.modo === 'borrado' && (
        <DialogoBorrar
          nodo={formulario.nodo}
          onCerrar={() => { setFormulario(null) }}
          onArbol={(nuevo) => { setFormulario(null); setElegida(null); setArbol(nuevo) }}
        />
      )}
    </div>
  )
}

/** Un contador con su sustantivo en el número que corresponde. */
function contar (cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`
}

/**
 * Qué falta para que el organigrama sirva, arriba de todo.
 *
 * Son dos huecos y no uno, y los dos son silenciosos: una persona sin área no aparece en el tablero
 * de ninguna jefatura, y un área sin jefatura deja a su gente sin nadie a quien reportar. Por fila se
 * ven de a uno; el total es lo que hace que con veinte áreas alguien se entere.
 *
 * Cuando no falta nada desaparece: un aviso permanente que dice "cero" deja de leerse y se lleva
 * puesto el siguiente.
 */
function QueFalta ({ arbol }: { arbol: ArbolDeJerarquia }) {
  const sinJefatura = areasSinJefatura(arbol.areas)
  const sinArea = arbol.sin_area.length

  if (sinJefatura === 0 && sinArea === 0) {
    return (
      <p className="text-texto-tenue text-sm">
        El árbol está completo: todas las áreas tienen jefatura y no queda nadie sin área.
      </p>
    )
  }

  return (
    <div className="border-linea bg-superficie-aviso rounded-tarjeta flex flex-col gap-2 border px-4 py-3">
      <p className="text-texto text-sm font-medium">Para que cada jefatura vea a su gente falta:</p>

      <ul className="text-texto flex flex-col gap-1 text-sm">
        {sinArea > 0 && (
          <li className="flex flex-wrap items-center gap-2">
            <Insignia tono="aviso">{contar(sinArea, 'persona', 'personas')} sin área</Insignia>
            <span>de {arbol.asignables.length} en el equipo: no aparecen en el tablero de ninguna jefatura.</span>
          </li>
        )}

        {sinJefatura > 0 && (
          <li className="flex flex-wrap items-center gap-2">
            <Insignia tono="peligro">{contar(sinJefatura, 'área', 'áreas')} sin jefatura</Insignia>
            <span>su gente no reporta a nadie.</span>
          </li>
        )}
      </ul>
    </div>
  )
}

interface PropsArbol {
  nodos: NodoArea[]
  arbol: ArbolDeJerarquia
  elegida: number | null
  onElegir: (id: number) => void
  onEditar: (nodo: NodoArea) => void
  onBorrar: (nodo: NodoArea) => void
}

/**
 * El árbol, como una lista indentada por nivel.
 *
 * Plana y no con `<ul>` anidados: a diez niveles de profundidad el anidado real arrastra márgenes que
 * se acumulan y la última fila queda contra el borde derecho. La jerarquía la dice `aria-level`, que
 * es lo que lee un lector de pantalla de todos modos.
 *
 * **Sin `role="tree"` a propósito.** Ese rol es un widget compuesto: promete foco itinerante y
 * navegación con flechas, y además un `treeitem` no puede llevar botones adentro. Acá cada fila tiene
 * tres botones y ninguna de esas dos cosas está implementada, así que poner el rol sería anunciar un
 * contrato que la pantalla no cumple — peor que no anunciarlo. `aria-level` sobre un `listitem` es
 * válido y dice la profundidad sin prometer nada más.
 */
function ArbolDeAreas ({ nodos, arbol, elegida, onElegir, onEditar, onBorrar }: PropsArbol) {
  return (
    <ul aria-label="Áreas del equipo" className="border-linea rounded-tarjeta divide-linea-suave divide-y border">
      {nodos.map((nodo) => (
        <FilaDeArea
          key={nodo.area.id}
          nodo={nodo}
          arbol={arbol}
          elegida={nodo.area.id === elegida}
          onElegir={onElegir}
          onEditar={onEditar}
          onBorrar={onBorrar}
        />
      ))}
    </ul>
  )
}

interface PropsFila {
  nodo: NodoArea
  arbol: ArbolDeJerarquia
  elegida: boolean
  onElegir: (id: number) => void
  onEditar: (nodo: NodoArea) => void
  onBorrar: (nodo: NodoArea) => void
}

/** Una fila del árbol: el área, quién la dirige, cuánta gente tiene y qué se le puede hacer. */
function FilaDeArea ({ nodo, arbol, elegida, onElegir, onEditar, onBorrar }: PropsFila) {
  const { area, nivel, alcance } = nodo
  const gente = cuantosEn(area)

  return (
    <li
      aria-level={nivel + 1}
      aria-current={elegida ? true : undefined}
      className={elegida ? 'bg-acento-suave' : undefined}
    >
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
        // La sangría es inline porque depende del nivel, que es un dato y no una de las clases que
        // Tailwind puede generar de antemano. Se topa a seis para que el décimo nivel —si alguna vez
        // existe— no empuje el nombre fuera de la pantalla de un teléfono.
        style={{ paddingInlineStart: `calc(0.75rem + ${Math.min(nivel, 6)} * 1.25rem)` }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {nivel > 0 && <span aria-hidden="true" className="text-texto-sutil text-xs">└</span>}
            <span className="text-texto font-semibold">{area.name}</span>

            {/* A la altura del nombre y no gris al pie: un área sin jefatura es el fallo que esta
                pantalla existe para arreglar, y su gente no reporta a nadie mientras siga así.

                En «aviso» y no en «peligro» por una razón de escala: el estado inicial real son las
                16 áreas sin jefatura, así que el rojo pintaría la pantalla entera el primer día y
                dejaría de significar algo. La urgencia la lleva el total de arriba, que es uno solo;
                acá alcanza con que se vea de quién falta. */}
            {area.jefe_staffid === null && (
              <Insignia tono="aviso" tamano="chico">Sin jefatura</Insignia>
            )}

            {/* La insignia dice la CONSECUENCIA y no el estado: "desalineada" no le dice nada a
                nadie, y el punto es que esta área no trae ningún Proceso y nadie se entera, porque
                no hay error — simplemente viene vacía. */}
            {!area.en_tareas && (
              <Insignia
                tono="aviso"
                tamano="chico"
                title={`«${area.name}» no coincide con ninguna de las áreas de los Procesos, así que no cruza con ninguno: donde se filtre por área, esta no va a traer nada.`}
              >
                No coincide con ninguna área de los Procesos
              </Insignia>
            )}
          </div>

          <div className="text-texto-tenue flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <QuienDirige area={area} arbol={arbol} />

            <span>{contar(gente, 'persona', 'personas')}</span>

            {/* El alcance solo se nombra cuando difiere: en una hoja repetiría el número de al lado. */}
            {alcance > gente && <span className="text-texto-sutil">ve a {alcance} con lo que cuelga</span>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Boton
            variante={elegida ? 'primario' : 'secundario'}
            tamano="chico"
            onClick={() => { onElegir(area.id) }}
          >
            Gente
          </Boton>

          {/* Sin `editable` no se dibuja: quien no administra ve su rama entera pero solo edita lo
              que dirige, y el botón que la API va a rechazar no tiene por qué existir. */}
          {area.editable && (
            <Boton variante="sutil" tamano="chico" onClick={() => { onEditar(nodo) }}>Editar</Boton>
          )}

          {/* Borrar es solo de quien administra, igual que crear. */}
          {arbol.es_admin && (
            <Boton variante="sutil" tamano="chico" onClick={() => { onBorrar(nodo) }}>Borrar</Boton>
          )}
        </div>
      </div>
    </li>
  )
}

/**
 * Quién dirige el área.
 *
 * El nombre sale de `asignables`, que es el catálogo entero, y no de la gente del área: así se puede
 * nombrar a quien la dirige **y además** avisar cuando no pertenece a ella. Un jefe que no está en su
 * propia área es un dato torcido que conviene ver, no esconder — y con el nombre delante se arregla,
 * sin él hay que ir a buscar quién era.
 */
function QuienDirige ({ area, arbol }: { area: AreaDelEquipo, arbol: ArbolDeJerarquia }) {
  if (area.jefe_staffid === null) return <span className="text-texto-sutil">Sin quien la dirija</span>

  const jefe = arbol.asignables.find((persona) => persona.id === area.jefe_staffid)
  const adentro = area.personas.some((persona) => persona.id === area.jefe_staffid)

  if (jefe === undefined) return <span className="text-texto-sutil">La dirige alguien que ya no está activo</span>

  return (
    <span className="flex items-center gap-1.5">
      <Avatar nombre={jefe.full_name} tamano="chico" />
      Dirige {jefe.full_name}
      {!adentro && <span className="text-texto-sutil">(desde otra área)</span>}
    </span>
  )
}

interface PropsFormulario {
  arbol: ArbolDeJerarquia
  /** El área a editar, o `null` para un alta. */
  nodo: NodoArea | null
  onCerrar: () => void
  onArbol: (arbol: ArbolDeJerarquia) => void
}

/**
 * Alta y edición de un área: su nombre, de qué área cuelga y quién la dirige.
 *
 * **El nombre solo se escribe al crear.** Renombrar está bloqueado del lado de la API —contesta
 * 409— porque los Procesos guardan el nombre del área y no su id, así que cambiarlo los
 * desconectaría en silencio. En la edición se muestra como dato, con el motivo al lado: ofrecer un
 * campo que se rechaza al guardar es peor que no ofrecerlo.
 *
 * El selector de área superior tampoco ofrece la propia ni su descendencia. Es lo mismo que la API
 * rechaza con `ciclo`, y ofrecerlo para después explicar que no se puede es hacerle perder un viaje
 * a quien completa el formulario.
 */
function FormularioDeArea ({ arbol, nodo, onCerrar, onArbol }: PropsFormulario) {
  const area = nodo?.area ?? null
  const [nombre, setNombre] = useState(area?.name ?? '')
  const [superior, setSuperior] = useState(area?.area_superior_id == null ? NINGUNA : String(area.area_superior_id))
  const [jefe, setJefe] = useState(area?.jefe_staffid == null ? NINGUNA : String(area.jefe_staffid))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const elegibles = useMemo(
    () => areasElegiblesComoSuperior(arbol.areas, area?.id ?? null),
    [arbol.areas, area]
  )
  const nombreLimpio = nombre.trim()
  const errorNombre = nombreLimpio.length <= LARGO_NOMBRE
    ? undefined
    : `El nombre no puede pasar de ${LARGO_NOMBRE} caracteres.`

  /** Manda el alta (`POST`) o la edición (`PUT`, no `PATCH`) y entrega el árbol que devuelve. */
  async function guardar (): Promise<void> {
    if (area === null && nombreLimpio === '') {
      setError('Poné un nombre para el área.')

      return
    }

    if (errorNombre !== undefined) return

    // Las tres claves van siempre, aunque dos vayan en `null`: el `PUT` las exige presentes, porque
    // un cuerpo parcial desenganchaba el área del árbol en silencio. En la edición `name` es el que
    // ya tenía —reenviarlo no cuenta como renombre— y por eso el campo puede ser de solo lectura.
    const cuerpo = {
      name: area?.name ?? nombreLimpio,
      area_superior_id: superior === NINGUNA ? null : Number(superior),
      jefe_staffid: jefe === NINGUNA ? null : Number(jefe)
    }

    setGuardando(true)
    setError(null)

    const resultado = area === null
      ? await escribirEnBff<ArbolDeJerarquia>('jerarquia/areas', 'POST', cuerpo)
      : await escribirEnBff<ArbolDeJerarquia>(`jerarquia/areas/${area.id}`, 'PUT', cuerpo)

    setGuardando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    if (!esArbol(resultado.datos)) {
      setError('Se guardó, pero el servidor no devolvió el organigrama. Recargá la pantalla.')

      return
    }

    onArbol(resultado.datos)
  }

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo
        titulo={area === null ? 'Nueva área' : `Editar ${area.name}`}
        descripcion="De qué área cuelga decide quién la ve en «En vivo»: quien dirige un área ve a su gente y a la de todo lo que cuelga debajo."
      >
        <form
          onSubmit={(evento) => { evento.preventDefault(); void guardar() }}
          className="flex flex-col gap-4"
        >
          {area === null
            ? (
              <Campo etiqueta="Nombre" requerido error={errorNombre}>
                {(props) => (
                  <Entrada
                    {...props}
                    value={nombre}
                    maxLength={LARGO_NOMBRE}
                    autoFocus
                    placeholder="Analytics"
                    onChange={(evento) => { setNombre(evento.target.value) }}
                  />
                )}
              </Campo>
              )
            : (
              <div className="border-linea bg-superficie-hundida rounded-tarjeta flex flex-col gap-1 border p-3">
                <p className="text-texto-sutil text-xs">Nombre</p>
                <p className="text-texto text-sm font-medium">{area.name}</p>
                <p className="text-texto-sutil text-xs">
                  No se puede cambiar acá: los Procesos guardan el nombre del área y no su id, así que
                  renombrarla los desconectaría en silencio. Pedilo si hace falta.
                </p>
              </div>
              )}

          <Campo
            etiqueta="De qué área cuelga"
            ayuda="Dejala en «Ninguna» para que sea una raíz del organigrama."
          >
            {(props) => (
              <Selector value={superior} onValueChange={setSuperior}>
                <DisparadorSelector id={props.id} marcador="Ninguna" />
                <ContenidoSelector>
                  <Opcion value={NINGUNA}>Ninguna (es una raíz)</Opcion>
                  {elegibles.map((elegible) => (
                    <Opcion key={elegible.area.id} value={String(elegible.area.id)}>
                      {' '.repeat(elegible.nivel * 2) + elegible.area.name}
                    </Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>

          <Campo
            etiqueta="Quién la dirige"
            ayuda="Es quien va a ver en «En vivo» a la gente de esta área y a la de las que cuelgan."
          >
            {(props) => (
              <Selector value={jefe} onValueChange={setJefe}>
                <DisparadorSelector id={props.id} marcador="Nadie" />
                <ContenidoSelector>
                  <Opcion value={NINGUNA}>Nadie por ahora</Opcion>
                  {arbol.asignables.map((persona) => (
                    <Opcion key={persona.id} value={String(persona.id)}>{persona.full_name}</Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>

          {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil" type="button">Cancelar</Boton>
            </CerrarDialogo>
            <Boton variante="primario" type="submit" cargando={guardando}>
              {area === null ? 'Crear área' : 'Guardar'}
            </Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}

/**
 * Que lo que volvió tenga forma de árbol antes de pintar con ello.
 *
 * Las cuatro escrituras devuelven el árbol entero, pero si alguna vez contestaran otra cosa, pintar
 * con eso dejaría la pantalla vacía sin decir por qué.
 */
function esArbol (datos: unknown): datos is ArbolDeJerarquia {
  return datos !== null && typeof datos === 'object' && Array.isArray((datos as ArbolDeJerarquia).areas)
}

/**
 * Confirmación de borrado.
 *
 * La pantalla anticipa lo que ya sabe —gente asignada y áreas que cuelgan— y **advierte de lo que no
 * puede saber**: cuántos Procesos están marcados con ese nombre. Esa tercera cuenta es la que
 * sorprende, porque un área puede verse vacía acá y aun así no poder borrarse. Por eso el botón se
 * ofrece igual: el único que sabe si se puede es el servidor, y su 409 llega con las tres cuentas ya
 * redactadas y se muestra tal cual.
 */
function DialogoBorrar ({ nodo, onCerrar, onArbol }: {
  nodo: NodoArea
  onCerrar: () => void
  onArbol: (arbol: ArbolDeJerarquia) => void
}) {
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const retiene = loQueRetieneElArea(nodo)

  async function borrar (): Promise<void> {
    setBorrando(true)
    setError(null)

    const resultado = await escribirEnBff<ArbolDeJerarquia>(`jerarquia/areas/${nodo.area.id}`, 'DELETE')

    setBorrando(false)

    if (resultado.ok && esArbol(resultado.datos)) {
      onArbol(resultado.datos)

      return
    }

    setError(resultado.ok
      ? 'El área se borró, pero el servidor no devolvió el organigrama. Recargá la pantalla.'
      : resultado.mensaje)
  }

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo
        ancho="chico"
        titulo={`Borrar ${nodo.area.name}`}
        descripcion="El área desaparece del organigrama. No se borra ninguna persona."
      >
        <div className="mb-4 flex flex-col gap-2 text-sm">
          {retiene !== null && (
            <p className="text-texto">
              Ojo: «{nodo.area.name}» tiene {retiene}. Mientras siga así, no se va a poder borrar.
            </p>
          )}

          {/* Se dice siempre, incluso cuando el área se ve vacía: es justamente ahí donde el 409
              sorprende, porque los Procesos marcados con este nombre no se ven en esta pantalla. */}
          <p className="text-texto-tenue text-xs">
            Puede haber además Procesos marcados con este nombre. Eso no se ve desde acá: si los hay,
            el servidor no va a dejar borrarla y va a decir cuántos son.
          </p>
        </div>

        {error !== null && <p role="alert" className="text-texto-peligro mb-3 text-sm">{error}</p>}

        <div className="flex justify-end gap-2">
          <CerrarDialogo asChild>
            <Boton variante="sutil">Cancelar</Boton>
          </CerrarDialogo>
          <Boton variante="peligro" cargando={borrando} onClick={() => { void borrar() }}>
            Borrar
          </Boton>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}

interface PropsPanel {
  arbol: ArbolDeJerarquia
  nodo: NodoArea | null
  onArbol: (arbol: ArbolDeJerarquia) => void
}

/**
 * Quién todavía no tiene área, y el botón para mandarlo a la elegida.
 *
 * Es el panel más importante de la pantalla y por eso va primero: hoy hay 184 personas en esta lista
 * y vaciarla es el trabajo entero. Hacerlo de a una entrando a cada ficha no termina nunca; acá se
 * elige un área en el árbol y se reparte desde una sola vista, con la búsqueda filtrando en el
 * navegador sobre la lista que ya está en memoria.
 */
function PanelSinArea ({ arbol, nodo, onArbol }: PropsPanel) {
  const [busqueda, setBusqueda] = useState('')
  const [moviendo, setMoviendo] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const termino = busqueda.trim().toLowerCase()
  const coinciden = arbol.sin_area.filter(
    (persona) => termino === '' || persona.full_name.toLowerCase().includes(termino)
  )
  const destinoServido = nodo !== null && nodo.area.editable

  async function sumar (persona: PersonaDeJerarquia, areaId: number): Promise<void> {
    setMoviendo(persona.id)
    setError(null)

    const fallo = await cambiarAreaPersona(persona, areaId, 'agregar', onArbol)

    setMoviendo(null)
    setError(fallo)
  }

  if (arbol.sin_area.length === 0) return null

  return (
    <aside className="border-linea rounded-tarjeta flex flex-col gap-3 border p-4" aria-label="Personas sin área">
      <div>
        <h2 className="text-texto font-semibold">Sin área</h2>
        <p className="text-texto-tenue text-xs">
          {destinoServido
            ? `Sumalas a «${nodo.area.name}», que es el área elegida en el árbol.`
            : 'Estas personas no dependen de nadie. Elegí un área en el árbol —el botón «Gente»— para mandarlas ahí.'}
        </p>
      </div>

      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

      <Campo etiqueta="Buscar entre las que faltan">
        {(props) => (
          <Entrada
            {...props}
            type="search"
            value={busqueda}
            placeholder="Buscar por nombre"
            onChange={(evento) => { setBusqueda(evento.target.value) }}
          />
        )}
      </Campo>

      {coinciden.length === 0
        ? <p className="text-texto-sutil text-xs">Nadie sin área coincide con esa búsqueda.</p>
        : (
          <ul className="divide-linea-suave flex flex-col divide-y">
            {coinciden.slice(0, TOPE_DE_LISTA).map((persona) => (
              <li key={persona.id} className="flex items-center gap-2 py-2">
                <Avatar nombre={persona.full_name} tamano="chico" />
                <span className="text-texto min-w-0 flex-1 truncate text-sm">{persona.full_name}</span>

                {destinoServido && (
                  <Boton
                    variante="secundario"
                    tamano="chico"
                    cargando={moviendo === persona.id}
                    onClick={() => { void sumar(persona, nodo.area.id) }}
                  >
                    Sumar
                  </Boton>
                )}
              </li>
            ))}
          </ul>
          )}

      {coinciden.length > TOPE_DE_LISTA && (
        <p className="text-texto-sutil text-xs">
          Se muestran {TOPE_DE_LISTA} de {coinciden.length}. Buscá por nombre para llegar a alguien en particular.
        </p>
      )}
    </aside>
  )
}

/**
 * Agrega o quita una membresía y entrega el organigrama actualizado.
 *
 * @param persona la persona cuya membresía cambia
 * @param areaId el área concreta que se agrega o quita
 * @param accion el cambio de membresía; las otras áreas se conservan
 * @param onArbol recibe el árbol devuelto por la API
 * @returns el mensaje de error, o null al completar el cambio
 */
async function cambiarAreaPersona (
  persona: PersonaDeJerarquia,
  areaId: number,
  accion: 'agregar' | 'quitar',
  onArbol: (arbol: ArbolDeJerarquia) => void
): Promise<string | null> {
  const resultado = await escribirEnBff<ArbolDeJerarquia>(
    `jerarquia/personas/${persona.id}`, 'PUT', { area_id: areaId, accion }
  )

  if (!resultado.ok) return `No se pudieron cambiar las áreas de ${persona.full_name}. ${resultado.mensaje}`

  if (!esArbol(resultado.datos)) {
    return `Se actualizaron las áreas de ${persona.full_name}, pero el servidor no devolvió el organigrama. Recargá la pantalla.`
  }

  onArbol(resultado.datos)

  return null
}

/**
 * La gente del área elegida, con la forma de sacarla o de traer a alguien de otra área.
 *
 * La lista de candidatos excluye a quien no tiene área: esa gente ya tiene su propio panel arriba,
 * que es donde está el trabajo, y repetirla acá haría dos listas con las mismas filas.
 */
function PanelDelArea ({ arbol, nodo, onArbol }: PropsPanel & { nodo: NodoArea }) {
  const [busqueda, setBusqueda] = useState('')
  const [moviendo, setMoviendo] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const deOtrasAreas = useMemo(() => personasParaSumar(arbol.areas, nodo.area),
    [arbol.areas, nodo.area])

  const termino = busqueda.trim().toLowerCase()
  const candidatos = deOtrasAreas.filter(
    ({ persona }) => termino === '' || persona.full_name.toLowerCase().includes(termino)
  )
  const gente = cuantosEn(nodo.area)

  async function cambiar (persona: PersonaDeJerarquia, accion: 'agregar' | 'quitar'): Promise<void> {
    setMoviendo(persona.id)
    setError(null)

    const fallo = await cambiarAreaPersona(persona, nodo.area.id, accion, onArbol)

    setMoviendo(null)
    setError(fallo)
  }

  return (
    <aside className="border-linea rounded-tarjeta flex flex-col gap-3 border p-4" aria-label={`Gente de ${nodo.area.name}`}>
      <div>
        <h2 className="text-texto font-semibold">{nodo.area.name}</h2>
        <p className="text-texto-tenue text-xs">
          {gente === 0 ? 'Todavía no hay nadie' : contar(gente, 'persona', 'personas')}
          {nodo.alcance > gente && ` · ${nodo.alcance} con lo que cuelga`}
        </p>
      </div>

      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

      {!nodo.area.editable && (
        <p className="text-texto-sutil text-xs">
          Esta área es de solo lectura para vos: la ves porque cuelga de tu rama, pero la maneja quien la dirige.
        </p>
      )}

      {nodo.area.personas.length > 0 && (
        <ul className="divide-linea-suave flex flex-col divide-y">
          {nodo.area.personas.map((persona) => (
            <li key={persona.id} className="flex items-center gap-2 py-2">
              <Avatar nombre={persona.full_name} tamano="chico" />

              <span className="min-w-0 flex-1">
                <span className="text-texto block truncate text-sm">{persona.full_name}</span>
                {/* La baja sigue colgada del área y hay que poder verla para sacarla. No se esconde
                    —desaparecería sin que nadie sepa por qué— ni se cuenta en el número de arriba. */}
                {!persona.active && <span className="text-texto-sutil block text-xs">Dada de baja</span>}
              </span>

              {persona.id === nodo.area.jefe_staffid && <Insignia tono="acento" tamano="chico">Dirige</Insignia>}

              {nodo.area.editable && (
                <Boton
                  variante="sutil"
                  tamano="chico"
                  cargando={moviendo === persona.id}
                  onClick={() => { void cambiar(persona, 'quitar') }}
                >
                  Quitar de esta área
                </Boton>
              )}
            </li>
          ))}
        </ul>
      )}

      {nodo.area.editable && deOtrasAreas.length > 0 && (
        <div className="flex flex-col gap-2">
          <Campo etiqueta="Sumar desde otras áreas" ayuda="Conserva sus áreas actuales.">
            {(props) => (
              <Entrada
                {...props}
                type="search"
                value={busqueda}
                placeholder="Buscar por nombre"
                onChange={(evento) => { setBusqueda(evento.target.value) }}
              />
            )}
          </Campo>

          {candidatos.length === 0
            ? <p className="text-texto-sutil text-xs">Nadie de otra área coincide con esa búsqueda.</p>
            : (
              <ul className="divide-linea-suave flex flex-col divide-y">
                {candidatos.slice(0, TOPE_DE_LISTA).map(({ persona, desde }) => (
                  <li key={persona.id} className="flex items-center gap-2 py-2">
                    <Avatar nombre={persona.full_name} tamano="chico" />

                    <span className="min-w-0 flex-1">
                      <span className="text-texto block truncate text-sm">{persona.full_name}</span>
                      {/* Áreas actuales: se conservan al sumar a la persona. */}
                      <span className="text-texto-sutil block truncate text-xs">{desde}</span>
                    </span>

                    <Boton
                      variante="secundario"
                      tamano="chico"
                      cargando={moviendo === persona.id}
                      onClick={() => { void cambiar(persona, 'agregar') }}
                    >
                      Sumar
                    </Boton>
                  </li>
                ))}
              </ul>
              )}
        </div>
      )}
    </aside>
  )
}
