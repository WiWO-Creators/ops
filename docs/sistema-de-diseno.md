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
| `colors.css` | La rampa completa de color |
| `fonts.css` | Los `@font-face` de las tres familias |
| `_breakpoints.scss` | Los cinco cortes, con su prueba de sincronía CSS↔JS |

Y las fuentes de `apps/web/public/fonts/neo/` a `public/fonts/neo/`.

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

`480 / 680 / 760 / 1024 / 1208`. CSS y JavaScript comparten los valores, y
`pruebas/breakpoints.test.ts` **falla si divergen**. Es la prueba que ya existía en M06 y se porta:
un layout que decide en JS con un valor y en CSS con otro produce bugs que sólo aparecen en una franja
de 40px.

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

## Corrección de un bug heredado

El `Tooltip` nuevo cierra por pérdida de foco, por `Escape` y al salir el puntero. El del panel actual
se quedaba pegado (`docs/08` y `docs/15` del fork). **Paridad de marca no significa paridad de bugs.**
