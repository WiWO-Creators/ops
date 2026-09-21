import { useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { coloresAvatar, iniciales } from '@/lib/personas'
import {
  ANCHO_MAYUSCULA_EM, ANCHO_SOBRIO_EM, TOPE_DE_CONTADOR, TOPE_DE_GLIFOS, cupoDeFichas, esNumerico,
  ondaDeContador, ondaDeFicha, textoDeFicha
} from '@/dominio/solari'
import type { PlanDeOla } from '@/dominio/solari'
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
 * Las iniciales no son Solari, y no por coste: un avatar es un disco, no una aleta, y una ficha
 * rectangular dentro de un circulo de 3.8vmin no se lee como un panel sino como un error de
 * maquetacion. Ademas casi nunca se dibujan, justo por lo de arriba.
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
 * El cliente de una fila del tablero: su logo si lo tiene, y si no su nombre en la tira de fichas.
 *
 * === POR QUE EL LOGO NO ES UNA FICHA ===
 *
 * Una marca no es texto: volteada caracter a caracter no se lee, y recortada a los 33vmin de la
 * columna tampoco. Va como imagen `contain`, con la altura de la fila como techo, asi que un logo
 * apaisado y uno cuadrado ocupan lo mismo de alto y la fila no cambia de altura segun el cliente.
 *
 * El nombre, en cambio, es texto de tablero y se comporta como la columna que reemplaza: mismas
 * mayusculas, mismo cupo, misma ola. Un cliente sin logo no degrada la fila, solo la escribe.
 *
 * === EL LOGO QUE NO CARGA ===
 *
 * `uploads/` del panel tiene rutas muertas —es el caso comun, no el raro— y un `<img>` roto en una
 * pared es un icono gris que nadie puede arreglar desde ahi. Al primer error se cae al nombre, que
 * es el mismo destino del cliente sin logo.
 *
 * No usa `next/image`: la imagen sale de otro dominio y sin tamano conocido, igual que las caras.
 */
export function MarcaDeCliente ({ cliente, sitio, maximo, className }: {
  cliente: { name: string, image_url: string | null } | null
  sitio: SitioEnLaOla
  maximo: number
  className?: string
}): ReactNode {
  const [logoRoto, setLogoRoto] = useState(false)
  const logo = cliente?.image_url ?? null

  if (cliente === null) {
    return <FichaDeTablero mayusculas texto="—" sitio={sitio} maximo={maximo} className={className} />
  }

  if (logo === null || logo === '' || logoRoto) {
    return <FichaDeTablero mayusculas texto={cliente.name} sitio={sitio} maximo={maximo} className={className} />
  }

  return (
    <span className={cn('flex min-w-0 items-center', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo}
        alt={cliente.name}
        onError={() => { setLogoRoto(true) }}
        className="max-h-[3.4vmin] max-w-full object-contain object-left"
      />
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
 * === SOLO LAS CIFRAS DE LA PARED SON UNA TIRA DE FICHAS ===
 *
 * El panel mecanico —fondo de aleta, junta, linea de pliegue y volteo caracter a caracter— esta
 * reservado a lo que es una CIFRA: relojes, contadores, porcentajes, conteos y fechas cortas. Los
 * nombres, los titulos, los rotulos y los avisos son texto plano y quieto. Quien lo decide es
 * `esNumerico()` en el dominio, sobre el texto ya recortado, y no un parametro de cada llamada: asi
 * una celda que alterna entre un porcentaje y una palabra cambia de dibujo sola.
 *
 * Lo que sigue son las tres formas de pedir un texto, y se diferencian **solo en como entran en la
 * ola** —quien voltea cuando, cuando toca voltear— porque el coste de esta pantalla no lo decide
 * cuantas fichas hay sino cuantas giran en el mismo fotograma. El razonamiento completo esta en el
 * docblock de `RANURAS_DE_OLA`, en el dominio.
 *
 * - **`Ficha`**: un texto suelto, fuera de cualquier tabla. La cabecera, el pie, el titulo de una
 *   escena, las cifras de la portada. Cambian pocas veces y son pocos caracteres, asi que llevan la
 *   ola lenta de 35 ms, que es la que mejor se ve.
 * - **`FichaDeTablero`**: una celda de una fila. Recibe su `sitio` en la ola —fila y columna— y de ahi
 *   sale su ranura de arranque y cuantas de sus fichas pueden girar. Es lo que hace que un cambio de
 *   pagina sea una ola que recorre el tablero y no cientos de fichas girando a la vez.
 * - **`Corriendo`**: un contador. Tiene ola propia y apretada, porque cambia una vez por segundo y no
 *   una vez por pagina. Ver su docblock.
 *
 * Y una regla que no se puede romper: **el volteo lo dispara el cambio de VALOR, nunca el render.** No
 * hace falta cuidarlo a mano —el `key` de `TextoSolari` es `posicion:caracter`, asi que un render con
 * el mismo texto no remonta nada y no anima nada— pero si hace falta no romperlo: cualquier `key`
 * puesta por encima de una ficha la remontaria en cada render y la pared se llenaria de fichas girando
 * cuatro veces por segundo sin que nada haya cambiado.
 */

/** Donde cae una celda dentro de la ola de su tablero. Lo arma la escena con `planDeOla()`. */
export interface SitioEnLaOla {
  /** El reparto de la escena: cuantas fichas gira cada columna y cuanto consume una fila. */
  plan: PlanDeOla
  /** La posicion de la fila dentro de SU tabla, empezando en 0. */
  fila: number
  /** El indice de la columna, en el mismo orden que los pesos que se le pasaron al plan. */
  columna: number
  /** Ranuras extra, para la segunda tabla de una escena que tiene dos. */
  desfase?: number
}

/**
 * Un texto suelto de la pantalla.
 *
 * === SOLO LAS CIFRAS SE DIBUJAN COMO UN PANEL MECANICO ===
 *
 * Lo decide `esNumerico()` sobre el texto ya recortado, y no un parametro: quien coloca la pieza no
 * tiene que acordarse de nada y una celda que alterna entre un porcentaje y una palabra cambia de
 * dibujo sola. Un reloj, un contador, un porcentaje o un conteo voltean con su estetica de aleta —que
 * es lo que cuenta un cambio de valor de un golpe a cuatro metros—; un nombre, un titulo, un rotulo o
 * un aviso son texto plano y quieto, sin fondo, sin junta, sin pliegue y sin giro.
 *
 * Una frase en fichas de ancho fijo pierde la silueta de las palabras —que es lo que el ojo usa para
 * leerla— y ademas crece de ancho, lo que en la columna mas apretada del tablero significa recortar
 * informacion. El reparto completo esta en el docblock de `esNumerico()`, en el dominio.
 *
 * Y sale barato: el texto plano es UN nodo, no un hueco por caracter con su animacion. La escena que
 * antes montaba un centenar de fichas girando en el mismo fotograma —medido: el pico de la escena, por
 * encima del de la ola del tablero— para animar unas etiquetas que nadie leia, ahora no monta ninguna.
 *
 * @param texto      lo que tiene que decir
 * @param maximo     cuantos caracteres caben donde va; ver `cupoDeFichas()`
 * @param mayusculas si va en mayusculas, como las aletas de un panel de verdad
 * @param tope       cuantas de sus fichas pueden girar, si es una cifra
 * @param onda       en que ranura arranca, para no disparar cincuenta fichas en el mismo fotograma
 */
export function Ficha ({
  texto, maximo, mayusculas = false, tope = TOPE_DE_GLIFOS, onda = 0, className
}: {
  texto: string
  maximo: number
  mayusculas?: boolean
  tope?: number
  onda?: number
  className?: string
}): ReactNode {
  const contenido = textoDeFicha(texto, maximo, mayusculas)

  return (
    <span className={cn('block overflow-hidden whitespace-nowrap', className)}>
      {esNumerico(contenido)
        ? <TextoSolari uniforme texto={contenido} tope={tope} onda={onda} />
        : contenido}
    </span>
  )
}

/** Cuantas fichas gira un rotulo o un titulo. Ver el docblock de `Ficha`. */
export const TOPE_SUELTO = 3

/**
 * Una celda de una fila del tablero.
 *
 * Lo unico que agrega sobre `Ficha` es la ola: de `sitio` salen la ranura de arranque —que es el orden
 * de lectura del tablero, fila por fila y columna por columna— y el tope de fichas que esta columna
 * puede girar. Sin eso, un cambio de pagina lanzaria todas las fichas del tablero en el mismo
 * fotograma, que es exactamente la medicion que dejo la pared en 21 fotogramas por segundo.
 *
 * **El envoltorio de bloque no es decoracion.** Una tira de fichas es una fila de `inline-block`, y un
 * `inline-block` no lo recorta el `truncate` de su celda: se saldria de su columna del tablero, y en un
 * marco con `overflow: hidden` eso se lleva por delante lo que tenga al lado sin dejar rastro.
 */
export function FichaDeTablero ({ texto, sitio, maximo, mayusculas = false, className }: {
  texto: string
  sitio: SitioEnLaOla
  maximo: number
  mayusculas?: boolean
  className?: string
}): ReactNode {
  const contenido = textoDeFicha(texto, maximo, mayusculas)

  if (!esNumerico(contenido)) {
    return <span className={cn('block overflow-hidden whitespace-nowrap', className)}>{contenido}</span>
  }

  return (
    <span className={cn('block overflow-hidden whitespace-nowrap', className)}>
      <TextoSolari
        uniforme
        className="solari-tablero"
        texto={contenido}
        tope={sitio.plan.topes[sitio.columna] ?? 0}
        onda={ondaDeFicha(sitio.plan, sitio.fila, sitio.columna, sitio.desfase ?? 0)}
      />
    </span>
  )
}

/**
 * Un contador que corre en pantalla, formateado `H:MM:SS`, en fichas.
 *
 * `ahora` llega de arriba y no de un `Date.now()` propio: un tic por escena y no uno por fila. Con
 * treinta filas en pantalla, treinta temporizadores propios serian treinta repintados por segundo
 * para mostrar lo mismo.
 *
 * === POR QUE UN CONTADOR SI PUEDE SER SOLARI ===
 *
 * A primera vista es el caso imposible: quince filas por ocho caracteres volteando una vez por
 * segundo. No lo es, porque **un contador no cambia entero**. En `2:14:37` cada segundo cambia UN
 * digito; el de las decenas cambia cada diez segundos y el de los minutos cada sesenta. El `key` por
 * `posicion:caracter` de `TextoSolari` remonta solo las posiciones cuyo caracter cambio, asi que lo
 * que gira es una ficha por contador y por segundo, no ocho.
 *
 * Encima el presupuesto se gasta **desde la cola** (`TOPE_DE_CONTADOR`, `desdeElFinal`): las dos
 * ultimas posiciones son las unicas que se mueven a ese ritmo, y son exactamente las que pueden girar.
 * Lo de delante cambia tan de vez en cuando que aparecer ya puesto es lo correcto.
 *
 * Y la ola es propia —`ondaDeContador()`, una ventana de 0,88 s repartida entre todas las filas—
 * porque esta ola se repite cada segundo: con las once ranuras por fila del tablero, la ultima fila
 * voltearia cuatro segundos tarde, o sea cuatro valores despues del suyo.
 *
 * **Congelado dice la verdad.** Cuando los datos estan viejos el contador deja de sumar y se queda en
 * el ultimo valor bueno: un numero que sigue trepando con la conexion caida es una mentira, y esta
 * pared la leen jefaturas de area. Congelado no voltea nada, y no hace falta apagarlo: sin cambio de
 * valor no hay remonte, y sin remonte no hay animacion.
 *
 * @param desde     cuando arranco, en ISO, o `null` si no se sabe
 * @param ahora     el reloj de la pantalla, o `null` antes de hidratar
 * @param congelado si los datos estan viejos y el contador tiene que quedarse quieto
 * @param fila      la posicion de la fila, para que la ola baje por la columna
 * @param filas     cuantas filas tiene la tabla, para repartir la ventana de la ola entre todas
 * @param maximo    cuantos caracteres caben en su columna
 */
export function Corriendo ({ desde, ahora, congelado, fila, filas, maximo, className }: {
  desde: string | null
  ahora: number | null
  congelado: boolean
  fila: number
  filas: number
  maximo: number
  className?: string
}): ReactNode {
  return (
    <span className={cn('block overflow-hidden whitespace-nowrap', congelado && 'opacity-60', className)}>
      <TextoSolari
        className="solari-tablero solari-contador"
        texto={textoDeFicha(relojDeContador(desde, ahora), maximo)}
        uniforme
        tope={TOPE_DE_CONTADOR}
        desdeElFinal
        onda={ondaDeContador(fila, filas)}
      />
    </span>
  )
}

/**
 * `H:MM:SS` desde un instante de arranque, o `--:--` cuando no hay con que contarlo.
 *
 * Separado del componente para que lo que decide el TEXTO sea una funcion y no un render: es lo que
 * permite afirmar que el volteo se dispara por cambio de valor. Dos renders del mismo segundo dan la
 * misma cadena, `TextoSolari` no remonta ni una posicion y no gira ni una ficha — que es justo lo que
 * hace falta con un latido de 250 ms detras.
 */
function relojDeContador (desde: string | null, ahora: number | null): string {
  if (desde === null || ahora === null) return '--:--'

  const arranque = Date.parse(desde)

  if (Number.isNaN(arranque)) return '--:--'

  const segundos = Math.max(Math.floor((ahora - arranque) / 1000), 0)
  const horas = Math.floor(segundos / 3600)
  const minutos = Math.floor((segundos % 3600) / 60)
  const resto = segundos % 60

  return `${horas}:${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')}`
}

/**
 * Lo que se muestra cuando una escena queda vacia y todavia asi se quiere mostrar.
 *
 * Casi nunca se usa: `construirGuion()` saca del guion las escenas vacias. Queda para el unico caso
 * en que la lista se vacia entre el render y el siguiente sondeo.
 */
export function Nada ({ texto }: { texto: string }): ReactNode {
  return (
    <p className="text-texto-tenue flex justify-center text-[4.5vmin]">
      <Ficha texto={texto} maximo={CUPO_DE_AVISO} />
    </p>
  )
}

/** Lo que cabe en un aviso centrado a 4.5vmin sobre una pared de 170vmin de ancho. */
const CUPO_DE_AVISO = cupoDeFichas(150, 4.5, ANCHO_SOBRIO_EM)

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
 * El titulo va en mayusculas —ya lo estaba por `CUERPO_ETIQUETA`— y es texto plano, igual que el
 * "+N más": son palabras. El conteo de al lado son digitos, asi que es lo unico de la cabecera que se
 * dibuja como panel y lo unico que voltea. Su ola arranca en las primeras ranuras, antes que la del
 * tablero, porque esta arriba: la ola baja.
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
      <h2 className={cn('text-texto-tenue flex min-w-0 items-baseline gap-[1.5vmin] font-semibold', CUERPO_ETIQUETA)}>
        <Ficha mayusculas tope={TOPE_SUELTO} texto={titulo} maximo={CUPO_DE_TITULO} />
        {total !== undefined && (
          <span className="text-texto-sutil shrink-0 font-normal tracking-normal">
            <Ficha tope={TOPE_SUELTO} onda={6} texto={String(total)} maximo={CUPO_DE_CIFRA} />
          </span>
        )}
      </h2>

      {ocultos > 0 && (
        <span className={cn('text-texto-sutil shrink-0', CUERPO_COLUMNA)}>
          <Ficha tope={TOPE_SUELTO} onda={10} texto={`+${ocultos} más`} maximo={CUPO_DE_CIFRA + 5} />
        </span>
      )}
    </div>
  )
}

/** Lo que cabe en el titulo de una escena: la mitad del ancho de la pared a 2.7vmin, en texto plano. */
const CUPO_DE_TITULO = cupoDeFichas(85, 2.7, ANCHO_MAYUSCULA_EM)

/** Un conteo de la cabecera. Cuatro cifras son 9.999 Tareas abiertas: no hay un area asi. */
const CUPO_DE_CIFRA = 4

/**
 * La fila de rotulos de columna del tablero.
 *
 * Es un `div` y no la primera fila del `<ul>` a proposito: la prueba de navegador mide cada hijo
 * directo de la lista contra el marco para cazar desbordes, y una fila que no es un item falsearia
 * esa cuenta. Comparte la clase de rejilla con las filas, que es lo que hace que las columnas caigan
 * en el mismo sitio.
 *
 * @param columnas  la clase `.pantalla-columnas-*` de la escena
 * @param children  un `Rotulo` por columna, en el mismo orden que las filas
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

/**
 * Un rotulo de columna.
 *
 * Es una palabra, asi que es **texto plano**: una palabra en fichas de ancho fijo pierde el 29% de sus
 * caracteres, y el rotulo tiene que caber en la misma columna que el dato que rotula, que suele ser
 * mas corto. No voltea aunque la columna que alterna cambie de campo.
 *
 * Conserva `onda` porque la pieza es la misma que dibuja las cifras, y la ranura no cuesta nada cuando
 * no hay nada que animar.
 *
 * @param texto   lo que dice el rotulo
 * @param columna su indice, de izquierda a derecha, para la ola
 * @param maximo  cuantos caracteres caben en su columna
 * @param desfase ranuras extra, para el segundo juego de rotulos de una escena a dos columnas
 */
export function Rotulo ({ texto, columna, maximo, desfase = 0, className }: {
  texto: string
  columna: number
  maximo: number
  desfase?: number
  className?: string
}): ReactNode {
  return (
    <Ficha
      mayusculas
      tope={TOPE_SUELTO}
      texto={texto}
      maximo={maximo}
      onda={desfase + Math.max(columna, 0) * RANURAS_POR_ROTULO}
      className={className}
    />
  )
}

/**
 * Cuantas ranuras separan un rotulo del siguiente.
 *
 * Seis con el escalon lento de 35 ms son 210 ms entre columnas: la fila entera de seis rotulos tarda
 * 1,2 s en recorrerse, que se lee como una pasada. Con el tope de `TOPE_SUELTO` y este escalonado, lo
 * que gira a la vez en una fila de rotulos no pasa de cuatro fichas.
 */
const RANURAS_POR_ROTULO = 6

/** Lo que separa el segundo juego de rotulos del primero en una escena a dos columnas. */
export const DESFASE_DE_ROTULOS = 30

/**
 * Una celda del tablero que alterna entre dos textos al ritmo de `fase`.
 *
 * Es como la pantalla enseña mas de lo que cabe: en vez de apretar dos columnas donde hay sitio para
 * una, la misma columna dice una cosa y luego la otra. **Nunca alterna lo que identifica la fila** —el
 * nombre de la persona, el de la Tarea, el del Proyecto—: si el ancla parpadeara, recorrer la columna
 * buscando a alguien seria imposible.
 *
 * Los dos contenidos son **texto plano** y no `ReactNode`: el volteo se dibuja caracter a caracter y un
 * nodo de React no tiene caracteres que voltear. Que lo diga el tipo y no un comentario es lo unico que
 * evita que alguien le pase un componente y se encuentre con una celda vacia en la pared, que nadie ve
 * fallar desde el pasillo.
 *
 * **No lleva `key` por fase, y eso es lo importante.** Sin `key`, React reconcilia posicion por posicion
 * y solo voltean los caracteres que de verdad cambiaron — que es lo que hace un panel mecanico, donde
 * la aleta que ya tiene su letra no gira. Con `key` se remontaria la celda entera y voltearia hasta lo
 * que dice lo mismo en los dos campos.
 *
 * @param principal lo que se ve casi siempre
 * @param alterno   lo que se ve en la fase alterna
 * @param fase      `0` el juego principal, `1` el alterno; lo decide `faseDeDato()`
 */
export function CeldaQueAlterna ({ principal, alterno, fase, sitio, maximo, mayusculas = false, className }: {
  principal: string
  alterno: string
  fase: 0 | 1
  sitio: SitioEnLaOla
  maximo: number
  mayusculas?: boolean
  className?: string
}): ReactNode {
  return (
    <FichaDeTablero
      texto={fase === 0 ? principal : alterno}
      sitio={sitio}
      maximo={maximo}
      mayusculas={mayusculas}
      className={className}
    />
  )
}
