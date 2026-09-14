/**
 * Las empresas del holding: cual de las sociedades del grupo presenta el trabajo.
 *
 * Vive acá y no dentro del formulario que lo usa porque **es una constante de negocio**, no un
 * detalle de una pantalla: el dia que entre una cuarta sociedad, o que una cambie de nombre, la
 * edicion tiene que ser este archivo y no una cacería por los formularios que la ofrecen.
 *
 * **No confundir con `MARCAS` de `definiciones/actas.ts`.** Aquello es otra pregunta: con que marca
 * comercial se rotula un Meeting Paper (MGC, Wiwo, Palta), y sus codigos son los que acepta
 * `POST /projects/{id}/actas`. Que MGC aparezca en las dos listas es una coincidencia de nombre, no
 * un catalogo repartido: fusionarlas mandaria `hl` a una ruta que no lo conoce.
 */

/** Una empresa del holding. La forma es la de `OpcionCampo` y `OpcionFiltro`, para que entre en los dos. */
export interface EmpresaDelHolding {
  /** Codigo estable. Es lo que viaja a la API; no se traduce ni se muestra. */
  valor: string
  /** Nombre visible. Es lo unico que se lee en pantalla. */
  etiqueta: string
}

/**
 * Las tres sociedades del holding, en el orden en que el equipo las nombra.
 *
 * Los codigos van en minuscula y sin tildes —son claves, no texto— por la misma razon que los de
 * `ESTADOS_DE_LICITACION`: un valor con acento viaja distinto segun quien lo serialice.
 */
export const EMPRESAS_DEL_HOLDING: EmpresaDelHolding[] = [
  { valor: 'mgc', etiqueta: 'MGC' },
  { valor: 'hl', etiqueta: 'HL' },
  { valor: 'pacifico', etiqueta: 'Pacífico' }
]
