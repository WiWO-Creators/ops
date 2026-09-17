/**
 * La logica de la pantalla de area: que escenas hay, en que orden, cuanto dura cada una y que hacer
 * cuando los datos se ponen viejos.
 *
 * Todo aca es puro: entra el paquete de la API y los parametros de la URL, sale una lista. No hay un
 * solo `window`, `document` ni `Date.now()` implicito. Es a proposito — esta es la parte del modulo
 * que se puede romper de formas que nadie nota mirando la pantalla (una escena que desaparece y
 * reinicia la rotacion, un paginado que esconde gente sin decirlo), y eso se prueba con
 * `node --test`, no abriendo un navegador.
 *
 * Se llama `pantalla-area` y no `pantalla` porque `src/dominio/pantalla.ts` ya existe y es otra cosa:
 * normaliza el pathname para el latido de presencia.
 */
import type { FranjaDelDia } from './momento-del-dia.ts'
import type { EscenaDeApi, EscenaTrabajandoDeApi, PaqueteDePantalla } from '@/datos/pantalla-area'

/**
 * Los tipos de escena que la pantalla sabe dibujar, en el orden en que se muestran.
 *
 * **Es el mismo orden que `Escritura\Pantallas::ESCENAS` de la API**, que es el que reciben las
 * pantallas nuevas. No gobierna la vuelta —el orden real lo manda el paquete, que es lo que se
 * configura en el panel— pero si gobierna `proximaEscenaViva()`: a donde salta la pantalla cuando la
 * escena que estaba viendo desaparece. Con las dos listas desalineadas, esa recuperacion saltaria
 * hacia atras.
 *
 * Una clase que llegue y no este aca se ignora en silencio (`esClaseConocida`). Es lo que permite que
 * la API estrene una escena antes que el televisor sin romper ninguna pared: la pantalla vieja la
 * saltea y sigue rotando.
 */
export const CLASES_DE_ESCENA = [
  'portada', 'trabajando', 'cronometros', 'procesos', 'espacios', 'momento', 'anuncios'
] as const

export type ClaseDeEscena = typeof CLASES_DE_ESCENA[number]

/** Como esta puesto el televisor. Lo decide su proporcion, no una configuracion. */
export type Orientacion = 'horizontal' | 'vertical'

/**
 * Cuantas filas entran por escena, segun como este puesto el televisor.
 *
 * === DE DONDE SALEN ESTOS NUMEROS ===
 *
 * No son elegidos por gusto: salen de medir contra el navegador, escena por escena y orientacion por
 * orientacion. La banda util —lo que queda del alto tras la cabecera de escena, el rotulo de columnas
 * y el pie— mide **819 px en horizontal** (1920x1080) y **1616 px en vertical** (1080x1920). La fila
 * del tablero mide **50 px** en Tareas y Proyectos y **52 px** en las dos escenas de personas, que
 * llevan avatar.
 *
 * De ahi salen los techos: 16 filas de Tareas o de Proyectos y 15 de personas en horizontal, 32 y 31
 * en vertical. Lo escrito abajo se queda por debajo de esos techos —una fila menos donde la division
 * daba justo, y en `trabajando` una fila menos por columna— para que la pared no dependa de que la
 * ultima fila entre por dos pixeles.
 *
 * === POR QUE ENTRAN TRES VECES MAS QUE ANTES ===
 *
 * La version anterior de estas escenas eran fichas: borde, redondeo, dos lineas de texto y 2vmin de
 * aire entre una y la siguiente. Entraban cinco Tareas. Lo que se recupero al convertirlas en filas
 * de tablero NO es cuerpo de letra —el nombre de la Tarea bajo de 3.2 a 3vmin, un 6%— sino todo lo
 * demas: la segunda linea paso a ser dos columnas, el aire entre fichas paso a ser una raya de un
 * pixel, y el "+N más" del pie se mudo al titulo. Ver `EscenaProcesos` y `pantalla.css`.
 *
 * El piso de legibilidad no se movio y no se puede mover: el nombre va en 3vmin —32 px a 1080p, que
 * en un televisor de 65" son los 2 cm de altura de mayuscula que se leen a cuatro metros— y ningun
 * texto de la pantalla baja de 2.7vmin. `pruebas/pantalla-area.browser.mjs` mide las dos cosas: que
 * ninguna fila se salga del marco y que no aparezca texto por debajo de 28 px. No hay forma de que un
 * desborde pase inadvertido —`overflow: hidden` no produce barra de scroll, solo corta— ni de
 * resolverlo achicando la letra.
 *
 * === POR QUE VERTICAL LLEVA EL DOBLE, Y NO MAS ===
 *
 * `vmin` es el mismo en las dos orientaciones —el lado corto siempre mide 1080— asi que la fila mide
 * igual y lo unico que cambia es cuantas caben: el doble de alto, el doble de filas. A cambio, en
 * vertical sobran 78vmin de ancho que no existen, y por eso algunas columnas se caen alli: lo dicen
 * las plantillas `@media (orientation: portrait)` de `pantalla.css`.
 *
 * `trabajando` es la unica escena a dos columnas en horizontal —28 son 14 filas por columna—, porque
 * un nombre de persona cabe en media pared y el de una Tarea no.
 *
 * === LAS DOS QUE NO SON UNA REJILLA ===
 *
 * `momento` y `anuncios` valen 1 en las dos orientaciones, por razones distintas:
 *
 * - **`momento`** no tiene items: su "1" nunca se usa para paginar, porque la escena la arma
 *   `construirGuion` a mano a partir de la franja horaria. Esta aca para que el tipo siga siendo un
 *   `Record` completo y nadie tenga que acordarse de un caso especial.
 * - **`anuncios`** vale 1 de verdad: **un anuncio por pantalla**. Es lo unico que escribio una
 *   persona para que alguien lo lea, muchas veces una foto a sangre, y meter tres en una rejilla seria
 *   convertir tres avisos en tres miniaturas. Con `porPagina` en 1, el paginado que ya existe hace
 *   solo el trabajo: N anuncios son N entradas del guion (`anuncios#1`, `anuncios#2`, …), cada una con
 *   su duracion, y cero anuncios son cero entradas — o sea que la escena sale del guion sin ninguna
 *   regla nueva.
 */
export const REJILLAS: Record<Orientacion, Record<ClaseDeEscena, number>> = {
  horizontal: {
    portada: 1,
    // Dos columnas de 14 filas. Con el tope de 40 jornadas del backend, dos paginas.
    trabajando: 28,
    // Fila de 52 px: el avatar de quien mide es lo mas alto que lleva.
    cronometros: 15,
    procesos: 15,
    espacios: 15,
    momento: 1,
    anuncios: 1
  },
  vertical: {
    portada: 1,
    // Una sola columna: en vertical no hay ancho que partir, y sobra alto.
    trabajando: 30,
    cronometros: 30,
    procesos: 30,
    espacios: 30,
    momento: 1,
    anuncios: 1
  }
}

/**
 * Nunca mas de estas paginas por escena.
 *
 * Cuatro y no tres porque cuatro es exactamente lo que hace falta para que la pared no esconda NADA
 * de lo que la API le manda. Con los topes del backend —40 jornadas, 30 cronometros, 60 Tareas y 24
 * Proyectos— y las rejillas de arriba, las paginas salen 2, 2, 4 y 2 en horizontal y 2, 1, 2 y 1 en
 * vertical. El `ocultos` que alimenta el "+N más" del titulo sigue existiendo y sigue siendo cierto:
 * es lo que el area tiene de mas alla de lo que el backend manda, no lo que la pantalla decidio no
 * mostrar.
 *
 * === LA VUELTA COMPLETA ===
 *
 * A 10 segundos por escena de lista y 6 la portada (`SEGUNDOS_POR_DEFECTO` en `pantallas-panel.ts`):
 *
 * - Un area grande en horizontal: 1 + 2 + 2 + 4 + 2 = 11 escenas -> **1 min 46 s**, y en esa vuelta
 *   se ven las 40 personas, los 30 cronometros, las 60 Tareas y los 24 Proyectos.
 * - La misma area en vertical: 7 escenas -> **1 min 06 s**.
 * - Un area normal, con todo en una pagina: 5 escenas -> **46 s**.
 *
 * Antes de este rediseño la misma area grande daba 12 escenas de 20 segundos: **3 min 52 s** para
 * enseñar 36 personas, 15 cronometros, 15 Tareas y 12 Proyectos. Menos de la mitad de tiempo y cuatro
 * veces el contenido.
 *
 * El numero de arriba es el techo, no lo normal: una escena solo llega a cuatro paginas si el area
 * tiene con que llenarlas.
 */
export const TOPE_DE_PAGINAS = 4

/**
 * Como se reparte la banda util de `trabajando` entre sus DOS tablas.
 *
 * === EL PROBLEMA ===
 *
 * `REJILLAS[orientacion].trabajando` dice cuantas filas entran en la escena cuando la escena es UNA
 * tabla: 28 tumbada (dos columnas de 14) y 30 de pie. Con dos tablas apiladas aparecen una cabecera y
 * una fila de rotulos mas, y un aire entre bloques: son ~4vmin + ~4vmin + ~1.6vmin, unos 100 px a
 * 1080p, o sea **dos renglones de tablero**. De los 819 px de banda tumbada quedan ~718, que a 52 px
 * por renglon son 13,8 renglones visuales; de los 1616 de pie quedan ~1515, o sea 29 filas.
 *
 * Tumbada cada renglon visual son DOS personas, porque la escena va a dos columnas: las 24 de la banda
 * son 12 renglones de los 13,8 que caben. De pie son 27 de las 29. En las dos orientaciones sobran casi
 * dos renglones, que es el mismo margen de seguridad con el que se eligieron las rejillas de una tabla:
 * la pared no puede depender de que la ultima fila entre por dos pixeles, porque `overflow: hidden` no
 * avisa, corta.
 *
 * === POR QUE ESTO ES UN NUMERO Y YA NO UN REPARTO FIJO ===
 *
 * Antes eran dos cupos clavados —16 para la compañia y 8 para el area— y el resultado se vio en la
 * pared: con 13 personas en la compañia y 11 en el area, la compañia llenaba sus dos columnas y el
 * area, que dice 11, enseñaba 3. Las otras 8 estaban en una segunda pagina que nadie relaciona con la
 * primera, y el bloque del area quedaba como un hueco enorme debajo. La cabecera decia un numero y la
 * tabla enseñaba otro: eso no se lee como una pagina 2, se lee como una pantalla rota.
 *
 * El cupo fijo no podia no fallar, porque **el reparto correcto depende de lo que cada lista tiene** y
 * no de una proporcion elegida de antemano. 13 y 11 caben de sobra en la banda; partirlas 16/8 era
 * paginar una lista que entraba entera al lado de un bloque con tres huecos muertos.
 *
 * Asi que lo que se fija es la BANDA —cuantas filas caben con los dos bloques dibujados— y el reparto
 * lo decide `repartoDeTrabajando()` con los dos largos en la mano.
 *
 * === CUANDO HAY UNA SOLA TABLA ===
 *
 * Esto NO se usa: la tabla que queda se lleva la banda entera (`REJILLAS[orientacion].trabajando`),
 * porque sin el segundo bloque los ~100 px vuelven. Es el caso de la pantalla global, que no tiene
 * area, y el del area donde no hay nadie con jornada abierta. Ver `repartoDeTrabajando`.
 */
export const BANDA_DE_TRABAJANDO: Record<Orientacion, number> = {
  horizontal: 24,
  vertical: 27
}

/**
 * Las claves de las dos tablas de `trabajando`, en orden de dibujo.
 *
 * Son datos y no literales sueltos porque entran en tres sitios que tienen que coincidir: el id de la
 * escena (y por tanto la firma del guion), el `key` de React y la busqueda de `tablaDeEscena()`.
 */
export const TABLA_EMPRESA = 'empresa'
export const TABLA_AREA = 'area'

/** La clave de la tabla de las escenas que tienen una sola. */
export const TABLA_UNICA = 'unica'

/**
 * Las escenas que son un tablero de filas, y no una lamina.
 *
 * Lo que las separa de la portada, de `momento` y de `anuncios` es que sus paginas son **la misma
 * vista con otras filas**, no vistas distintas. De ahi sale `continuidad`: entre dos paginas de un
 * tablero el marco no se remonta y solo voltean las filas, mientras que pasar de un anuncio al
 * siguiente si es cambiar de lamina y se funde entero.
 */
const ESCENAS_DE_TABLERO: ReadonlySet<string> = new Set([
  'trabajando', 'cronometros', 'procesos', 'espacios'
])

/**
 * Cada cuantos milisegundos las filas cambian de juego de campos.
 *
 * Seis segundos: lo bastante largo para leer una fila entera de pie y de paso —el ojo tarda un par de
 * segundos en encontrar el renglon que busca—, y lo bastante corto para que quien se para a mirar vea
 * el segundo juego antes de irse. El movimiento en si dura 260 ms, asi que la pantalla esta quieta el
 * 96% del tiempo, que es la condicion para que esto sea legible y no un cartel de neon.
 */
export const PERIODO_DE_DATO_MS = 6000

/**
 * El tope propio de la escena `anuncios`.
 *
 * Con `porPagina` en 1, una pagina es un anuncio, asi que el tope general de cuatro seria "solo se ven
 * cuatro avisos" — y los avisos los publico alguien a mano, para hoy, esperando que se vean. Cuatro es
 * poco; sin tope, en cambio, veinte anuncios de doce segundos son cuatro minutos en los que la pared
 * no enseña una sola Tarea y deja de ser un tablero.
 *
 * Ocho es el punto donde las dos cosas siguen siendo ciertas: 8 x 12 s = 1 min 36 s de anuncios, que
 * en una vuelta con las otras escenas sigue siendo una pared que rota. Lo que pase de ocho se cuenta
 * en `ocultos` y la escena lo dice, igual que las listas: nunca se miente por omision.
 */
export const TOPE_DE_ANUNCIOS = 8

/**
 * Las escenas que son un titulo y no una lista.
 *
 * Duran una fraccion (`PROPORCION_PORTADA`) de lo que dura una escena de lista cuando la duracion no
 * viene de la configuracion: son tres cifras o una frase, se leen de un vistazo, y ocupar veinte
 * segundos con ellas deja la pared quieta. La configuracion del panel, cuando existe, manda igual.
 */
const ESCENAS_BREVES: ReadonlySet<string> = new Set(['portada', 'momento'])

/**
 * Una tabla dentro de una escena, ya paginada.
 *
 * Es un arreglo y no dos campos sueltos porque `trabajando` tiene dos —la compañia y el area— y el
 * resto tiene una. Con el dia que otra escena necesite un segundo bloque no hay nada que inventar, y
 * mientras tanto las escenas de una tabla leen `tablas[0]` y no se enteran de nada.
 */
export interface TablaDePantalla {
  /** Que tabla es dentro de la escena. Entra en el id, y con el en la firma del guion. */
  clave: string
  /** Los items de ESTA pagina de ESTA tabla. */
  items: unknown[]
  /** Cuantos de esta tabla no se estan viendo, para el "+N mas" de su cabecera. */
  ocultos: number
  /** El conteo real que declara la API, o `null` cuando la escena no lo manda. */
  total: number | null
}

/** Una escena ya resuelta, lista para dibujar. */
export interface Escena {
  /** Identidad estable. Es lo unico de lo que depende la rotacion; ver `firmaDelGuion`. */
  id: string
  clase: ClaseDeEscena
  /**
   * Que tiene que seguir montado al pasar a la escena siguiente.
   *
   * El marco de la escena se dibuja con esto de `key`, no con el `id`. Entre dos paginas de un mismo
   * tablero vale lo mismo —`'trabajando'`— asi que la cabecera, los rotulos de columna y el bloque
   * entero **no se remontan**: no hay fundido de vista, y lo unico que cambia son las filas, que
   * voltean una a una como un panel de aeropuerto. Entre dos anuncios, en cambio, vale el `id`: son
   * dos laminas distintas y ahi el fundido es lo correcto.
   *
   * Sale del dominio y no del componente porque es una decision sobre el guion —que es una pagina y
   * que es una escena nueva— y se prueba sin navegador.
   */
  continuidad: string
  duracionMs: number
  /** Las tablas de ESTA pagina, en orden de dibujo. La portada y `momento` no tienen ninguna. */
  tablas: TablaDePantalla[]
  /** La escena de la API, tal cual, para que el componente lea sus campos propios. */
  origen: EscenaDeApi
}

/** Lo que la URL puede elegir. Nada de esto viaja a la API. */
export interface ParametrosDePantalla {
  /**
   * Segundos por escena, o `null` para respetar lo configurado por area.
   *
   * `null` es el caso normal. Un numero solo llega cuando la URL trae `?escena=`, y entonces pisa la
   * configuracion entera: existe para probar una vuelta rapida y para un televisor que necesite otro
   * ritmo, no para configurar la pantalla — eso se hace en el panel.
   */
  segundosPorEscena: number | null
  segundosDeRefresco: number
  saltar: ClaseDeEscena[]
  solo: ClaseDeEscena | null
  tema: 'oscuro' | 'claro'
  transicion: 'fundido' | 'vista' | 'ninguna'
  zoom: number
  /**
   * Margen extra en los bordes, en `vmin`.
   *
   * Existe por el **overscan**: muchos televisores recortan un 3% de la imagen que les llega por
   * HDMI, y en una pantalla casteada eso se come el reloj de la esquina y el pie. No hay forma de
   * detectarlo desde el navegador —el aparato miente sobre su resolucion— asi que se ajusta a ojo,
   * una vez, mirando la pared.
   */
  margen: number
}

const POR_DEFECTO: ParametrosDePantalla = {
  segundosPorEscena: null,
  segundosDeRefresco: 30,
  saltar: [],
  solo: null,
  tema: 'oscuro',
  transicion: 'fundido',
  zoom: 1,
  margen: 0
}

const LIMITES = {
  escena: { minimo: 5, maximo: 120 },
  // El piso es mas alto que el `LIVE_MINIMO` de 10 s del tablero a proposito: estas pantallas no las
  // mira nadie y pueden ser muchas a la vez, asi que el coste se multiplica sin que nadie lo note.
  refresco: { minimo: 15, maximo: 300 },
  zoom: { minimo: 0.8, maximo: 1.4 },
  // Ocho `vmin` son ~86 px a 1080p: mas que el 3% que recorta el overscan tipico, y el techo a partir
  // del cual la pantalla empieza a desperdiciar mas de lo que salva.
  margen: { minimo: 0, maximo: 8 }
}

/** La portada dura menos que las demas: es un titulo, no una lista que haya que leer. */
const PROPORCION_PORTADA = 0.6

/**
 * Cuanto dura una escena cuando ni la configuracion ni la URL lo dicen.
 *
 * Solo se usa si el backend mando una escena sin `seconds`, que no deberia pasar: es el respaldo para
 * que una respuesta incompleta no deje una escena de cero segundos, o sea un parpadeo.
 */
const SEGUNDOS_DE_RESPALDO = 20

/**
 * Lee los parametros de la URL, acotando en vez de fallar.
 *
 * Un valor mal escrito no puede dejar la pared congelada ni convertirla en un estrobo, asi que todo
 * se recorta a su rango y lo que no se entiende se ignora en silencio. Mismo criterio que
 * `intervaloDeLive()` en `src/datos/live.ts`.
 *
 * Los parametros solo ELIGEN entre valores que este archivo ya conoce. Ninguno transporta datos y
 * ninguno llega a la API: el token es la unica autorizacion y el unico selector.
 */
export function leerParametrosDePantalla (
  crudos: Record<string, string | string[] | undefined>
): ParametrosDePantalla {
  const saltar = listaDeClases(primero(crudos.saltar))
  const solo = unaClase(primero(crudos.solo))

  return {
    segundosPorEscena: acotarOpcional(primero(crudos.escena), LIMITES.escena),
    segundosDeRefresco: acotar(primero(crudos.refresco), POR_DEFECTO.segundosDeRefresco, LIMITES.refresco),
    saltar,
    solo,
    tema: primero(crudos.tema) === 'claro' ? 'claro' : 'oscuro',
    transicion: transicionValida(primero(crudos.transicion)),
    zoom: acotar(primero(crudos.zoom), POR_DEFECTO.zoom, LIMITES.zoom, false),
    margen: acotar(primero(crudos.margen), POR_DEFECTO.margen, LIMITES.margen, false)
  }
}

/**
 * Arma el guion: las escenas que se van a mostrar, ya paginadas y en orden.
 *
 * === LA REGLA DE LO VACIO ===
 *
 * Una escena sin nada que mostrar sale del guion: una pantalla que dice "Ningun cronometro
 * corriendo" durante veinte segundos, cada minuto y medio, todo el dia, es una pantalla que la gente
 * aprende a no mirar.
 *
 * Con una excepcion que no es negociable: **el guion nunca vuelve vacio**. Si no hay absolutamente
 * nada, queda la portada, que es el nombre del area y el reloj. Un area dormida mostrando su nombre y
 * la hora es digna; una pantalla en blanco es un producto roto. Por eso la portada no se puede saltar
 * con `?saltar=` ni quedar fuera por estar vacia.
 *
 * === EL PAGINADO ===
 *
 * Cada pagina es una ENTRADA PROPIA del guion (`trabajando#1`, `trabajando#2`) y no un temporizador
 * anidado dentro de la escena. Es mas simple, alarga la vuelta honestamente cuando el area es grande,
 * y encaja solo con la firma: si el area pasa de una pagina a dos, la firma cambia y la rotacion se
 * entera sin que nadie le avise.
 *
 * Pasado el tope de paginas se corta, y lo que se corto viaja en `ocultos` para que el pie pueda
 * decir "+7 mas". Nunca se miente por omision.
 *
 * === LAS TRES FORMAS DE ENTRAR AL GUION ===
 *
 * Con `momento` la regla de lo vacio dejo de tener dos casos y paso a tener tres. Vale la pena
 * nombrarlos, porque es donde alguien se va a equivocar:
 *
 * 1. **La portada entra siempre.** No tiene items ni puede quedarse sin ellos, y es lo que impide que
 *    el guion vuelva vacio. No se puede saltar ni con `?saltar=`.
 * 2. **Las escenas de lista entran si tienen items** —`trabajando`, `cronometros`, `procesos`,
 *    `espacios` y `anuncios`—. Lo decide `paginar()`, que con cero items devuelve cero paginas.
 *    `anuncios` cae aca sin ninguna regla nueva porque su rejilla es 1: sin avisos vigentes no hay
 *    paginas, y la escena sale sola.
 * 3. **`momento` entra si el reloj lo dice.** No tiene items que contar: lo que decide es la franja
 *    horaria, que llega ya resuelta en el parametro `franja` (ver `franjaDelMomento()` en
 *    `src/dominio/momento-del-dia.ts`). Fuera de sus franjas —o mientras no haya llegado `meta` con la
 *    zona— la escena **no se muestra**, exactamente igual que una lista vacia. Si no fuera asi, la
 *    pantalla gastaria una escena de cada vuelta, todo el dia, en un reloj mudo que ya esta en la
 *    cabecera.
 *
 * La firma se entera de las tres cosas sin ayuda, porque las tres son la presencia o la ausencia de un
 * id. Y el id de `momento` **lleva dentro la clave de la franja** (`momento#apertura`), asi que pasar
 * de "buenos dias" a "hora de almuerzo" tambien cambia la firma: la rotacion reinicia la escena y
 * nadie ve el mensaje anterior congelado en la pared.
 *
 * @param franja la franja horaria vigente, o `null` si no hay ninguna o todavia no se sabe la zona
 */
export function construirGuion (
  paquete: PaqueteDePantalla | null,
  parametros: ParametrosDePantalla,
  orientacion: Orientacion = 'horizontal',
  franja: FranjaDelDia | null = null
): Escena[] {
  if (paquete === null) return []

  const guion: Escena[] = []

  for (const escena of paquete.scenes) {
    if (!esClaseConocida(escena.kind)) continue
    if (parametros.solo !== null && escena.kind !== parametros.solo) continue
    if (parametros.solo === null && parametros.saltar.includes(escena.kind)) continue

    const duracion = duracionDe(escena, parametros)

    if (escena.kind === 'portada') {
      guion.push({
        id: 'portada',
        clase: 'portada',
        continuidad: 'portada',
        duracionMs: duracion,
        tablas: [],
        origen: escena
      })
      continue
    }

    if (escena.kind === 'momento') {
      if (franja === null) continue

      guion.push({
        id: `momento#${franja.clave}`,
        clase: 'momento',
        continuidad: `momento#${franja.clave}`,
        duracionMs: duracion,
        tablas: [],
        origen: escena
      })
      continue
    }

    guion.push(...paginar(escena, duracion, orientacion))
  }

  if (guion.length > 0) return guion

  // Ni una escena encendida con contenido, o un `?solo=` que no dejo nada en pie. La portada suele
  // viajar; si tampoco estuviera, se arma una con los contadores en cero antes que devolver nada.
  return [portadaDeRespaldo(paquete, parametros)]
}

/**
 * Cuanto dura una escena, en milisegundos.
 *
 * **Manda la configuracion del area**, que llega en `seconds`: es la que se edita desde el panel, sin
 * subir a ninguna escalera. El `?escena=` de la URL la pisa, y existe para probar —una vuelta entera
 * a cinco segundos por escena— y para el televisor raro que necesita otro ritmo.
 *
 * Sin ninguno de los dos, la portada dura menos que las demas: es un titulo, no una lista que haya
 * que leer.
 */
function duracionDe (escena: EscenaDeApi, parametros: ParametrosDePantalla): number {
  const breve = ESCENAS_BREVES.has(escena.kind)

  if (parametros.segundosPorEscena !== null) {
    const base = parametros.segundosPorEscena * 1000

    return breve ? Math.round(base * PROPORCION_PORTADA) : base
  }

  if (typeof escena.seconds === 'number' && escena.seconds > 0) {
    return escena.seconds * 1000
  }

  const base = SEGUNDOS_DE_RESPALDO * 1000

  return breve ? Math.round(base * PROPORCION_PORTADA) : base
}

/**
 * La firma del guion: la identidad de la lista, no la de sus datos.
 *
 * === POR QUE EXISTE ===
 *
 * El guion se recalcula en cada render, asi que es un arreglo NUEVO cada vez. Un
 * `useEffect(..., [guion])` se volveria a ejecutar en cada sondeo y reiniciaria el temporizador de la
 * escena actual: la pantalla se quedaria clavada en la primera escena para siempre, y el bug se ve
 * solo si alguien se queda mirando la pared un minuto entero.
 *
 * Con la firma, la rotacion depende de un string. Un sondeo que trae los mismos segundos actualizados
 * produce la misma firma y el efecto no vuelve a correr. Solo cambia cuando aparece o desaparece una
 * escena, que es exactamente cuando la rotacion SI tiene que enterarse.
 */
export function firmaDelGuion (guion: Escena[]): string {
  return guion.map((escena) => escena.id).join('|')
}

/**
 * A que escena saltar cuando la actual desaparecio del guion.
 *
 * Caso real: son las 18:05, la ultima persona cierra su jornada, la escena "trabajando" se vacia y
 * sale. Si la posicion se guardara por indice, todos los indices se correrian y la pantalla saltaria
 * al principio en mitad de una escena.
 *
 * Devuelve el indice de la primera escena que venga DESPUES de la que murio, segun el orden de
 * clases; si no hay ninguna despues, vuelve al principio. Nunca devuelve -1: el guion nunca esta
 * vacio cuando se llama a esto.
 */
export function proximaEscenaViva (guion: Escena[], idAnterior: string): number {
  if (guion.length === 0) return 0

  const claseAnterior = idAnterior.split('#')[0] as ClaseDeEscena
  const posicionAnterior = CLASES_DE_ESCENA.indexOf(claseAnterior)

  if (posicionAnterior < 0) return 0

  const siguiente = guion.findIndex(
    (escena) => CLASES_DE_ESCENA.indexOf(escena.clase) > posicionAnterior
  )

  return siguiente >= 0 ? siguiente : 0
}

/** Que tan al dia estan los datos que se estan mostrando. */
export type Frescura = 'fresco' | 'viejo' | 'sin-conexion'

/**
 * Decide la frescura a partir de la edad del ultimo dato bueno.
 *
 * Tres tramos, y el primero importa tanto como los otros dos: **un solo sondeo fallido no cambia
 * nada**. Un parpadeo de red no puede hacer titilar una pared; la gente que pasa por delante lee el
 * aviso, no el dato, y una pantalla que avisa por cualquier cosa deja de avisar de las que importan.
 *
 * Pasado el tramo 'viejo', la pantalla deja de contar los cronometros: un contador que sigue trepando
 * con la conexion muerta es una mentira, y esta pared la leen jefaturas de area.
 */
export function frescuraDe (edadMs: number, intervaloMs: number): Frescura {
  if (edadMs <= intervaloMs * 3) return 'fresco'
  if (edadMs <= 10 * 60 * 1000) return 'viejo'

  return 'sin-conexion'
}

/**
 * El intervalo de sondeo despues de `fallos` seguidos, con backoff.
 *
 * Se duplica en cada fallo hasta un techo de cinco minutos, y vuelve a la base al primer acierto. Un
 * corte de seis horas con cuarenta televisores no puede convertirse en un martillo contra la API.
 */
export function intervaloConBackoff (baseMs: number, fallos: number): number {
  const TECHO_MS = 5 * 60 * 1000

  if (fallos <= 0) return baseMs

  return Math.min(baseMs * 2 ** Math.min(fallos, 10), TECHO_MS)
}

/**
 * El milisegundo del proximo recargado duro, con dispersion derivada del token.
 *
 * Una pagina que vive meses acumula lo que ningun `clearInterval` limpia: memoria del motor de JS,
 * cache de imagenes, y el despliegue nuevo que nunca va a ver porque nadie recarga. Una recarga
 * diaria de madrugada resuelve las tres.
 *
 * La dispersion no es cosmetica: sin ella, cuarenta televisores recargan en el mismo segundo y le
 * pegan a la API todos juntos. Sale del token para que cada aparato caiga siempre en el mismo
 * momento, y no en uno distinto por recarga.
 *
 * @param ahora  el reloj del navegador, en ms
 * @param token  el de la URL; solo se usa su forma, nunca se manda a ningun lado
 * @param hora   hora local del recargado, 0 a 23
 */
export function proximoRecargado (ahora: number, token: string, hora = 4): number {
  const fecha = new Date(ahora)
  const objetivo = new Date(ahora)

  objetivo.setHours(hora, 0, 0, 0)

  if (objetivo.getTime() <= fecha.getTime()) {
    objetivo.setDate(objetivo.getDate() + 1)
  }

  let suma = 0
  for (let i = 0; i < token.length; i++) suma += token.charCodeAt(i)

  return objetivo.getTime() + (suma % 900) * 1000
}

// -- Piezas -------------------------------------------------------------------------------------

/**
 * Parte una escena con items en tantas paginas como haga falta, hasta el tope.
 *
 * Una escena sin items no devuelve ninguna pagina: es lo que la saca del guion.
 *
 * `trabajando` tiene su propio reparto porque son dos tablas; ver `paginarTrabajando`.
 */
function paginar (escena: EscenaDeApi, duracionMs: number, orientacion: Orientacion): Escena[] {
  if (escena.kind === 'trabajando') return paginarTrabajando(escena, duracionMs, orientacion)

  const items = 'items' in escena ? escena.items : []

  if (items.length === 0) return []

  // A tope y no equilibrado, al reves que en `trabajando`. Una escena de UNA tabla que reparte sus
  // filas parejo llena la mitad de la pared en todas sus paginas; la de dos tablas no puede, porque
  // un bloque corto deja un hueco ENTRE dos bloques y eso si se lee como que la pared se rompio. Ver
  // `filasPorPagina()`.
  const porPagina = REJILLAS[orientacion][escena.kind as ClaseDeEscena]
  // `anuncios` lleva su propio techo: una pagina es un anuncio, y cuatro serian pocos. Ver
  // `TOPE_DE_ANUNCIOS`.
  const tope = escena.kind === 'anuncios' ? TOPE_DE_ANUNCIOS : TOPE_DE_PAGINAS
  const paginas = Math.min(Math.ceil(items.length / porPagina), tope)
  const total = 'total' in escena ? escena.total : null

  const escenas: Escena[] = []

  for (let pagina = 1; pagina <= paginas; pagina++) {
    escenas.push({
      // El `#n` solo aparece cuando hay mas de una pagina: asi un area chica conserva la misma firma
      // aunque le entre o le salga una persona, y la rotacion no se entera de un cambio que no es.
      id: paginas === 1 ? escena.kind : `${escena.kind}#${pagina}`,
      clase: escena.kind as ClaseDeEscena,
      continuidad: continuidadDe(escena.kind as ClaseDeEscena, `${escena.kind}#${pagina}`),
      duracionMs,
      tablas: [rebanada(TABLA_UNICA, items, pagina, porPagina, paginas, total)],
      origen: escena
    })
  }

  return escenas
}

/**
 * Parte `trabajando`, que son DOS tablas en la misma escena: la compañia arriba y el area abajo.
 *
 * === EL REPARTO ===
 *
 * Las dos tablas comparten la banda util de la escena, y el reparto **sale de lo que cada lista
 * tiene**: ver `BANDA_DE_TRABAJANDO` y `repartoDeTrabajando()`. Si solo hay una tabla con gente —la
 * pantalla global, que no tiene area, o un area donde nadie abrio jornada— la que queda se lleva la
 * banda ENTERA, porque sin el segundo bloque vuelven los ~100 px de su cabecera y sus rotulos.
 *
 * === COMO SE PAGINAN DOS LISTAS A LA VEZ ===
 *
 * Cada tabla se pagina por su cuenta con su propia rejilla, y la escena tiene tantas paginas como la
 * que mas necesite. Lo interesante es que pasa cuando una es larga y la otra corta: 40 personas en la
 * compañia son 3 paginas, y 8 en el area son 1.
 *
 * **La tabla corta se queda clavada en su ULTIMA pagina** en vez de desaparecer. Dos razones:
 *
 * 1. Un bloque que se esfuma en la pagina 2 mueve el otro de sitio, y a cuatro metros eso se lee como
 *    que la pantalla se rompio. El marco tiene que quedarse quieto: lo que se mueve son las filas.
 * 2. La tabla del area es la identidad de esta pantalla —es el area cuyo televisor es— y esconderla
 *    dos tercios de la escena para hacerle sitio a la compañia seria justo al reves de lo que la
 *    pared es.
 *
 * Y tiene un efecto util con la animacion: como la tabla corta dibuja las mismas filas con las mismas
 * claves de React, sus filas NO se remontan y no voltean. Solo cascadea la tabla que de verdad cambio.
 *
 * === EL ID, QUE ES DE LO QUE DEPENDE LA ROTACION ===
 *
 * `trabajando#e<paginaEmpresa>a<paginaArea>`, con un `0` donde esa tabla no esta. Tiene que nombrar
 * las dos cosas porque la firma del guion es lo unico que hace rotar la pantalla (`firmaDelGuion`):
 * si el id no cambiara al aparecer o desaparecer una tabla o una pagina, la pared se quedaria clavada;
 * si cambiara porque a alguien le empezo la jornada, saltaria a mitad de escena. El numero de pagina
 * cumple las dos: no se mueve cuando entra o sale una persona que cabe en la pagina que ya habia.
 */
function paginarTrabajando (
  escena: EscenaTrabajandoDeApi & { seconds?: number },
  duracionMs: number,
  orientacion: Orientacion
): Escena[] {
  const delArea = escena.items
  const compania = escena.empresa

  // Lecturas defensivas a proposito: el bloque `empresa` lo estrena el backend, y una pared que se
  // queda en blanco porque la API todavia no desplego es peor que una pared con una sola tabla.
  const deLaCompania: unknown[] = compania?.items ?? []
  const totalCompania: number = compania?.total ?? deLaCompania.length
  const totalArea: number = escena.total ?? delArea.length

  if (delArea.length === 0 && deLaCompania.length === 0) return []

  const reparto = repartoDeTrabajando(orientacion, deLaCompania.length, delArea.length)

  const paginasCompania = cuantasPaginas(deLaCompania.length, reparto.empresa)
  const paginasArea = cuantasPaginas(delArea.length, reparto.area)
  const paginas = Math.max(paginasCompania, paginasArea)

  const escenas: Escena[] = []

  for (let pagina = 1; pagina <= paginas; pagina++) {
    // `min` es lo que clava la tabla corta en su ultima pagina en vez de dejarla caer.
    const enCompania = paginasCompania === 0 ? 0 : Math.min(pagina, paginasCompania)
    const enArea = paginasArea === 0 ? 0 : Math.min(pagina, paginasArea)

    const tablas: TablaDePantalla[] = []

    if (enCompania > 0) {
      tablas.push(rebanada(
        TABLA_EMPRESA, deLaCompania, enCompania, reparto.empresa, paginasCompania, totalCompania
      ))
    }

    if (enArea > 0) {
      tablas.push(rebanada(TABLA_AREA, delArea, enArea, reparto.area, paginasArea, totalArea))
    }

    escenas.push({
      id: idDeTrabajando(enCompania, enArea),
      clase: 'trabajando',
      continuidad: continuidadDe('trabajando', idDeTrabajando(enCompania, enArea)),
      duracionMs,
      tablas,
      origen: escena
    })
  }

  return escenas
}

/**
 * El id de una pagina de `trabajando`: `trabajando#e1a1`, `trabajando#e2a1`, `trabajando#e1a0`…
 *
 * A diferencia del resto de las escenas, esta **nunca** tiene un id pelado. Un `trabajando` a secas no
 * podria decir cual de las dos tablas esta en pantalla, y esa es justo la diferencia de la que la
 * rotacion tiene que enterarse: si el area se queda sin nadie y la escena pasa a ser solo la compañia,
 * la firma tiene que cambiar para que la pantalla vuelva a montar la escena con una tabla menos.
 *
 * @param compania pagina de la tabla de la compañia, o `0` si no esta
 * @param area     pagina de la tabla del area, o `0` si no esta
 */
function idDeTrabajando (compania: number, area: number): string {
  return `trabajando#e${compania}a${area}`
}

/**
 * Cuantas filas le tocan a cada tabla de `trabajando`, segun lo que cada lista TIENE.
 *
 * Con una sola tabla, esa se lleva la banda entera (`REJILLAS[orientacion].trabajando`): el descuento
 * existe para pagar la cabecera y los rotulos del segundo bloque, y sin segundo bloque no hay nada que
 * pagar.
 *
 * === EL REPARTO CUANDO ESTAN LAS DOS ===
 *
 * Son tres lineas y cada una responde a algo que se vio fallar en la pared (ver el docblock de
 * `BANDA_DE_TRABAJANDO`):
 *
 * 1. **El area pide primero**, hasta la mitad de la banda. Es la lista corta —un equipo de ocho o
 *    diez— y es la identidad de esta pantalla: es el area cuyo televisor es. Paginarla para dejarle
 *    sitio a una compañia que iba a paginar igual es cambiar informacion por nada.
 * 2. **La compañia se lleva lo que quede**, y nunca mas de lo que tiene: reservar filas para gente que
 *    no existe es el hueco muerto que el usuario vio.
 * 3. **Lo que la compañia no necesitaba vuelve al area.** Con 5 en la compañia y 20 en el area, el
 *    area se queda con 19 en vez de con 12, y la escena pasa de dos paginas a una.
 *
 * El caso que lo motivo —13 en la compañia y 11 en el area— cae entero en la primera linea: 13 + 11
 * son exactamente las 24 de la banda tumbada, cada tabla enseña su lista completa y no queda ni una
 * fila reservada de mas.
 *
 * @param orientacion como cuelga el televisor, que decide el largo de la banda
 * @param compania    cuantas personas trae la lista de la compañia
 * @param area        cuantas trae la del area
 * @returns las filas por pagina de cada tabla; un `0` es una tabla que no se dibuja
 */
function repartoDeTrabajando (
  orientacion: Orientacion,
  compania: number,
  area: number
): { empresa: number, area: number } {
  const banda = REJILLAS[orientacion].trabajando

  if (area <= 0) return { empresa: filasPorPagina(compania, banda), area: 0 }
  if (compania <= 0) return { empresa: 0, area: filasPorPagina(area, banda) }

  const juntas = BANDA_DE_TRABAJANDO[orientacion]
  const pedidoDelArea = Math.min(area, Math.max(Math.floor(juntas / 2), 1))
  const deLaCompania = Math.min(compania, juntas - pedidoDelArea)

  return {
    empresa: filasPorPagina(compania, deLaCompania),
    area: filasPorPagina(area, Math.min(area, juntas - deLaCompania))
  }
}

/**
 * Cuantas filas pone una pagina para enseñar `cuantos` items con un cupo de `cupo`.
 *
 * === POR QUE NO ES SIMPLEMENTE EL CUPO ===
 *
 * Llenar cada pagina hasta el borde deja toda la sobra en la ULTIMA: 11 personas con cupo 8 son una
 * pagina de 8 y otra de 3, y esa de 3 es la que el usuario leyo como una pantalla rota — un bloque que
 * de repente mide la mitad. Repartiendo a partes iguales entre las paginas que hacen falta, las mismas
 * 11 salen 6 y 5: el bloque mide practicamente lo mismo en las dos y el salto deja de verse.
 *
 * La sobra queda acotada a `paginas - 1` items, que con el tope de cuatro paginas son tres filas en el
 * peor caso y una en el normal.
 *
 * El cupo sigue siendo el techo: es lo que cabe en la banda, y pasarse seria cortar la ultima fila
 * contra un `overflow: hidden` que no avisa.
 *
 * @param cuantos cuantos items hay que enseñar en total
 * @param cupo    cuantos caben como mucho en una pagina
 * @returns las filas por pagina, entre 1 y `cupo`
 */
function filasPorPagina (cuantos: number, cupo: number): number {
  if (cupo <= 0) return 0
  if (cuantos <= cupo) return Math.max(cuantos, 1)

  const paginas = Math.min(Math.ceil(cuantos / cupo), TOPE_DE_PAGINAS)

  return Math.min(Math.ceil(cuantos / paginas), cupo)
}

/** Cuantas paginas hacen falta para `largo` items, sin pasar del tope. Cero items, cero paginas. */
function cuantasPaginas (largo: number, porPagina: number): number {
  if (largo === 0 || porPagina <= 0) return 0

  return Math.min(Math.ceil(largo / porPagina), TOPE_DE_PAGINAS)
}

/**
 * Una pagina de una tabla, con lo que no se esta viendo ya contado.
 *
 * `ocultos` cuenta TODO lo que falta: lo que el backend recorto antes de mandar la lista y lo que el
 * tope de paginas dejo fuera. Por eso mira el `total` declarado y no solo el largo de lo que llego —
 * si la API dice que hay 42 y manda 40, la pantalla tiene que decir "+N" contando esos dos. Nunca se
 * miente por omision, y se dice una sola vez: en la ULTIMA pagina, que es donde el corte ocurre.
 *
 * @param pagina  numero de pagina, empezando en 1
 * @param paginas cuantas paginas tiene esta tabla en total
 * @param total   el conteo real que declara la API, o `null` si esta escena no lo manda
 */
function rebanada (
  clave: string,
  items: unknown[],
  pagina: number,
  porPagina: number,
  paginas: number,
  total: number | null
): TablaDePantalla {
  const mostrados = Math.min(items.length, paginas * porPagina)
  const hay = Math.max(total ?? 0, items.length)
  const desde = (pagina - 1) * porPagina

  return {
    clave,
    items: items.slice(desde, desde + porPagina),
    ocultos: pagina === paginas ? hay - mostrados : 0,
    total
  }
}

/**
 * Que `key` lleva el marco de la escena: ver `Escena.continuidad`.
 *
 * Un tablero conserva el marco entre sus paginas —solo cambian las filas— y una lamina no.
 */
function continuidadDe (clase: ClaseDeEscena, id: string): string {
  return ESCENAS_DE_TABLERO.has(clase) ? clase : id
}

/**
 * La tabla `clave` de una escena, o `null` si esta pagina no la trae.
 *
 * Existe para que el componente no busque por indice: en `trabajando`, `tablas[0]` es la compañia
 * salvo en el area donde la compañia no viene, y ahi `tablas[0]` seria el area. Un indice que
 * significa dos cosas distintas es exactamente el bug que nadie ve mirando la pared.
 */
export function tablaDeEscena (escena: Escena, clave: string): TablaDePantalla | null {
  return escena.tablas.find((tabla) => tabla.clave === clave) ?? null
}

/**
 * Cual de los dos juegos de campos toca mostrar ahora mismo.
 *
 * === POR QUE SALE DEL RELOJ Y NO DE UN TEMPORIZADOR ===
 *
 * La pantalla tiene UN solo reloj —el latido de 250 ms del worker de `proyeccion.ts`— porque el
 * `setInterval` de una pestaña casteada a un televisor se estrangula a uno por minuto. Un temporizador
 * propio para alternar las filas se estrangularia, y la pared se quedaria con la mitad de los datos
 * congelados sin que nadie se entere. Derivarlo del instante que ya llega no puede fallar: es una
 * division.
 *
 * Y sale del reloj de pared y no de cuanto lleva la escena a proposito: asi **todas las filas de la
 * pared alternan a la vez**, que es como se comporta un panel de aeropuerto de verdad, en vez de que
 * cada bloque lleve su compas.
 *
 * @param ahora    instante en milisegundos, o `null` antes de hidratar
 * @param periodoMs cada cuanto se cambia de juego; ver `PERIODO_DE_DATO_MS`
 * @returns `0` para el juego principal, `1` para el alterno
 */
export function faseDeDato (ahora: number | null, periodoMs: number = PERIODO_DE_DATO_MS): 0 | 1 {
  if (ahora === null || !Number.isFinite(ahora) || periodoMs <= 0) return 0

  return Math.floor(Math.max(ahora, 0) / periodoMs) % 2 === 0 ? 0 : 1
}

/** Una portada armada a mano, para el caso en que el guion se quedaria vacio. */
function portadaDeRespaldo (paquete: PaqueteDePantalla, parametros: ParametrosDePantalla): Escena {
  const dePaquete = paquete.scenes.find((escena) => escena.kind === 'portada')
  const base = (parametros.segundosPorEscena ?? SEGUNDOS_DE_RESPALDO) * 1000

  return {
    id: 'portada',
    clase: 'portada',
    continuidad: 'portada',
    duracionMs: Math.round(base * PROPORCION_PORTADA),
    tablas: [],
    origen: dePaquete ?? {
      kind: 'portada',
      counts: {
        personas: 0,
        jornadas_abiertas: 0,
        cronometros_corriendo: 0,
        procesos_abiertos: 0,
        procesos_atrasados: 0,
        espacios_activos: 0
      }
    }
  }
}

function esClaseConocida (clase: string): clase is ClaseDeEscena {
  return (CLASES_DE_ESCENA as readonly string[]).includes(clase)
}

function primero (valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor
}

/**
 * Como `acotar`, pero devuelve `null` cuando la URL no dijo nada.
 *
 * La diferencia importa: `null` significa "respeta lo configurado", y un numero por defecto en su
 * lugar pisaria la configuracion del area sin que nadie lo haya pedido.
 */
function acotarOpcional (
  crudo: string | undefined,
  limites: { minimo: number, maximo: number }
): number | null {
  const numero = Number(crudo)

  if (crudo === undefined || !Number.isFinite(numero) || numero <= 0) return null

  return Math.round(Math.min(Math.max(numero, limites.minimo), limites.maximo))
}

function acotar (
  crudo: string | undefined,
  porDefecto: number,
  limites: { minimo: number, maximo: number },
  entero = true
): number {
  const numero = Number(crudo)

  if (!Number.isFinite(numero) || numero <= 0) return porDefecto

  const acotado = Math.min(Math.max(numero, limites.minimo), limites.maximo)

  return entero ? Math.round(acotado) : acotado
}

/** Las clases nombradas en una lista separada por comas. Lo que no se reconoce se ignora. */
function listaDeClases (crudo: string | undefined): ClaseDeEscena[] {
  if (crudo === undefined || crudo === '') return []

  return crudo
    .split(',')
    .map((pieza) => pieza.trim())
    // La portada no se puede saltar: es lo que impide que el guion quede vacio.
    .filter((pieza): pieza is ClaseDeEscena => esClaseConocida(pieza) && pieza !== 'portada')
}

/** Una clase sola, o `null` si no se reconoce — y entonces el guion completo, nunca uno vacio. */
function unaClase (crudo: string | undefined): ClaseDeEscena | null {
  if (crudo === undefined) return null

  return esClaseConocida(crudo) ? crudo : null
}

function transicionValida (crudo: string | undefined): ParametrosDePantalla['transicion'] {
  return crudo === 'vista' || crudo === 'ninguna' ? crudo : 'fundido'
}
