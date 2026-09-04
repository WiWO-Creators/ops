# Sistema de diseño

Look **nuevo**. No se replica el panel actual ni se persigue la paridad visual con Huly que exigía el
módulo M06 de `devoperation`: eso se descartó. Lo que sí se conserva es la **marca** — paleta,
tipografía y las reglas que ya se pelearon una vez.

## De dónde salen los tokens

Fuente: `devoperation-wt-m06-sistema-visual/packages/ui/src/styles/`, que a su vez porta
`frontend/packages/theme/` del fork de Huly con las personalizaciones WiWO ya aplicadas.

Se copian a `src/estilos/`:

| Archivo | Qué trae |
|---|---|
| `tokens.css` | Paleta Neo, motion, escala de espaciado, tamaños de control, radios, sombras |
| `fonts.css` | Los `@font-face` de las tres familias |

Y las fuentes de `apps/web/public/fonts/neo/` a `public/fonts/neo/`.

**Dos archivos del tema portado NO se traen**, y conviene saber por qué:

- **`colors.css`** son 651 variables del sistema de componentes de Huly (`--primary-button-hovered` y
  compañía). Acá no se construyen los componentes de Huly. Se verificó que `tokens.css` es autónomo
  —75 definiciones, cero referencias— y que la dependencia va en el otro sentido, así que descartarlo
  no arrastra nada. Los semánticos se construyen de cero en `neo.css`.
- **`_breakpoints.scss`** no tiene sentido sin Sass, y el proyecto usa Tailwind v4. Sería una tercera
  copia de los mismos cinco números.

**Se copian tal cual, con sus encabezados de licencia** (EPL-2.0 para el tema, OFL para las fuentes).
No se renombra ninguna variable: así, cualquier diferencia entre lo que se ve y lo que se esperaba se
puede comparar con el inspector contra la referencia original.

Esta versión es preferible a `wiwo-board/assets/neo/wiwo.tokens.css` porque ya resolvió los problemas
de accesibilidad de la marca cruda:

- **Rampa de superficies propia** (`--wiwo-surface-0/50/100/300`): blancos con un sesgo violeta mínimo.
  El beige de marca quedó fuera de los paneles grandes porque teñía la aplicación entera.
- **`--wiwo-purple-300`**: `#8D7CFF` sobre la tinta `#292929` da 4.48:1, justo por debajo del AA para
  texto normal. Existe una variante clara para cuando el púrpura tiene que ser texto.
- **`--wiwo-gradient-flow`** arranca y termina en azul, de modo que ninguna posición de la animación
  deja el texto entero en verde claro sobre blanco.

## Capas

```
tokens.css        crudo: la marca no se edita          --wiwo-blue, --spacing-3, --motion-fast
   ↓
neo.css           semánticos del diseño NUEVO          --superficie, --linea, --texto, --acento
   ↓
@theme            mapea los semánticos a Tailwind      bg-superficie, text-texto, border-linea
```

El `@theme` mapea **`neo.css`, no los tokens crudos**. Cambiar el tema es tocar un archivo.

De `tokens.css` se copia literal la **marca** —paleta, motion, espaciado, radios— y
`pruebas/marca.test.js` falla si alguien la toca. Las dos **rampas de superficie** (`--wiwo-surface-*`
y la rampa oscura derivada de la tinta) no vienen del tema portado: las agregó este proyecto para
resolver los problemas de accesibilidad de la marca cruda, y se ajustan cuando el sistema lo pide —
así se calmó el lienzo (ver *El lienzo*).

Es `@theme inline` y no `@theme` a secas: los semánticos son referencias `var()` que cambian con el
tema, y `@theme` congelaría el valor resuelto en tiempo de compilación, dejando el tema oscuro muerto.

### Una definición por token, con `light-dark()`

Cada semántico se declara **una sola vez**:

```css
--superficie: light-dark(var(--wiwo-almost-white), var(--wiwo-ink-900));
```

La alternativa —repetir el bloque entero bajo `prefers-color-scheme` y otra vez bajo
`[data-theme="dark"]`— son dos copias de la misma paleta, y dos copias divergen: alguien ajusta un
gris en una y se olvida de la otra.

Lo que decide qué rama gana es `color-scheme`:

| `color-scheme` | Cuándo | Resultado |
|---|---|---|
| `light dark` | Sin elección guardada | Manda la preferencia del sistema |
| `light` / `dark` | La persona eligió (`[data-theme]`) | Manda su elección |

La elección se guarda en `localStorage` bajo **`wiwo-theme`**, la misma clave que usa
`assets/neo/wiwo.neo.js` del panel actual: quien ya eligió oscuro allá abre `ops-v2` en oscuro sin
volver a elegir. Un script en el `<head>` aplica el atributo antes del primer pintado, así que no hay
destello de tema claro.

## El lienzo

Las ocho pantallas del panel comparten un mismo fondo, y no es un color plano: es un **lienzo** más
una capa de **tres luces de marca**.

| Pieza | Dónde | Qué es |
|---|---|---|
| `--superficie` | `body`, `neo.css` | El lienzo. `#F4F3EE` en claro, `#161715` en oscuro |
| `.aurora::before` | armazón del panel, `globals.css` | Tres resplandores radiales fijos, detrás de todo |
| `--aurora-azul/-beige/-verde` | `neo.css` | La intensidad de cada luz, por tema |

**El lienzo no es el beige.** `--wiwo-beige #F8FAD7` es acento —bandas, callouts, filas zebra, hover
de navegación—; como fondo de pantalla completa teñía la aplicación entera, que es exactamente lo que
el sistema vivo evita. El lienzo claro conserva apenas la calidez (el azul un punto por debajo de los
otros dos canales) y queda tres puntos de luminosidad por debajo de la tarjeta: ese escalón corto es
lo que hace que una tarjeta se despegue sin necesidad de una sombra dura. El lienzo oscuro sigue el
mismo criterio y se calma hacia el casi-negro del sistema vivo, sin llegar al negro puro.

**Las luces van a las esquinas**: azul en el vértice del logotipo y la navegación, cálida arriba a la
derecha, verde en la esquina más lejana al punto donde arranca la lectura. Se apagan antes del
centro, porque el centro es donde vive el contenido y una luz debajo de una tabla es ruido detrás de
datos. El verde es el más tenue de los tres justamente por eso: es el único que cae donde una tabla
larga sigue teniendo filas, y las filas no llevan fondo propio.

**La capa se pinta una sola vez.** Vive en `(panel)/layout.tsx`, es `position: fixed` y no ocupa
lugar, así que no cambia la maqueta de ninguna pantalla. Una `.aurora` anidada dentro de otra apaga
su `::before` (`globals.css`): dos capas fijas pintarían la misma ventana dos veces y cada resplandor
saldría al doble de intensidad.

**Y está quieta.** Ver *Guardrails de rendimiento*.

## Marca

| Token | Valor | Uso |
|---|---|---|
| `--wiwo-blue` | `#4242FF` | Acento primario, foco, enlaces, gráficos |
| `--wiwo-green` | `#3BFF00` | **Sólo relleno**, nunca texto (ver abajo) |
| `--wiwo-purple` | `#8D7CFF` | Acento secundario; `--wiwo-purple-300` cuando es texto |
| `--wiwo-ink` | `#292929` | El color más oscuro del sistema. No hay negro puro |
| `--wiwo-beige` | `#F8FAD7` | Acento cálido puntual. **No** para superficies grandes |

Estados: `--wiwo-ok #1C7A38`, `--wiwo-warning #D88719`, `--wiwo-danger #C3463D`,
`--wiwo-error #B3261E`.

### La regla del verde

`#3BFF00` sobre blanco es ilegible. Regla vigente desde `wiwo-board/assets/neo/wiwo.bridge.css:5-7`:

> El verde nunca como texto sobre claro. Verde = relleno, y su pareja es la tinta.

Cómo se hace cumplir, en vez de confiar en que alguien se acuerde:

- **No existe** ningún token `--texto-verde` en `neo.css`. El verde sólo aparece en tokens
  `--relleno-*`.
- `pruebas/marca.test.ts` parsea `neo.css` y **falla** si alguna declaración `color:` resuelve a
  `--wiwo-green`.

## Tipografía

Tres familias, **self-hosted y subseteadas**. Nunca Google Fonts — ni el CSS ni los `.woff2`.

| Familia | Uso | Archivos |
|---|---|---|
| **Plus Jakarta Sans** | Interfaz | variable 200–800, subsets latin / latin-ext / cyrillic-ext / vietnamese |
| **Outfit** | Titulares | variable 100–900, latin / latin-ext |
| **Tomorrow** | Monoespaciada | 400 / 500 / 600, latin / latin-ext |

Pesos semánticos: cuerpo 400, meta 500, navegación 600, acción 700, titular 800.

## Espaciado, tamaños y radios

Escala `--spacing-0_25` … `--spacing-10` (0.125rem → 7.5rem). Tamaños de control
`--global-min-Size` … `--global-max-Size` (1rem → 4rem).

Radios: tarjeta `--large-BorderRadius` (1rem), control `--control-BorderRadius` (999px, píldora).

**Áreas táctiles**: en `.mobile-theme` los controles suben a 2.75rem (44px). El override se aplica
también a los descendientes (`.mobile-theme *`) porque la escala base se declara con `*`; sin eso cada
hijo se vuelve a pisar el valor con el de escritorio.

## Movimiento

`--wiwo-motion-fast 160ms` · `--wiwo-motion-medium 280ms` · `--wiwo-motion-slow 420ms`.
Curvas: `--wiwo-ease-emphasized cubic-bezier(.2,0,0,1)` y
`--wiwo-ease-expressive cubic-bezier(.2,.8,.2,1)`.

Todo respeta `prefers-reduced-motion`.

## Breakpoints

`480 / 680 / 760 / 1024 / 1208`, en dos lugares: el `@theme` de `globals.css` y
`src/lib/breakpoints.ts`. Hacen falta los dos porque parte del layout se decide en CSS y parte en JS.

`pruebas/breakpoints.test.js` **falla si divergen**. Un layout que decide con 1024 en CSS y con 1023
en JS produce bugs que sólo aparecen en una franja de un píxel, y que nadie reproduce.

## Guardrails de rendimiento

De `wiwo-board/CLAUDE.md`, sección **"Rendimiento en Mac (NO reintroducir)"**. No son preferencias
estéticas: colgaban el panel en pantallas Retina.

1. **Prohibido `backdrop-filter: blur()` en superficies siempre visibles** — barra superior, barra
   lateral, paneles, tablas, menús desplegables.
2. **Prohibidas las animaciones `infinite`** en elementos siempre visibles. El elemento siempre
   visible es el **armazón**: la aurora que vive debajo de las ocho pantallas está quieta y se queda
   quieta. Debajo de una tabla, durante toda la jornada de quien trabaja acá, un movimiento que no
   comunica ningún estado no tiene con qué pagarse.

   La regla habla de lo *siempre* visible, y por eso **una pantalla puede pedir el movimiento para
   sí**. Hoy lo pide una sola: el Inicio, que es la única portada del panel —se mira de paso, no se
   trabaja— y ahí el lienzo en movimiento es la marca presentándose. Lo enciende poniendo
   `.lienzo-vivo` en su raíz, y el armazón responde con la deriva del `::before` y con las luces un
   poco más presentes; el saludo suma el brillo del gradiente de marca sobre su propio texto. Las dos
   animaciones son de esa pantalla y de ninguna otra.

   La frontera es el selector, no la buena voluntad: `.aurora::before` a secas no puede llevar
   `animation` y la deriva no puede existir sin su `:has(.lienzo-vivo)`. Las dos cosas las verifica
   `pruebas/marca.test.js`. Si mañana una segunda pantalla quiere lo mismo, la conversación es si esa
   pantalla es una portada, no si el guardrail aguanta otra excepción.
3. Preferir `transform` y `opacity` sobre `filter` y `box-shadow` animados.

Se hacen cumplir con lint, no con buena voluntad:

- Regla que prohíbe `backdrop-filter` y `blur(` en
  `src/componentes/{estructura,navegacion,superposiciones,datos}/`.
- Regla que prohíbe `animation-iteration-count: infinite` fuera de `src/componentes/estado/`
  (donde vive lo que se desmonta: indicadores de carga puntual).

> El login actual del panel (`views/authentication/login_admin.php:25`) viola la regla 1 a propósito,
> por ser una pantalla transitoria. Ese permiso **no** se hereda: en `ops-v2` la pantalla de acceso
> también respeta el guardrail.

## Inventario de componentes

| Grupo | Componentes |
|---|---|
| **Estructura** | Marco, BarraLateral, BarraSuperior, PanelDetalle, Seccion, Cabecera |
| **Navegación** | Menu, Migas, Pestañas, Paginacion, Buscador (⌘K), SelectorEspacio |
| **Datos** | Tabla, Tablero, Lista, Calendario, LineaDeTiempo, Grafico |
| **Presentadores** | Insignia, Avatar, GrupoAvatares, Etiqueta, Dinero, Fecha, Progreso, EnlaceEntidad |
| **Superposiciones** | Dialogo, Cajon, MenuContextual, Emergente, Tooltip, Confirmacion |
| **Estado** | Cargando, Vacio, Error, SinPermiso, Avisos |
| **Formularios** | Campo, Entrada, AreaTexto, Selector, SelectorMultiple, SelectorRelacion, SelectorFecha, Interruptor, Casilla, Editor, Adjuntos, CampoPersonalizado |

**Los presentadores son la pieza que sostiene la consistencia.** Son lo más repetido del sistema: una
insignia de estado aparece en 47 tablas, 5 tableros y todos los detalles. Si cada pantalla la dibuja a
su manera, no hay sistema de diseño.

**Superposiciones sobre Radix UI**: manejo de foco, `Escape`, `aria` y captura de clics no se
reimplementan. Es exactamente el trabajo que no hay que hacer.

**Mínimo de Fase 1** (~22): Marco, BarraLateral, BarraSuperior, Cabecera, Tabla, Tablero, Dialogo,
Cajon, MenuContextual, Boton, Insignia, Avatar, Etiqueta, Fecha, Cargando, Vacio, Error, Avisos,
Campo, Entrada, AreaTexto, Selector, SelectorRelacion.

Fuera de Fase 1: gráficos, calendario, editor rico (va `AreaTexto`), línea de tiempo.

## El taller

`/taller` cataloga cada componente en sus estados: normal, cargando, vacío, error, deshabilitado,
foco, y en claro y oscuro. No es documentación decorativa — es donde se construye un componente antes
de que exista la pantalla que lo usa, y lo que permite que el carril de diseño avance sin depender de
nadie.

## Qué se tomó del sistema Neo del panel

WiWO ya tenía un design system formalizado —**Neo**, en `wiwo-board/assets/neo/`, 14 archivos y 2.610
líneas— que la primera pasada no usó. Se analizó completo y se tomó lo que faltaba.

Un dato de método que ordena todo lo demás: **se contaron los usos reales de cada token en el panel**.
Buena parte de la capa "expresiva" de Neo es token muerto, y eso decide qué vale portar.

### Lo que se tomó

| Qué | Por qué |
|---|---|
| Escala fluida `--step--1` … `--step-4` | **Cerraba un bug.** `globals.css` ya los usaba sin que existieran |
| Pesos semánticos `--weight-*` | Ídem. Se nombran por rol, no por número |
| Medidas `--measure-*` | En anchos de carácter: una línea de 62ch se lee cómoda en cualquier tamaño |
| Paleta de 8 colores de gráfico | `ops-v2` no tenía **nada** para visualización de datos |
| Tokens de icono y `--disabled-opacity` | Triviales y ausentes |
| Anillo de foco doble | Sólido más halo. Se ve sobre superficies claras y oscuras |
| Reglas de marca del `bridge.css` | Ver abajo |

**Reglas de marca que se codificaron**, aunque su código se descartara:

- Radios con contraste intencional: tarjeta 8 px, control píldora, **input 6 px**, modal 18 px, menú
  12 px. Botón píldora junto a input cuadrado es una decisión, no una inconsistencia: separa
  visualmente "acción" de "dato".
- Encabezados de tabla **sin mayúsculas forzadas**, y cifras con `tabular-nums` — sin eso una columna
  de importes baila al actualizarse, porque el `1` es más angosto que el `8`.
- Avisos con fondo teñido pero **texto siempre en tinta**, nunca texto coloreado.
- `letter-spacing` negativo que escala con el tamaño del titular.
- El anillo de foco cambia de familia de color entre temas: azul en claro, **verde en oscuro**. No es
  un descuido, es que el azul no se despega del fondo oscuro.

### Lo que NO se tomó, y por qué

| Qué | Motivo |
|---|---|
| `wiwo.dark.css` (991 líneas) | 95 % parches de Bootstrap y jQuery, con **402 `!important`**. No redefine un solo semántico: eso ya lo hacen los tokens. En un frontend que consume tokens desde el primer componente, este archivo no debería existir |
| Tokens de glass | **Cero usos**, y el propio `bridge.css` los neutraliza con `!important` por el cuelgue en Retina. Campo minado, no activo |
| `--page-background` | El degradado verde sobre beige. **Cero usos**: nunca se aplicó. Lo que se ve en producción es beige plano. Acá lo resuelve el lienzo con la capa `.aurora`, que es luz y no relleno |
| Tokens de barra lateral | Acoplamiento a un componente. En React eso son props, no tokens globales |
| **El beige como superficie** | Decisión de producto: Neo pinta de beige la página, los paneles y hasta los inputs. Acá el beige queda como acento y las superficies son neutras |

Ratio que resume el problema que se evita: **8 KB de tokens generaron 46 KB de parches de modo
oscuro**. Esa asimetría desaparece cuando los componentes consumen tokens desde el principio.

> Advertencia de arqueología: el `<head>` del panel viejo tiene un bloque "Apple Vision OS" con
> `backdrop-filter: blur(40px)` y una paleta ajena — verde oliva, azul y violeta genéricos. El bridge
> lo neutraliza. **Esa paleta no es WiWO.**

## El orbe

La mascota de la marca y el indicador de carga de la aplicación. Es el activo de Neo que menos se
puede reconstruir de memoria, así que se portó literal.

No es un círculo con un degradado: es un blob cuyo `border-radius` **muta en cada paso** de la
animación, con cinco capas de fondo superpuestas —brillo especular, foco verde, foco azul, remolino
cónico al 220 % y una base opaca que lo mantiene luminoso sobre cualquier fondo— más un velo
desenfocado en modo `screen` y tres destellos con retardos distintos.

El detalle que lo hace ver vivo y no en bucle: **las cinco duraciones son primas entre sí**
(4200 / 6200 / 7200 / 5400 / 2800 ms), así que el ciclo compuesto prácticamente no se repite. Cambiar
una a un número redondo lo vuelve mecánico.

| `tamano` | Medida | Uso |
|---|---|---|
| `chico` | 28 px | Dentro de un botón o una fila |
| `medio` | 56 px | En una tarjeta o una respuesta en línea |
| `grande` | 180 px | Operación que bloquea |
| `marca` | `clamp(245px, 28vw, 410px)` | Cuando el orbe **es** la pantalla: el acceso |

La medida que se le pide es el **hueco que ocupa, halo incluido**: el cuerpo se dibuja al 58 % de esa
caja y el resto queda para el halo. Con `medida` se le pasa cualquier longitud CSS y el orbe se
dimensiona con la caja, que es lo que usa la ventana de carga.

Es `aria-hidden`: **lo que se anuncia es el texto**, dentro de un `role="status"` con
`aria-live="polite"`.

### Un solo lenguaje de carga

No hay esqueletos en el producto. Toda espera se comunica igual: **el orbe dentro de su ventana**
(`Cargando`, en `src/componentes/estado/Estados.tsx`).

La ventana es un panel del sistema —superficie hundida, línea, radio de tarjeta— con `overflow:
hidden`. Hace dos cosas que hay que entender juntas:

1. **Recorta el halo.** El orbe desborda su caja por diseño, y sin recorte se derrama sobre el texto
   de al lado: se lee como una mancha, no como un indicador. En neo.wiwo.me ese recorte lo hace la
   tarjeta del showcase; acá no existía ninguna.
2. **Reserva el hueco** del contenido que viene, con su `alto`, para que la pantalla no salte al
   llegar los datos. Ese era el trabajo de las filas de esqueleto que se retiraron.

Al salir de tokens, el color de la ventana sigue al tema de la aplicación. La superposición que
bloquea usa la misma ventana adentro de su velo.

Hay una tercera forma, para lo contrario: cuando los datos **ya están pintados** y se los está
refrescando —cambiar de página, de filtro, recargar—, taparlos con una ventana sería esconder lo único
útil que hay en pantalla. Ahí van dos cosas juntas: las filas viejas se atenúan y un **chip**
(`CargandoConOrbe`) se pone sobre la esquina diciendo qué pasa. La atenuación sola, sin el chip, se
lee como un fallo. El chip es un chip y no un orbe suelto por el mismo motivo que la ventana es una
ventana: suelto sobre una tabla, el orbe se fusiona con las filas.

Y hay un caso donde el orbe **no** va, aunque haya una petición en curso: los controles optimistas
—la casilla de visibilidad, el selector de estado de una fila— ya pintaron el valor nuevo. No queda
nada que esperar en pantalla; lo único por comunicar es que todavía no está confirmado, y eso lo dicen
`aria-busy` y el control deshabilitado. Un indicador al lado de un valor que ya cambió es el orbe
puesto sin lógica, y además sería un orbe por fila.

Las dos excepciones del orbe sin ventana: dentro de un botón —la píldora ya es su marco— y el orbe de
marca del acceso, que no es un indicador sino la mascota.

### Quieto en reposo, y por qué

El orbe anima en bucle. La regla de rendimiento —la que colgaba el panel en Retina— **prohíbe
animaciones infinitas en elementos siempre visibles**, y una mascota permanente en la barra superior
es exactamente eso. Neo mismo tiene el conflicto: define una variante "calma" con un pulso infinito
para el lanzador de su barra superior.

Resolución: **el orbe sólo se mueve cuando hay algo en curso**. En reposo se pinta quieto, y ni
siquiera se promueve a capa de GPU — promover algo que no se mueve es gastar memoria de video por
nada, y con la mascota siempre presente eso se paga en cada pestaña abierta.

Además comunica mejor: si se moviera siempre, moverse dejaría de significar "está pasando algo".

### El orbe no pide excepción al desenfoque

Sus capas usan `filter: blur()` sobre **capa propia**, que no es `backdrop-filter` y no tiene nada que
ver con desenfocar lo que hay detrás. La versión final de neo apaga el `backdrop-filter`
explícitamente, y el generador borra las declaraciones muertas que lo prendían: la hoja del orbe no
lo enciende en ninguna regla y `pruebas/marca.test.js` lo verifica leyendo el archivo.

La única superficie del sistema con `backdrop-filter` es `.panel-vidrio`, con su propia excepción
declarada. La prohibición general sigue en pie para todo lo que esté siempre en pantalla.

## Decisiones que salieron de construir, no de planear

Cosas que sólo se ven cuando el componente existe:

- **Los colores de estado de Perfex no se usan como fondo.** `#84cc16`, `#0284c7` y compañía fueron
  elegidos para puntos de 8 px en Bootstrap 3, no para contrastar contra texto. `Insignia` los pinta
  como punto y deja el fondo neutro; además, así el contraste no cambia solo cuando alguien edita un
  estado desde el panel.
- **En 24 px va una sola inicial.** Dos letras se cortan, y dentro de un grupo apilado el avatar
  siguiente tapa el borde.
- **El fallback de imagen no alcanza con `onError`.** Si el 404 ocurre antes de la hidratación, React
  todavía no adjuntó el manejador y el evento se pierde para siempre. Hace falta comprobar
  `complete && naturalWidth === 0` al montar. Con rutas viejas en `uploads/`, que en el panel actual
  abundan, ése es el caso normal y no el raro.
- **La fecha visible es la absoluta y la relativa va al tooltip.** En una tabla de plazos, "3 de
  septiembre" se compara entre filas y "en 2 semanas" no.
- **Una fecha sin hora nunca pasa por `new Date('2026-08-24')`.** Eso la interpreta como medianoche
  UTC y en Argentina muestra el día anterior: es el bug de "el vencimiento aparece un día antes".
- **Documentar que un color cumple contraste no lo hace cumplir.** Tres tokens tenían un comentario
  afirmando que corregían AA y la aritmética decía otra cosa: `--texto-acento-2` daba 4.09:1,
  `--texto-aviso` 3.45:1 y `--texto-sutil` 2.67:1. Ahora `pruebas/contraste.test.js` **calcula** la
  relación —resolviendo `color-mix()` y `light-dark()` a un color concreto— y falla por debajo de
  4.5:1. Es la diferencia entre creer y verificar.
- **Un acento tiene que cumplir sobre la superficie más clara donde aparece**, no sobre la más
  oscura. `--wiwo-blue-300` daba 4.55:1 contra el fondo de página oscuro pero 4.17:1 contra una
  tarjeta, que es más clara. De ahí sale `--wiwo-blue-200`.

## Corrección de un bug heredado

El `Tooltip` nuevo cierra por pérdida de foco, por `Escape` y al salir el puntero. El del panel actual
se quedaba pegado (`docs/08` y `docs/15` del fork). **Paridad de marca no significa paridad de bugs.**
