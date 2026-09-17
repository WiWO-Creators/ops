import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { TOPE_DE_GLIFOS, cintaDeRodillo, rodilloDeTexto } from '@/dominio/solari'

/**
 * Un texto que voltea caracter a caracter, como un panel de Solari di Udine.
 *
 * Es la tercera pata del efecto: la primera es `src/dominio/solari.ts` —que decide por que glifos pasa
 * cada posicion, cuanto recorre y cuanto ancho reserva, y se prueba sin navegador— y la segunda son los
 * `@keyframes` de `pantalla.css`. Las tres hay que leerlas juntas.
 *
 * === COMO SE DIBUJA UN RODILLO SIN UN SOLO TEMPORIZADOR ===
 *
 * Cada posicion es un hueco de alto y ancho fijos con `overflow: hidden`, y dentro una cinta de texto
 * de varias lineas —el destino arriba, los intermedios debajo en orden inverso— con `white-space:
 * pre`. La animacion arrastra la cinta con `translateY` y `steps()`, asi que salta de glifo a glifo sin
 * pasar por medias tintas, y termina en `transform: none`: el estado de reposo es el natural del
 * elemento, la animacion desaparece y el navegador puede soltar la capa de composicion.
 *
 * Es una sola propiedad animada, `transform`, que compone la GPU. Cero layout, cero repaint, cero
 * temporizadores. La pantalla tiene UN reloj —el latido de 250 ms de `proyeccion.ts`— y este efecto no
 * agrega ninguno. **Fuera del volteo no hay `perspective` ni filtros**: la ficha quieta es un bloque de
 * texto y nada mas, que es lo que permite dejar la pared encendida durante meses.
 *
 * === POR QUE UNA CINTA Y NO LAS CUATRO MITADES DE UN SPLIT-FLAP ===
 *
 * El gesto fiel de una aleta son cuatro medias fichas con `rotateX` —la vieja que cae y la nueva que
 * asienta—. Se descarto, y no por gusto: esas cuatro mitades existen SOLO durante el giro, asi que hay
 * que saber cuando termina cada una para devolverlas a un bloque estatico, y eso es estado y un
 * temporizador por ficha. Esta pantalla no puede tenerlos: se casteaba a un televisor, el navegador
 * estrangula los temporizadores de una pestaña oculta a uno por minuto, y por eso todo el modulo cuelga
 * de un unico latido en un worker. Una animacion CSS no se estrangula; un `requestAnimationFrame` por
 * ficha, si.
 *
 * Lo que si se conserva de ese gesto es el **rebote de asentamiento**: el hueco sobrepasa y vuelve al
 * terminar el giro. Es lo que separa una ficha mecanica de un contador digital, y sale de una segunda
 * animacion sobre un elemento que ya existia.
 *
 * === QUE LO DISPARA ===
 *
 * El `key` de cada hueco es `posicion:caracter`. Cuando el texto cambia, React remonta **solo las
 * posiciones cuyo caracter cambio** y el CSS vuelve a correr ahi y nada mas. Un reloj que pasa de
 * `14:32` a `14:33` voltea un caracter, no cinco — que es literalmente lo que hace el panel de verdad,
 * y ademas es lo que hace el efecto barato. Por eso el componente es puro y no lleva `use client`: no
 * necesita recordar el texto anterior, porque el reconciliador de React ya lo sabe.
 *
 * === LA RESTRICCION DE USO ===
 *
 * **Ocupa la linea entera.** Un hueco con `overflow: hidden` no tiene una linea base util, asi que no
 * se puede mezclar con texto hermano en el mismo renglon sin que uno de los dos flote. Se usa como
 * contenido unico de su celda.
 *
 * Y no se anida dentro de otro contenedor que se este animando: dos `transform` encadenados se componen
 * y el volteo sale torcido. Es la razon por la que las filas del tablero dejaron de voltear enteras con
 * `rotateX` cuando pasaron a llevar Solari dentro: los dos gestos contaban lo mismo y no podian
 * convivir.
 *
 * === LECTORES DE PANTALLA Y SELECCION ===
 *
 * Los huecos son `aria-hidden` y `user-select: none`: lo que se lee y lo que se copia es el `<span>`
 * plano de al lado, que dice el texto final y nunca la sopa de caracteres intermedios. Es un nodo mas
 * que un `role="img"` con `aria-label`, y se paga a gusto: un `aria-label` lo anuncia un lector de
 * pantalla pero no se puede seleccionar ni copiar, y el texto de esta pared tiene que ser texto.
 *
 * === LA ESTETICA DE ALETA ===
 *
 * Con `ficha` cada hueco se dibuja como lo que imita: fondo propio, esquina apenas redondeada, una
 * junta que lo separa del de al lado y **la linea de pliegue horizontal a media altura**, que es la
 * firma visual de un Solari — sin ella el efecto se lee como texto animado y no como un panel
 * mecanico.
 *
 * El pliegue es UNA sola linea por celda y no una por ficha: es un `::after` del contenedor, asi que
 * la estetica completa no cuesta ni un elemento mas de DOM en un tablero que ya tiene mil cuatrocientos
 * huecos. El fondo y la junta son propiedades del hueco, que existia de todos modos.
 *
 * Sin `ficha` el texto queda sobrio: voltea igual, pero sin fondo ni junta. Es lo que lleva la columna
 * del nombre, que es la larga; ver el docblock de `textoDeFicha()` en el dominio.
 *
 * @param texto     lo que tiene que quedar en pantalla cuando el rodillo se detenga
 * @param uniforme  si todas las fichas miden lo mismo, para que dos celdas de la misma columna del
 *                  tablero caigan alineadas; ver `ANCHO_DE_COLUMNA` en `pantalla.css`
 * @param ficha     si se dibuja la estetica de aleta: fondo, junta y linea de pliegue
 * @param tope      cuantos caracteres voltean como mucho; `0` deja la tira entera quieta
 * @param desdeElFinal si el presupuesto de volteo se gasta por la cola; es lo que quiere un contador
 * @param onda      en que ranura de la ola del tablero arranca esta celda; ver `ondaDeFicha()`
 * @param className clases del contenedor; el cuerpo de letra y el color se heredan de ahi
 */
export function TextoSolari ({
  texto, uniforme = false, ficha = false, tope = TOPE_DE_GLIFOS, desdeElFinal = false, onda = 0, className
}: {
  texto: string
  uniforme?: boolean
  ficha?: boolean
  tope?: number
  desdeElFinal?: boolean
  onda?: number
  className?: string
}): ReactNode {
  const glifos = rodilloDeTexto(texto, tope, desdeElFinal)

  return (
    <span className={cn('solari', ficha && 'solari-mecanico', className)} style={estiloDeTira(onda)}>
      <span className="sr-only">{texto}</span>

      <span aria-hidden="true">
        {glifos.map((posicion, indice) => (
          <span
            // `posicion:caracter`, y no el indice a secas: es lo unico que hace que un caracter que no
            // cambio NO se remonte y por lo tanto NO vuelva a animarse. Ver el docblock de arriba.
            key={`${indice}:${posicion.glifo}`}
            // `solari-gira` SOLO donde hay rodillo. El rebote de asentamiento cuelga de esa clase, y
            // sin ella el navegador crearia una animacion por hueco: mil trescientas en el tablero
            // denso, la mayoria para no mover una ficha que no gira. Medido, esa sola diferencia era
            // un salto de 433 ms al montar la escena.
            className={cn('solari-hueco', posicion.rodillo !== null && 'solari-gira')}
            style={estiloDeHueco(posicion.escalon, posicion.rodillo?.length ?? 0, uniforme ? 0 : posicion.ancho)}
          >
            {posicion.rodillo === null
              ? posicion.glifo
              : <span className="solari-rodillo">{cintaDeRodillo(posicion.rodillo)}</span>}
          </span>
        ))}
      </span>
    </span>
  )
}

/**
 * El estilo del contenedor: en que ranura de la ola arranca esta celda.
 *
 * Mismo cache que `estiloDeHueco()` y por el mismo motivo: en un tablero de quince filas por seis
 * columnas son noventa celdas por render, y las ranuras se repiten entre paginas porque solo dependen
 * de la posicion. Un objeto nuevo por celda y por fotograma es exactamente lo que no se le puede pedir
 * a una pared encendida durante meses.
 *
 * `0` no emite nada: es el caso de los dos relojes sueltos, que no estan en ninguna ola.
 */
function estiloDeTira (onda: number): CSSProperties | undefined {
  if (onda <= 0) return undefined

  const guardado = TIRAS.get(onda)

  if (guardado !== undefined) return guardado

  const estilo = { '--onda': onda } as CSSProperties

  TIRAS.set(onda, estilo)

  return estilo
}

/** El cache de `estiloDeTira()`. Ver su docblock. */
const TIRAS = new Map<number, CSSProperties>()

/**
 * Los estilos en linea de un hueco, compartidos entre todos los que coinciden.
 *
 * Son tres numeros —escalon, pasos y ancho— y los tres salen de conjuntos chicos, asi que las
 * combinaciones distintas que llega a ver una pantalla son unas pocas decenas. Se guardan en un mapa a
 * nivel de modulo y se reparten por referencia: en regimen no se asigna ni un objeto por fotograma, que
 * es lo que hay que exigirle a algo que dibuja cientos de elementos en una pared encendida meses.
 *
 * `ancho` en `0` significa ficha uniforme: no se emite la variable y el CSS cae a su ancho de columna.
 *
 * @param escalon cuanto se retrasa esta posicion
 * @param lineas  cuantas lineas tiene su cinta; `0` si no voltea
 * @param ancho   el ancho en `em`, o `0` para el uniforme
 */
function estiloDeHueco (escalon: number, lineas: number, ancho: number): CSSProperties {
  const clave = `${escalon}|${lineas}|${ancho}`
  const guardado = ESTILOS.get(clave)

  if (guardado !== undefined) return guardado

  const estilo = {
    '--glifo': escalon,
    // Los PASOS son las lineas menos la del destino: es lo que la animacion tiene que desplazar y
    // tambien cuanto dura, porque todas las fichas giran a la misma velocidad.
    '--pasos': Math.max(lineas - 1, 0),
    ...(ancho > 0 ? { '--ancho': `${ancho}em` } : {})
  } as CSSProperties

  ESTILOS.set(clave, estilo)

  return estilo
}

/** El cache de `estiloDeHueco()`. Ver su docblock. */
const ESTILOS = new Map<string, CSSProperties>()
