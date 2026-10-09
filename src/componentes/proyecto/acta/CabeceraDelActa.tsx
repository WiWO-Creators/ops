'use client'

import type { ReactElement } from 'react'
import { Languages, Lock, LockOpen } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenu,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { TEMAS, temaDeMarca, type CodigoDeMarca } from '@/dominio/marcas-acta'
import { IDIOMAS_EN_ORDEN, type CodigoDeIdioma, type IdiomaDelActa } from '@/dominio/idiomas-acta'
import type { Acta } from '@/datos/recursos'

interface PropsCabecera {
  acta: Acta
  tituloActivo: string
  infoIdioma: IdiomaDelActa
  idioma: CodigoDeIdioma
  /** Si lo que se ve es una traduccion y no el original. */
  esTraduccion: boolean
  yaTraducidos: string[]
  editando: boolean
  puedeEditar: boolean
  puedeTraducir: boolean
  /** Marcar o quitar «privado»: solo superadmins. */
  puedeMarcarPrivada: boolean
  cambiandoMarca: boolean
  cambiandoPrivacidad: boolean
  cambiandoIdioma: boolean
  onCambiarMarca: (codigo: CodigoDeMarca) => void
  onCambiarPrivacidad: () => void
  onElegirIdioma: (codigo: CodigoDeIdioma) => void
  onVolverATraducir: () => void
}

/**
 * El encabezado del Meeting Paper: su titulo, de quien es y los dos ejes del documento que se
 * eligen desde aca, el estilo y el idioma.
 */
export function CabeceraDelActa ({
  acta,
  tituloActivo,
  infoIdioma,
  idioma,
  esTraduccion,
  yaTraducidos,
  editando,
  puedeEditar,
  puedeTraducir,
  puedeMarcarPrivada,
  cambiandoMarca,
  cambiandoPrivacidad,
  cambiandoIdioma,
  onCambiarMarca,
  onCambiarPrivacidad,
  onElegirIdioma,
  onVolverATraducir
}: PropsCabecera): ReactElement {
  return (
    <header className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-texto text-lg font-semibold" lang={infoIdioma.etiquetaHtml}>
          {tituloActivo}
        </h2>
        {acta.private === true && (
          <Insignia tono="neutro" tamano="chico">Privado</Insignia>
        )}
        {acta.source === 'ia' && (
          <Insignia tono="acento" tamano="chico">Escrito con IA</Insignia>
        )}
        {/* Solo cuando NO es el original: una insignia "Español" en todas las actas de siempre
            seria ruido en la pantalla mas leida del panel. La que se ve dice que lo que hay
            debajo no es lo que el equipo escribio, que es justo lo que hay que saber. */}
        {esTraduccion && (
          <Insignia tono="neutro" tamano="chico">
            Traducido · {infoIdioma.propio}
          </Insignia>
        )}
      </div>
      <p className="text-texto-tenue text-sm">
        {acta.client === '' ? 'Sin cliente' : acta.client}
        {acta.meeting_date !== null && <> · <Fecha valor={acta.meeting_date} /></>}
        {acta.author !== null && <> · {acta.author.full_name}</>}
      </p>
      {acta.attendees.length > 0 && (
        <p className="text-texto-sutil text-xs">Asistentes: {acta.attendees.join(', ')}</p>
      )}

      {/* El estilo se cambia desde acá y no desde el formulario de creación porque el acta se
          escribe antes de saber quién la firma: una reunión que arrancó siendo de WiWO puede
          terminar facturándose por MGC, y rehacer el documento por eso no tiene sentido. */}
      <div className="-ml-3 flex flex-wrap items-center gap-1">
        {puedeEditar && !editando && (
          <SelectorDeEstilo marca={acta.brand} cambiando={cambiandoMarca} onCambiar={onCambiarMarca} />
        )}

        {puedeMarcarPrivada && !editando && (
          <Boton variante="sutil" tamano="chico" cargando={cambiandoPrivacidad} onClick={onCambiarPrivacidad}>
            {acta.private === true
              ? <LockOpen size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
              : <Lock size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />}
            {acta.private === true ? 'Quitar privado' : 'Hacer privado'}
          </Boton>
        )}

        {/* El idioma NO cuelga de `puedeEditar`: leer el acta en el idioma del cliente es
            lectura, y el cliente monta esta misma pantalla. Lo que si cuelga de los permisos es
            cada opcion —ver `elegirIdioma`—: al cliente solo le aparecen los idiomas que alguien
            del equipo ya pidio.

            Se esconde mientras se corrige, igual que el estilo: cambiar de idioma con el editor
            abierto tiraria lo que se esta escribiendo. */}
        {!editando && (
          <SelectorDeIdioma
            infoIdioma={infoIdioma}
            idioma={idioma}
            esTraduccion={esTraduccion}
            yaTraducidos={yaTraducidos}
            puedeTraducir={puedeTraducir}
            cambiando={cambiandoIdioma}
            onElegir={onElegirIdioma}
            onVolverATraducir={onVolverATraducir}
          />
        )}
      </div>
    </header>
  )
}

/** El menu de la marca que firma el acta. */
function SelectorDeEstilo ({ marca, cambiando, onCambiar }: {
  marca: string
  cambiando: boolean
  onCambiar: (codigo: CodigoDeMarca) => void
}): ReactElement {
  return (
    <MenuContextual>
      <DisparadorMenu asChild>
        <Boton variante="sutil" tamano="chico" cargando={cambiando}>
          Estilo: {temaDeMarca(marca).nombre}
        </Boton>
      </DisparadorMenu>
      <ContenidoMenu align="start">
        {Object.values(TEMAS).map((tema) => (
          <ItemMenu key={tema.codigo} onSelect={() => { onCambiar(tema.codigo) }}>
            {tema.nombre}{tema.codigo === marca ? ' ·' : ''}
          </ItemMenu>
        ))}
      </ContenidoMenu>
    </MenuContextual>
  )
}

/** El menu del idioma en el que se lee el acta, con la opcion de pedir una traduccion nueva. */
function SelectorDeIdioma ({
  infoIdioma,
  idioma,
  esTraduccion,
  yaTraducidos,
  puedeTraducir,
  cambiando,
  onElegir,
  onVolverATraducir
}: {
  infoIdioma: IdiomaDelActa
  idioma: CodigoDeIdioma
  esTraduccion: boolean
  yaTraducidos: string[]
  puedeTraducir: boolean
  cambiando: boolean
  onElegir: (codigo: CodigoDeIdioma) => void
  onVolverATraducir: () => void
}): ReactElement {
  return (
    <MenuContextual>
      <DisparadorMenu asChild>
        <Boton variante="sutil" tamano="chico" cargando={cambiando}>
          <Languages size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
          {infoIdioma.propio}
        </Boton>
      </DisparadorMenu>
      <ContenidoMenu align="start">
        {IDIOMAS_EN_ORDEN
          // Un idioma que no existe y que este sujeto no puede pedir no se dibuja: una
          // opcion que solo sirve para mostrar un error no es una opcion.
          .filter((opcion) => (
            opcion.esOriginal || puedeTraducir || yaTraducidos.includes(opcion.codigo)
          ))
          .map((opcion) => (
            <ItemMenu key={opcion.codigo} onSelect={() => { onElegir(opcion.codigo) }}>
              {opcion.nombre}
              {opcion.esOriginal || yaTraducidos.includes(opcion.codigo)
                ? ''
                : ' — traducir'}
              {opcion.codigo === idioma ? ' ·' : ''}
            </ItemMenu>
          ))}
        {esTraduccion && puedeTraducir && (
          <ItemMenu onSelect={onVolverATraducir}>
            Volver a traducir al {infoIdioma.nombre.toLowerCase()}
          </ItemMenu>
        )}
      </ContenidoMenu>
    </MenuContextual>
  )
}
