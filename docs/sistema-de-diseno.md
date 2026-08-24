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
tokens.css        crudo, copiado, no se edita          --wiwo-blue, --spacing-3, --motion-fast
   ↓
neo.css           semánticos del diseño NUEVO          --superficie, --linea, --texto, --acento
   ↓
@theme            mapea los semánticos a Tailwind      bg-superficie, text-texto, border-linea
```

El `@theme` mapea **`neo.css`, no los tokens crudos**. Cambiar el tema es tocar un archivo.

Es `@theme inline` y no `@theme` a secas: los semánticos son referencias `var()` que cambian con el
tema, y `@theme` congelaría el valor resuelto en tiempo de compilación, dejando el tema oscuro muerto.

### Una definición por token, con `light-dark()`

Cada semántico se declara **una sola vez**:

```css
--superficie: light-dark(var(--wiwo-surface-100), #17171a);
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
2. **Prohibidas las animaciones `infinite`** en elementos siempre visibles.
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

## Corrección de un bug heredado

El `Tooltip` nuevo cierra por pérdida de foco, por `Escape` y al salir el puntero. El del panel actual
se quedaba pegado (`docs/08` y `docs/15` del fork). **Paridad de marca no significa paridad de bugs.**
