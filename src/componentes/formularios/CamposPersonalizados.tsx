'use client'

import type { ReactElement } from 'react'
import { Campo } from './Campo'
import { AreaTexto, CLASES_CASILLA, Entrada } from './Entrada'
import {
  CLASES_DISPARADOR,
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from './Selector'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenuMarcable,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import {
  alternarOpcion,
  esMultiple,
  esValorEnlace,
  enlaceConApodo,
  LARGO_APODO_ENLACE,
  type ErroresDeCampos,
  type ValorDeCampo,
  type ValoresDeCampos
} from '@/dominio/campos-personalizados'
import { cn } from '@/lib/clases'
import type { DefinicionCampoPersonalizado } from '@/datos/recursos'

/**
 * Renderizador generico de campos personalizados.
 *
 * Un control por `type`, no un campo escrito a mano: el catalogo se administra desde el panel y hoy
 * tiene 29 definiciones, asi que la que agreguen mañana tiene que aparecer sin tocar este archivo.
 * Lo que no reconoce se pinta como texto llano, que es exactamente lo que hace el backend con un
 * tipo que no conoce (`CampoPersonalizado::valorParaGuardar()`, rama `default`).
 *
 * Solo dibuja: el orden, la validacion y la traduccion al cuerpo del `PATCH` viven en
 * `src/dominio/campos-personalizados.ts`, que es lo unico que se puede probar sin navegador.
 *
 * `only_admin` no se mira aca: el listado de definiciones ya viene filtrado por el backend.
 */

interface PropsCamposPersonalizados {
  /** Las definiciones ya ordenadas (`camposOrdenados`). */
  definiciones: DefinicionCampoPersonalizado[]
  valores: ValoresDeCampos
  /** Errores por id de campo, tal como los devuelve `esquemaDeCamposPersonalizados().validar()`. */
  errores: ErroresDeCampos
  onCambiar: (valores: ValoresDeCampos) => void
  deshabilitado?: boolean
}

export function CamposPersonalizados ({
  definiciones,
  valores,
  errores,
  onCambiar,
  deshabilitado = false
}: PropsCamposPersonalizados): ReactElement | null {
  if (definiciones.length === 0) return null

  /** Reemplaza el valor de un campo dejando el resto del formulario intacto. */
  function cambiar (id: number, valor: ValorDeCampo): void {
    onCambiar({ ...valores, [id]: valor })
  }

  return (
    <>
      {definiciones.map((definicion) => (
        <Campo
          key={definicion.id}
          etiqueta={definicion.name}
          ayuda={definicion.type === 'link' ? 'Acepta enlaces de Google Drive, OneDrive o SharePoint. Configura el acceso de los destinatarios en el servicio donde está el archivo.' : undefined}
          requerido={definicion.required}
          error={errores[definicion.id]}
        >
          {(props) => (
            <ControlDeCampo
              definicion={definicion}
              valor={valores[definicion.id] ?? (esMultiple(definicion.type) ? [] : '')}
              deshabilitado={deshabilitado}
              onCambiar={(valor) => cambiar(definicion.id, valor)}
              campo={props}
            />
          )}
        </Campo>
      ))}
    </>
  )
}

/** El `id` y los atributos de accesibilidad que arma `Campo` y que el control tiene que reenviar. */
interface PropsDeCampo {
  id: string
  'aria-describedby': string | undefined
  'aria-invalid': boolean | undefined
  'aria-required': boolean | undefined
}

interface PropsControl {
  definicion: DefinicionCampoPersonalizado
  valor: ValorDeCampo
  deshabilitado: boolean
  onCambiar: (valor: ValorDeCampo) => void
  campo: PropsDeCampo
}

/**
 * Valor del "sin elegir" de un `select` opcional.
 *
 * Radix reserva la cadena vacia para "nada elegido" y no la acepta como valor de una opcion, asi que
 * la ausencia viaja con un centinela y se traduce al salir. Es la misma solucion que usa el selector
 * de hito en `EdicionTarea`.
 */
const SIN_VALOR = 'ninguno'

/** Color con el que arranca un `colorpicker` vacio; el control nativo no admite "sin valor". */
const COLOR_INICIAL = '#000000'

/**
 * El control que le corresponde a un campo segun su `type`.
 *
 * Se reparte en un `switch` y no en un mapa de componentes porque cada rama son dos o tres lineas y
 * un mapa obligaria a un componente por tipo para diez tipos que no se reusan en ningun otro lado.
 */
function ControlDeCampo ({
  definicion,
  valor,
  deshabilitado,
  onCambiar,
  campo
}: PropsControl): ReactElement {
  if (esMultiple(definicion.type)) {
    const elegidas = Array.isArray(valor) ? valor : []
    const alternar = (opcion: string): void => onCambiar(alternarOpcion(definicion, elegidas, opcion))

    return definicion.type === 'checkbox'
      ? (
        <CasillasDeOpciones
          definicion={definicion}
          elegidas={elegidas}
          deshabilitado={deshabilitado}
          onAlternar={alternar}
          campo={campo}
        />
        )
      : (
        <MenuDeOpciones
          definicion={definicion}
          elegidas={elegidas}
          deshabilitado={deshabilitado}
          onAlternar={alternar}
          campo={campo}
        />
        )
  }

  if (definicion.type === 'link') {
    const enlace = esValorEnlace(valor) ? valor : enlaceConApodo(Array.isArray(valor) ? valor.join(', ') : valor)
    return (
      <div className="flex min-w-0 flex-col gap-3">
        <Entrada
          {...campo}
          type="url"
          placeholder="https://…"
          value={enlace.url}
          disabled={deshabilitado}
          onChange={(evento) => onCambiar({ ...enlace, url: evento.target.value })}
        />
        <Campo etiqueta="Nombre del enlace" ayuda="Se mostrará en el tablero en lugar de la URL.">
          {(props) => <Entrada
            {...props}
            name={`apodo_link-${definicion.id}`}
            placeholder="Carpeta del proyecto"
            maxLength={LARGO_APODO_ENLACE}
            value={enlace.apodo_link}
            disabled={deshabilitado}
            onChange={(evento) => onCambiar({ ...enlace, apodo_link: evento.target.value })}
          />}
        </Campo>
      </div>
    )
  }

  const texto = typeof valor === 'string' ? valor : Array.isArray(valor) ? valor.join(', ') : ''

  switch (definicion.type) {
    case 'select':
      return (
        <Selector
          value={texto === '' ? SIN_VALOR : texto}
          onValueChange={(elegido) => onCambiar(elegido === SIN_VALOR ? '' : elegido)}
          disabled={deshabilitado}
        >
          <DisparadorSelector marcador="Elige una" {...campo} />
          <ContenidoSelector>
            {/* El "sin elegir" solo esta si el campo se puede dejar vacio: ofrecerlo en uno
                obligatorio seria ofrecer un valor que la API va a rechazar. */}
            {!definicion.required && <Opcion value={SIN_VALOR}>Sin elegir</Opcion>}
            {(definicion.options ?? []).map((opcion) => (
              <Opcion key={opcion} value={opcion}>{opcion}</Opcion>
            ))}
          </ContenidoSelector>
        </Selector>
      )

    case 'textarea':
      return (
        <AreaTexto
          value={texto}
          disabled={deshabilitado}
          onChange={(evento) => onCambiar(evento.target.value)}
          {...campo}
        />
      )

    case 'colorpicker':
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={texto === '' ? COLOR_INICIAL : texto}
            disabled={deshabilitado}
            className="border-control-borde rounded-chico h-9 w-14 shrink-0 cursor-pointer border bg-transparent"
            onChange={(evento) => onCambiar(evento.target.value)}
            {...campo}
          />
          <span data-numerico className="text-texto-sutil text-xs">
            {texto === '' ? 'Sin color' : texto}
          </span>
          {texto !== '' && !definicion.required && (
            <button
              type="button"
              className="text-texto-sutil hover:text-texto text-xs underline underline-offset-4"
              disabled={deshabilitado}
              onClick={() => onCambiar('')}
            >
              Quitar
            </button>
          )}
        </div>
      )

    default:
      return (
        <Entrada
          type={TIPO_DE_ENTRADA[definicion.type] ?? 'text'}
          inputMode={definicion.type === 'number' ? 'decimal' : undefined}
          placeholder={definicion.type === 'link' ? 'https://…' : undefined}
          value={texto}
          disabled={deshabilitado}
          onChange={(evento) => onCambiar(evento.target.value)}
          {...campo}
        />
      )
  }
}

/**
 * El `type` nativo de cada tipo de campo que se resuelve con un `<input>`.
 *
 * Se usa el control nativo del navegador —fecha, hora, url, numero— en vez de una libreria: ya trae
 * teclado, formato local y validacion de forma, y ninguno de los tres se reimplementa mejor.
 */
const TIPO_DE_ENTRADA: Record<string, string> = {
  number: 'number',
  link: 'url',
  date_picker: 'date',
  date_picker_time: 'datetime-local'
}

interface PropsOpciones {
  definicion: DefinicionCampoPersonalizado
  elegidas: string[]
  deshabilitado: boolean
  onAlternar: (opcion: string) => void
  campo: PropsDeCampo
}

/**
 * Un `multiselect`: desplegable con marcas.
 *
 * Sobre `MenuContextual` y no sobre `Selector`, que solo admite un valor. Es el mismo control con el
 * que ya se eligen etiquetas en la edicion de una Tarea, y el que hace falta para "Area de la
 * compañía": 16 opciones y tareas con dos o tres a la vez.
 */
function MenuDeOpciones ({
  definicion,
  elegidas,
  deshabilitado,
  onAlternar,
  campo
}: PropsOpciones): ReactElement {
  const opciones = definicion.options ?? []

  return (
    <MenuContextual>
      <DisparadorMenu
        disabled={deshabilitado}
        className={cn(CLASES_DISPARADOR, elegidas.length === 0 && 'text-texto-sutil')}
        {...campo}
      >
        <span className="truncate">
          {elegidas.length === 0 ? 'Elegir opciones' : elegidas.join(', ')}
        </span>
      </DisparadorMenu>

      <ContenidoMenu align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        <div className="max-h-64 overflow-y-auto">
          {opciones.length === 0
            ? <p className="text-texto-sutil px-2.5 py-3 text-center text-xs">Este campo no tiene opciones.</p>
            : opciones.map((opcion) => (
              <ItemMenuMarcable
                key={opcion}
                checked={elegidas.includes(opcion)}
                onCheckedChange={() => onAlternar(opcion)}
              >
                {opcion}
              </ItemMenuMarcable>
              ))}
        </div>
      </ContenidoMenu>
    </MenuContextual>
  )
}

/**
 * Un `checkbox`: las opciones a la vista, sin desplegar.
 *
 * Perfex llama `checkbox` a un grupo de opciones, no a un si/no. Se pintan todas porque estos campos
 * tienen pocas opciones —si tuvieran muchas, el catalogo las habria declarado `multiselect`— y verlas
 * sin abrir nada es la diferencia entre marcar dos y buscarlas.
 */
function CasillasDeOpciones ({
  definicion,
  elegidas,
  deshabilitado,
  onAlternar,
  campo
}: PropsOpciones): ReactElement {
  const opciones = definicion.options ?? []

  if (opciones.length === 0) {
    return <p className="text-texto-sutil text-xs">Este campo no tiene opciones.</p>
  }

  return (
    <div id={campo.id} className="flex flex-col gap-1.5">
      {opciones.map((opcion) => (
        <label key={opcion} className="text-texto flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className={CLASES_CASILLA}
            checked={elegidas.includes(opcion)}
            disabled={deshabilitado}
            onChange={() => onAlternar(opcion)}
          />
          {opcion}
        </label>
      ))}
    </div>
  )
}
