import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { PASOS_POR_GLIFO, TOPE_DE_ESCALON_GLIFO, cintaDeRodillo, rodilloDeTexto } from '@/dominio/solari'

/**
 * Un texto que voltea caracter a caracter, como un panel de Solari di Udine.
 *
 * Es la tercera pata del efecto: la primera es `src/dominio/solari.ts` —que decide por que glifos pasa
 * cada posicion, y se prueba sin navegador— y la segunda son los `@keyframes` de `pantalla.css`. Las
 * tres hay que leerlas juntas.
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
 * agrega ninguno.
 *
 * === QUE LO DISPARA ===
 *
 * El `key` de cada hueco es `posicion:caracter`. Cuando el texto cambia, React remonta **solo las
 * posiciones cuyo caracter cambio** y el CSS vuelve a correr ahi y nada mas. Un reloj que pasa de
 * `14:32` a `14:33` voltea un caracter, no cinco — que es literalmente lo que hace el panel de verdad,
 * y ademas es lo que hace el efecto barato. Por eso el componente es puro y no lleva `use client`: no
 * necesita recordar el texto anterior, porque el reconciliador de React ya lo sabe.
 *
 * === LAS DOS RESTRICCIONES DE USO ===
 *
 * **El ancho de cada hueco es fijo (`1ch`), asi que el texto sale monoespaciado.** No hay alternativa:
 * el hueco tiene que reservar su sitio antes de que empiece a girar, porque el marco de la pantalla es
 * `h-dvh` con `overflow: hidden` y lo que no entra desaparece sin barra de scroll que lo delate. Por
 * eso el efecto se reserva a textos cortos y de ancho previsible —relojes, cifras, rotulos en
 * versalitas— y NO se usa en los nombres de personas, Tareas ni Proyectos, que son el ancla con la que
 * se recorre el tablero con la vista y estan medidos al milimetro en `pantalla.css`.
 *
 * **Ocupa la linea entera.** Un hueco con `overflow: hidden` no tiene una linea base util, asi que no
 * se puede mezclar con texto hermano en el mismo renglon sin que uno de los dos flote. Se usa como
 * contenido unico de su celda.
 *
 * === LECTORES DE PANTALLA Y SELECCION ===
 *
 * Los huecos son `aria-hidden` y `user-select: none`: lo que se lee y lo que se copia es el `<span>`
 * plano de al lado, que dice el texto final y nunca la sopa de caracteres intermedios.
 *
 * @param texto     lo que tiene que quedar en pantalla cuando el rodillo se detenga
 * @param className clases del contenedor; el cuerpo de letra y el color se heredan de ahi
 */
export function TextoSolari ({ texto, className }: { texto: string, className?: string }): ReactNode {
  const glifos = rodilloDeTexto(texto)

  return (
    <span className={cn('solari', className)} style={PASOS}>
      <span className="sr-only">{texto}</span>

      <span aria-hidden="true">
        {glifos.map((posicion, indice) => (
          <span
            // `posicion:caracter`, y no el indice a secas: es lo unico que hace que un caracter que no
            // cambio NO se remonte y por lo tanto NO vuelva a animarse. Ver el docblock de arriba.
            key={`${indice}:${posicion.glifo}`}
            className="solari-hueco"
            style={ESCALONES[posicion.escalon]}
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
 * El retardo de cada posicion, precalculado y compartido.
 *
 * Los escalones son un puñado de valores distintos —`TOPE_DE_ESCALON_GLIFO` acota cuantos—, asi que
 * los objetos de estilo se arman UNA vez al cargar el modulo y se reparten por referencia. Un objeto
 * nuevo por caracter y por render serian cientos de asignaciones por fotograma en una pared que lleva
 * meses encendida, y ademas romperia cualquier memoizacion aguas arriba.
 */
const ESCALONES: CSSProperties[] = Array.from(
  { length: TOPE_DE_ESCALON_GLIFO + 1 },
  (_, escalon) => ({ '--glifo': escalon }) as CSSProperties
)

/**
 * Cuantos saltos da la cinta, para que el CSS lo sepa.
 *
 * Va por variable y no escrito en `pantalla.css` porque el numero manda dos cosas a la vez: cuantas
 * lineas tiene la cinta —que decide el dominio— y cuanto la desplaza la animacion. Escritos en dos
 * sitios, el dia que uno cambie el rodillo se para en el glifo equivocado y la pared se queda
 * mintiendo, que es el fallo mas caro posible acá: nadie lo ve mirando.
 */
const PASOS = { '--pasos': PASOS_POR_GLIFO } as CSSProperties
