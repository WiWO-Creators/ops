import type { DefinicionRecurso } from './tipos.ts'
import type { PlantillaHito } from '../datos/recursos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { formatearFecha } from '../lib/fechas.ts'

/**
 * Definicion del recurso Plantillas de Hito.
 *
 * `ordenables` y `ordenPorDefecto` van **vacios** a proposito, y no por olvido:
 * `GET /hito-plantillas` devuelve la lista entera ordenada por nombre, sin paginar y sin aceptar
 * `sort` ni `include`. Declarar cualquiera de esas cosas haria que `construirConsulta` mandara
 * parametros que el endpoint no ofrece.
 *
 * Los filtros si existen —son los cuatro de `RecursoPlantillasHito::listar()`— y la busqueda
 * tambien, contra nombre y descripcion.
 *
 * Fuente: `modules/api/Recursos/RecursoPlantillasHito.php`.
 */
/**
 * Clave con la que la pantalla entrega el equipo en `opcionesDeFiltro`.
 *
 * No es un catalogo de `/lookups`: es la lista de personas asignables, que la pagina ya resuelve en
 * el servidor. Se nombra aca para que la definicion y la pantalla no puedan desincronizarse.
 */
export const CATALOGO_AUTORES = 'autores_de_plantilla'

export const PLANTILLAS_HITO: DefinicionRecurso<PlantillaHito> = {
  ruta: 'hito-plantillas',
  titulo: { singular: 'Plantilla', plural: 'Plantillas' },

  columnas: [
    { clave: 'name', encabezado: 'Nombre', presentar: (p) => p.name },
    { clave: 'description', encabezado: 'Descripción', presentar: (p) => p.description ?? '' },
    {
      clave: 'date_created',
      encabezado: 'Creada',
      angosta: true,
      presentar: (p) => formatearFecha(p.date_created)
    }
  ],

  /**
   * `created_by` es un `staffid` y por eso viaja como seleccion: la pantalla le pasa el equipo en
   * `opcionesDeFiltro`. Sin esa lista el filtro pediria escribir un numero, que nadie sabe.
   */
  filtros: [
    { clave: 'name', etiqueta: 'Nombre', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'description', etiqueta: 'Descripción', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'created_by', etiqueta: 'Creada por', tipo: 'seleccion', desdeLookup: CATALOGO_AUTORES },
    { clave: 'date_created', etiqueta: 'Creada', tipo: 'campo', tipoDato: 'fecha' }
  ],
  ordenables: [],
  // Lista vacia y no una cadena: `estadoInicial` la usa tal cual, y cualquier campo suelto acabaria
  // en un `sort` que el endpoint no declara.
  ordenPorDefecto: [],
  busqueda: true,
  includes: []
}

/** Nombre visible de la pantalla: "Plantillas de Hito", con el glosario mandando. */
export const TITULO_PLANTILLAS_HITO = `${PLANTILLAS_HITO.titulo.plural} de ${GLOSARIO.hito.singular}`
