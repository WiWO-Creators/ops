import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { coloresAvatar, iniciales } from '@/lib/personas'
import { TextoSolari } from './Solari'

/**
 * Las piezas que comparten las escenas de la pantalla de area.
 *
 * Existen aparte de `src/componentes/presentadores/` por una sola razon, y es la que gobierna todo
 * este directorio: aquellos componentes miden en pixeles fijos (`size-8`, `text-xs`), que es lo
 * correcto para un monitor a medio metro y lo incorrecto para un televisor a cuatro metros que ademas
 * puede reportar cualquier resolucion CSS. Acá todo mide en `vmin`.
 *
 * === LA ESCALA DEL TABLERO ===
 *
 * Desde que las escenas de lista son un tablero de salidas y no una pared de fichas, los cuerpos de
 * letra son tres y solo tres, y estan acá para que las cuatro escenas no se vayan cada una por su
 * lado:
 *
 * - **`CUERPO_PRINCIPAL` (3vmin ≈ 32 px a 1080p).** El nombre de la Tarea, de la persona o del
 *   Proyecto: lo unico que alguien lee de verdad desde el pasillo. La referencia de la que sale
 *   —2 cm de altura de mayuscula a cuatro metros, ~45 px— corresponde a un televisor de 55"; en los
 *   de 65", que son los que cuelgan en la oficina, 32 px dan esos mismos 2 cm largos.
 * - **`CUERPO_COLUMNA` (2.7vmin ≈ 29 px).** Todo lo demas: el Proyecto, el estado, la fecha, el
 *   cargo. Son campos de apoyo, se leen sabiendo de antemano que dicen, y por eso aguantan bajar.
 *   Es tambien el piso duro: `pruebas/pantalla-area.browser.mjs` falla si aparece texto por debajo
 *   de 28 px, para que nadie resuelva un desborde achicando la letra.
 * - **`CUERPO_ETIQUETA` (2.7vmin, en versalitas y muy espaciado).** Los rotulos de columna, que se
 *   leen una vez y despues se reconocen por la posicion.
 */

/** El nombre: lo unico que se lee desde el pasillo. */
export const CUERPO_PRINCIPAL = 'text-[3vmin]'

/** Los campos de apoyo del tablero, y el piso tipografico de toda la pantalla. */
export const CUERPO_COLUMNA = 'text-[2.7vmin]'

/** Los rotulos de columna. */
export const CUERPO_ETIQUETA = 'text-[2.7vmin] tracking-[0.16em] uppercase'

/**
 * De quien es lo que la escena esta mostrando: "del área" o "de la compañía".
 *
 * Existe porque la pantalla global —la de toda la empresa, que convive con las de area y llega con
 * `data.area.id` en `null`— usa exactamente los mismos componentes, y un titulo que dijera "Tareas del
 * área" en una pared donde no hay ningun area seria mentira. Es la unica diferencia visible entre las
 * dos pantallas: todo lo demas se dibuja igual porque son los mismos datos con otro alcance.
 *
 * Va acá y no escrito en cada escena para que la proxima que necesite nombrarse no lo resuelva a mano.
 *
 * @param esGlobal si la pantalla es la de toda la compañia
 * @returns el complemento, ya con la preposicion, listo para pegar detras de un sustantivo
 */
export function rotuloDeAlcance (esGlobal: boolean): string {
  return esGlobal ? 'de la compañía' : 'del área'
}

/**
 * El relleno lateral de una fila del tablero, rotulos incluidos.
 *
 * Es una constante y no una clase escrita en cada escena porque las columnas se alinean SOLAS: el
 * ancho de la columna flexible es lo que sobra despues del relleno, asi que si la fila de rotulos
 * lleva un relleno distinto al de las filas de datos, el rotulo "Proyecto" queda tres centimetros a
 * la izquierda de los Proyectos y la tabla deja de ser una tabla. Lo vigila la prueba de navegador,
 * que compara el `grid-template-columns` resuelto de las dos.
 */
export const RELLENO_DE_FILA = 'px-[1.5vmin]'

/**
 * El diametro por debajo del cual las iniciales dejan de dibujarse.
 *
 * `iniciales()` ocupa el 42% del circulo, asi que un avatar de 6.6vmin deja letras de 2.8vmin —justo
 * el piso de la pantalla— y uno de 3.8vmin las deja de 1.6vmin, que a cuatro metros no son letras
 * sino suciedad en el cristal. Ver `Cara`.
 */
const DIAMETRO_CON_INICIALES = 6.6

/**
 * Avatar, para reconocer a alguien de lejos sin leer.
 *
 * Reusa `iniciales()` y `coloresAvatar()` de `@/lib/personas`, que son las mismas funciones que usa el
 * panel: dos personas tienen el mismo color en las dos pantallas, y el color no se reinventa acá.
 *
 * === POR QUE UN AVATAR CHICO NO LLEVA INICIALES ===
 *
 * En el tablero denso el avatar mide 3.8vmin: lo que cabe en una fila sin hacerla mas alta. A ese
 * diametro las iniciales saldrian a 1.6vmin —17 px a 1080p—, que no se leen a cuatro metros y ademas
 * romperian el piso tipografico que la prueba de navegador vigila. Asi que por debajo de
 * `DIAMETRO_CON_INICIALES` el avatar sin foto queda como un disco de color, y punto.
 *
 * No es una perdida: el color sale del nombre y es estable entre pantallas, asi que sirve de ancla
 * para recorrer una columna, y el nombre completo esta al lado en 3vmin. Lo que se pierde es una
 * etiqueta ilegible.
 *
 * No usa `next/image`: las fotos salen de `uploads/` de Perfex, en otro dominio, y una pantalla que
 * las carga cada tantos minutos no gana nada con la optimizacion. Si la imagen falla, queda el disco
 * de color debajo, que es la caida correcta sin necesidad de estado.
 */
export function Cara ({ nombre, imagen, tamano = '3.8vmin' }: {
  nombre: string
  imagen: string | null
  tamano?: string
}): ReactNode {
  const colores = coloresAvatar(nombre)
  const conIniciales = Number.parseFloat(tamano) >= DIAMETRO_CON_INICIALES

  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold"
      style={{
        width: tamano,
        height: tamano,
        fontSize: `calc(${tamano} * 0.42)`,
        backgroundColor: colores.fondo,
        color: colores.texto
      }}
    >
      {conIniciales && iniciales(nombre)}
      {imagen !== null && imagen !== '' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imagen}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  )
}

/**
 * "Bernardita Undurraga Soto" a "Bernardita U.". El nombre que cabe en una columna angosta.
 *
 * En el tablero, quien tiene asignada una Tarea es una columna de texto y no una pila de caras: a
 * cuatro metros una cara de 3.4vmin no se reconoce, y tres superpuestas menos. Un nombre abreviado si
 * se lee, y ademas se puede recorrer la columna de arriba abajo buscando a alguien.
 *
 * Se queda con el nombre de pila entero y con la inicial de la palabra siguiente, que en la
 * convencion chilena es el primer apellido: es por ahi por donde se identifica a alguien, y el segundo
 * apellido no distingue nada que el primero no distinga ya. Con un nombre compuesto —"José Luis
 * Pérez"— sale "José L.", que no es el apellido; se acepta a cambio de que la columna quepa en 20vmin
 * y no haya que recortar el nombre de la Tarea para hacerle sitio.
 *
 * No usa `iniciales()`: esa devuelve dos letras para meterlas en un circulo, y acá hace falta algo
 * que se pueda leer en voz alta.
 */
export function nombreCorto (nombre: string): string {
  const [pila, siguiente] = nombre.trim().split(/\s+/).filter((parte) => parte !== '')

  if (pila === undefined) return ''
  if (siguiente === undefined) return pila

  return `${pila} ${siguiente.slice(0, 1)}.`
}

/**
 * Un contador que corre en pantalla, formateado `H:MM:SS`.
 *
 * `ahora` llega de arriba y no de un `Date.now()` propio: un tic por escena y no uno por fila. Con
 * treinta filas en pantalla, treinta temporizadores propios serian treinta repintados por segundo
 * para mostrar lo mismo.
 *
 * **Congelado dice la verdad.** Cuando los datos estan viejos el contador deja de sumar y se queda en
 * el ultimo valor bueno: un numero que sigue trepando con la conexion caida es una mentira, y esta
 * pared la leen jefaturas de area.
 */
export function Corriendo ({ desde, ahora, congelado, className }: {
  desde: string | null
  ahora: number | null
  congelado: boolean
  className?: string
}): ReactNode {
  if (desde === null || ahora === null) {
    return <span className={cn('tabular-nums', className)}>--:--</span>
  }

  const arranque = Date.parse(desde)

  if (Number.isNaN(arranque)) {
    return <span className={cn('tabular-nums', className)}>--:--</span>
  }

  const segundos = Math.max(Math.floor((ahora - arranque) / 1000), 0)
  const horas = Math.floor(segundos / 3600)
  const minutos = Math.floor((segundos % 3600) / 60)
  const resto = segundos % 60

  return (
    <span className={cn('tabular-nums', congelado && 'opacity-60', className)}>
      {horas}:{String(minutos).padStart(2, '0')}:{String(resto).padStart(2, '0')}
    </span>
  )
}

/**
 * Lo que se muestra cuando una escena queda vacia y todavia asi se quiere mostrar.
 *
 * Casi nunca se usa: `construirGuion()` saca del guion las escenas vacias. Queda para el unico caso
 * en que la lista se vacia entre el render y el siguiente sondeo.
 */
export function Nada ({ texto }: { texto: string }): ReactNode {
  return (
    <p className="text-texto-tenue text-center text-[4.5vmin]">{texto}</p>
  )
}

/**
 * La cabecera de una escena de lista: el titulo, el total y lo que no entro.
 *
 * === LOS "+N MÁS" VIVEN ACÁ, Y NO AL PIE ===
 *
 * Antes eran una linea propia debajo de la lista. Costaban ~4.3vmin de banda util, que es casi una
 * fila entera del tablero, y para decir algo que nadie lee al pie de una pared. Puestos junto al
 * titulo no cuestan ni un pixel de alto y se leen en el mismo golpe de vista que el nombre de la
 * escena — que es como los rotula un tablero de aeropuerto de verdad.
 *
 * Lo que no cambia es que se digan. Nunca se miente por omision: si la lista se corto, la pantalla
 * lo dice.
 *
 * @param titulo   el nombre de la escena
 * @param total    cuantos hay en total, si la API lo sabe; se omite cuando no
 * @param ocultos  cuantos quedaron fuera del corte, 0 si no se corto nada
 */
export function CabeceraDeEscena ({ titulo, total, ocultos }: {
  titulo: string
  total?: number
  ocultos: number
}): ReactNode {
  return (
    <div className="mb-[0.8vmin] flex shrink-0 items-baseline justify-between gap-[3vmin]">
      <h2 className={cn('text-texto-tenue truncate font-semibold', CUERPO_ETIQUETA)}>
        {titulo}
        {total !== undefined && (
          <span className="text-texto-sutil ml-[1.5vmin] font-normal tracking-normal tabular-nums">
            {total}
          </span>
        )}
      </h2>

      {ocultos > 0 && (
        <span className={cn('text-texto-sutil shrink-0 tabular-nums', CUERPO_COLUMNA)}>
          +{ocultos} más
        </span>
      )}
    </div>
  )
}

/**
 * === EL TABLERO QUE SE MUEVE ===
 *
 * Lo que sigue es la mitad en React de la animacion de panel de aeropuerto. La otra mitad son los
 * `@keyframes` de `pantalla.css`, y las dos tienen que leerse juntas.
 *
 * Son tres movimientos y ninguno de los tres corre solo:
 *
 * 1. **La fila voltea al llegar.** Al pasar de pagina el marco de la escena NO se remonta —eso lo
 *    decide `Escena.continuidad` en el dominio—, asi que la cabecera y los rotulos se quedan quietos y
 *    lo unico que cambia son los `<li>`. Cada uno estrena su animacion al montarse, escalonado por su
 *    posicion: sale la cascada de un split-flap sin un solo temporizador.
 * 2. **La celda alterna.** Cada `PERIODO_DE_DATO_MS` la fila cambia un campo por otro, para caber mas
 *    dato sin achicar la letra ni sumar columnas. Quien decide cuando es `faseDeDato()` en el dominio,
 *    contra el UNICO reloj de la pantalla; aca solo se dibuja.
 * 3. **El caracter voltea.** El Solari de verdad, en `Solari.tsx`: cada posicion gira por su cuenta
 *    pasando por glifos intermedios hasta el suyo. Cuesta un puñado de elementos por caracter, asi que
 *    **no se usa en el tablero**, solo donde el texto es corto y de ancho previsible —el reloj, las
 *    cifras, los rotulos que alternan—. El reparto completo esta en el docblock de `Solari.tsx`.
 *
 * === POR QUE EL VOLTEO DE FILA NO DESAPARECIO ===
 *
 * El 1 y el 3 son el mismo gesto a dos escalas, y podria parecer que el segundo sobra. No sobra, y
 * ademas no pelean: **cuentan cosas distintas y nunca ocurren por el mismo motivo**. La fila voltea
 * cuando llega contenido nuevo al cambiar de pagina; el caracter voltea cuando un dato que ya estaba
 * en pantalla cambia de valor. Sustituir el 1 por el 3 costaria quince filas por siete columnas por
 * cuarenta caracteres de rodillos en el mismo fotograma —miles de elementos animandose a la vez en un
 * stick HDMI— para contar algo que una lamina entera girando ya cuenta con quince.
 *
 * Los tres animan `transform` y `opacity` y nada mas: los resuelve el compositor, no cuestan un
 * reflow, y ninguno se queda corriendo solo —esta pared lleva meses encendida y un pixel en
 * movimiento permanente es un pixel quemado—. `?transicion=ninguna` los apaga los tres desde el CSS,
 * para el televisor que no da abasto.
 */

/**
 * A partir de que fila el escalonado deja de crecer.
 *
 * Sin tope, una tabla de 18 filas a 35 ms tarda 950 ms en terminar de caer, y la ultima fila aparece
 * cuando quien mira ya la dio por perdida. Con el tope, la cascada dura siempre lo mismo y las filas
 * del final llegan juntas, que es exactamente lo que hace un panel de verdad.
 */
const TOPE_DE_ESCALON = 12

/** La clase que hace voltear una fila recien llegada. Su animacion vive en `pantalla.css`. */
export const FILA_VIVA = 'pantalla-voltea'

/**
 * El retardo de la fila numero `indice`, como variable CSS.
 *
 * Va en un `style` y no en una clase porque son N valores distintos y no un puñado: una clase por
 * posicion serian veinte reglas muertas en la hoja.
 *
 * @param indice la posicion de la fila dentro de SU tabla, empezando en 0
 */
export function escalonDeFila (indice: number): CSSProperties {
  return { '--fila': Math.min(Math.max(indice, 0), TOPE_DE_ESCALON) } as CSSProperties
}

/** Lo que toda celda que alterna necesita, con o sin volteo Solari. */
interface CeldaAlterna {
  /** `0` el juego principal, `1` el alterno; lo decide `faseDeDato()`. */
  fase: 0 | 1
  className?: string
}

/**
 * Las dos formas de una celda que alterna, y por que el tipo las separa.
 *
 * Con `solari` los dos contenidos tienen que ser **texto plano**: el volteo se dibuja caracter a
 * caracter y un `ReactNode` no tiene caracteres que voltear. Que lo vigile el tipo y no un comentario
 * es lo unico que evita que alguien le pase `<Quien personas={...} />` a una celda Solari y se
 * encuentre con una celda vacia en la pared, que nadie ve fallar desde el pasillo.
 */
type PropsDeCeldaQueAlterna =
  | (CeldaAlterna & { solari?: false, principal: ReactNode, alterno: ReactNode })
  | (CeldaAlterna & { solari: true, principal: string, alterno: string })

/**
 * Una celda que alterna entre dos contenidos al ritmo de `fase`.
 *
 * Es como la pantalla enseña mas de lo que cabe: en vez de apretar dos columnas donde hay sitio para
 * una, la misma columna dice una cosa y luego la otra. **Nunca alterna lo que identifica la fila** —el
 * nombre de la persona, el de la Tarea, el del Proyecto—: si el ancla parpadeara, recorrer la columna
 * buscando a alguien seria imposible.
 *
 * === LOS DOS MODOS, Y POR QUE NO SE SUMAN ===
 *
 * **Sin `solari`** el contenido entra con un fundido corto: el `key` por fase remonta el `<span>`, y al
 * montarse el CSS de `.pantalla-alterna` vuelve a correr. Sin ese `key` el texto cambiaria de golpe y
 * sin decir nada.
 *
 * **Con `solari`** el cambio lo cuenta el volteo caracter a caracter, y entonces el fundido sobra: dos
 * movimientos sobre la misma celda se estorban y se leen peor que uno bien hecho. Por eso el modo
 * Solari no lleva ni `key` ni `.pantalla-alterna`. Que NO lleve `key` es lo importante: sin el, React
 * reconcilia posicion por posicion y solo voltean los caracteres que de verdad cambiaron — que es lo
 * que hace un panel mecanico, donde la aleta que ya tiene su letra no gira.
 *
 * El envoltorio de bloque no es decoracion. El texto Solari es una tira de huecos `inline-block`, y un
 * `inline-block` no lo recorta el `truncate` de su celda: se saldria de su columna del tablero, y en un
 * marco con `overflow: hidden` eso se lleva por delante lo que tenga al lado sin dejar rastro.
 *
 * @param principal lo que se ve casi siempre
 * @param alterno   lo que se ve en la fase alterna
 * @param solari    si el cambio se cuenta volteando caracter a caracter; ver `Solari.tsx`
 */
export function CeldaQueAlterna (props: PropsDeCeldaQueAlterna): ReactNode {
  const { fase, className } = props

  if (props.solari === true) {
    return (
      <span className={cn('block overflow-hidden whitespace-nowrap', className)}>
        <TextoSolari texto={fase === 0 ? props.principal : props.alterno} />
      </span>
    )
  }

  return (
    <span key={fase} className={cn('pantalla-alterna truncate', className)}>
      {fase === 0 ? props.principal : props.alterno}
    </span>
  )
}

/**
 * La fila de rotulos de columna del tablero.
 *
 * Es un `div` y no la primera fila del `<ul>` a proposito: la prueba de navegador mide cada hijo
 * directo de la lista contra el marco para cazar desbordes, y una fila que no es un item falsearia
 * esa cuenta. Comparte la clase de rejilla con las filas, que es lo que hace que las columnas caigan
 * en el mismo sitio.
 *
 * @param columnas  la clase `.pantalla-columnas-*` de la escena
 * @param children  un elemento por columna, en el mismo orden que las filas
 */
export function RotulosDeColumna ({ columnas, children }: {
  columnas: string
  children: ReactNode
}): ReactNode {
  return (
    <div
      className={cn(
        'pantalla-fila border-linea-fuerte text-texto-sutil shrink-0 border-b pb-[0.6vmin] font-semibold',
        RELLENO_DE_FILA,
        CUERPO_ETIQUETA,
        columnas
      )}
    >
      {children}
    </div>
  )
}
