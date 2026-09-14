'use client'

/**
 * El panel lateral que se abre al hacer clic en una persona: escalón, jefe y área, de una lista.
 *
 * **No es el plan B del arrastre, es la vía principal.** El arrastre sirve cuando el jefe de destino
 * está a la vista; con 184 personas casi nunca lo está, en un teléfono no hay arrastre que valga y
 * con teclado no existe. Todo lo que se puede hacer arrastrando se puede hacer acá, y algo más: el
 * escalón y el área, que el arrastre no toca.
 *
 * El selector de jefe **no ofrece a nadie de la propia descendencia**: colgar a alguien de su propio
 * subordinado es el ciclo que la API rechaza con un 422. Igual puede llegar el 422 —el árbol se pudo
 * mover en otra pestaña— y entonces se muestra el mensaje que manda la API, sin reescribirlo.
 */
import { useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import {
  CerrarCajon, Cajon, ContenidoCajon
} from '@/componentes/superposiciones/Cajon'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { ESCALONES, esEscalon } from '@/dominio/escalon'
import { colorDeArea, jefesElegibles } from '@/dominio/organigrama'
import type { Escalon } from '@/dominio/escalon'
import type {
  AreaDelOrganigrama, CambioDeJefatura, PersonaDelOrganigrama
} from '@/datos/organigrama'

/**
 * El valor de "ninguno" en los dos selectores.
 *
 * Radix no acepta una opción con `value=""` —la cadena vacía es cómo borra la selección—, así que el
 * "sin jefe" y el "sin área" necesitan una clave propia que después se traduce a `null`.
 */
const NINGUNO = 'ninguno'

interface PropsPanel {
  persona: PersonaDelOrganigrama
  personas: PersonaDelOrganigrama[]
  areas: AreaDelOrganigrama[]
  /** `false` deja el panel de sólo lectura: sirve para consultar de quién cuelga alguien. */
  editable: boolean
  guardando: boolean
  /** El mensaje que devolvió la API en el último intento fallido, o `null`. */
  error: string | null
  onCerrar: () => void
  onGuardar: (cambio: CambioDeJefatura) => void
}

/**
 * Dibuja el panel de una persona.
 *
 * @param props la persona elegida, los catálogos y el estado de la escritura en curso
 */
export function PanelDePersona (
  { persona, personas, areas, editable, guardando, error, onCerrar, onGuardar }: PropsPanel
) {
  // No hay efecto que resincronice el formulario al cambiar de persona: quien monta este panel le
  // pasa `key={staffid}`, así que abrir a otra persona lo remonta con sus valores ya puestos. Copiar
  // los tres campos en un efecto habría pintado una vez con los datos de la anterior.
  const [escalon, setEscalon] = useState<Escalon>(persona.escalon)
  const [jefe, setJefe] = useState(claveDe(persona.jefe_staffid))
  const [area, setArea] = useState(claveDe(persona.area_id))

  const candidatos = jefesElegibles(personas, persona.staffid)
  const cambio = diferencia(persona, { escalon, jefe, area })
  const hayCambios = Object.keys(cambio).length > 0

  return (
    <Cajon open onOpenChange={(abierto) => { if (!abierto && !guardando) onCerrar() }}>
      <ContenidoCajon
        titulo={persona.nombre}
        descripcion={editable
          ? 'Cambia su escalón, de quién cuelga y qué área lleva puesta.'
          : 'De quién cuelga y qué área lleva puesta.'}
      >
        <div className="flex flex-col gap-5">
          <header className="flex items-center gap-3">
            <Avatar nombre={persona.nombre} imagen={persona.avatar} tamano="grande" />
            <div className="min-w-0">
              <p className="text-texto-tenue truncate text-sm">{persona.correo}</p>
              <p className="text-texto-sutil mt-0.5 flex items-center gap-1.5 text-xs">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: colorDeArea(persona.area_id) }}
                />
                {nombreDeArea(areas, persona.area_id)}
              </p>
            </div>
          </header>

          <Campo etiqueta="Escalón" ayuda="Nombra el puesto. No reparte permisos: eso lo da el árbol.">
            {(props) => (
              <Selector
                value={escalon}
                disabled={!editable || guardando}
                onValueChange={(valor) => { if (esEscalon(valor)) setEscalon(valor) }}
              >
                <DisparadorSelector marcador="Elige un escalón" {...props} />
                <ContenidoSelector>
                  {ESCALONES.map((uno) => <Opcion key={uno.clave} value={uno.clave}>{uno.nombre}</Opcion>)}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>

          <Campo
            etiqueta="Depende de"
            ayuda="No aparece quien cuelga de esta persona: sería un ciclo y la API lo rechaza."
          >
            {(props) => (
              <Selector value={jefe} disabled={!editable || guardando} onValueChange={setJefe}>
                <DisparadorSelector marcador="Elige un jefe" {...props} />
                <ContenidoSelector>
                  <Opcion value={NINGUNO}>Sin jefe — no cuelga de nadie</Opcion>
                  {candidatos.map((uno) => (
                    <Opcion key={uno.staffid} value={String(uno.staffid)}>
                      {uno.nombre} · {nombreDeArea(areas, uno.area_id)}
                    </Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>

          <Campo etiqueta="Área" ayuda="Decide el color de su caja y en qué tarjeta del mapa se cuenta.">
            {(props) => (
              <Selector value={area} disabled={!editable || guardando} onValueChange={setArea}>
                <DisparadorSelector marcador="Elige un área" {...props} />
                <ContenidoSelector>
                  <Opcion value={NINGUNO}>Sin área</Opcion>
                  {areas.map((una) => (
                    <Opcion key={una.id} value={String(una.id)}>{una.nombre}</Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>

          {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

          {editable && (
            <footer className="flex items-center justify-end gap-2">
              <CerrarCajon asChild>
                <Boton variante="sutil" disabled={guardando}>Cancelar</Boton>
              </CerrarCajon>
              <Boton
                variante="primario"
                cargando={guardando}
                disabled={!hayCambios}
                onClick={() => onGuardar(cambio)}
              >
                Guardar
              </Boton>
            </footer>
          )}
        </div>
      </ContenidoCajon>
    </Cajon>
  )
}

/** La clave que usa un selector para un id que puede no existir. */
function claveDe (id: number | null): string {
  return id === null ? NINGUNO : String(id)
}

/** El id que representa una clave de selector. */
function idDe (clave: string): number | null {
  return clave === NINGUNO ? null : Number(clave)
}

/** El nombre de un área, o la palabra que ocupa su lugar cuando no hay ninguna. */
function nombreDeArea (areas: AreaDelOrganigrama[], id: number | null): string {
  if (id === null) return 'Sin área'

  return areas.find((una) => una.id === id)?.nombre ?? `Área #${id}`
}

/**
 * Sólo lo que cambió respecto de lo guardado.
 *
 * Mandar las tres claves siempre dispararía guards de la API sin motivo —cambiarse el escalón a uno
 * mismo, por ejemplo, responde 409— y haría fallar una edición que no tocó ese campo.
 *
 * @param persona la fila tal como está guardada
 * @param formulario lo que hay puesto en el panel
 * @returns el cuerpo del `PUT`, vacío si no hay nada que escribir
 */
function diferencia (
  persona: PersonaDelOrganigrama,
  formulario: { escalon: Escalon, jefe: string, area: string }
): CambioDeJefatura {
  const cambio: CambioDeJefatura = {}
  const jefe = idDe(formulario.jefe)
  const area = idDe(formulario.area)

  if (formulario.escalon !== persona.escalon) cambio.escalon = formulario.escalon
  if (jefe !== persona.jefe_staffid) cambio.jefe_staffid = jefe
  if (area !== persona.area_id) cambio.area_id = area

  return cambio
}
