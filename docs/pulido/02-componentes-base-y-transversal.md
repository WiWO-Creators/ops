# Pulido — Componentes base y patrones transversales

Auditoría de pulido de la capa base y transversal de «WiWO Ops»: `src/componentes/{estado,superposiciones,presentadores,formularios,datos,estructura,paleta,avisos,fijados,push,calidad}/`, `src/estilos/`, `src/app/globals.css`, `src/lib/`, `src/app/(panel)/layout.tsx`, `src/app/(panel)/error.tsx` y `src/app/taller/`. Búsquedas transversales sobre todo `src/` exclusivamente para verificar adopción y fugas de abstracción.

El frente presenta bases arquitectónicas sólidas: 0 `console.log`, 0 `animate-spin` genéricos (el Orbe de Thinking rige la carga viva), manejo de huso horario unificado (`ZONA_NEGOCIO = 'America/Santiago'`), ausencia de `href="#"` y un catálogo de primitivos Radix bien encapsulado. No obstante, conviven brechas notables frente a la vara de diseño y movimiento: superposiciones sin salida animada, 6 llamadas a `window.confirm()` en flujos críticos, 88 duraciones literales (`duration-N`) ignorando los tokens `--wiwo-motion-*`, ausencia de primitivas canónicas documentadas en `sistema-de-diseno.md` (Tooltip/Casilla/Dinero/Área de Texto) y un banco de pruebas (`/taller`) incompleto que no expone estados de error, validación o controles relacionales.

Todas las rutas son relativas a `ops-v2/`.

---

## Inconsistencias

### P2-01 Diálogos nativos `window.confirm()` en lugar de primitivos de confirmación accesibles (resuelto en 6072d52)
- **Dónde**: `src/componentes/proyecto/DetalleActa.tsx:520`, `src/componentes/proyecto/acta/TareasPropuestas.tsx:410`, `src/componentes/prospecto/FlujoLicitacion.tsx:127`, `src/componentes/prospecto/FlujoLicitacion.tsx:355`, `src/app/s/[clave]/Tablero.tsx:109`
- **Qué pasa**: Existen 5 ejecuciones reales y verificadas de `window.confirm()` y `confirm()` en el navegador. Interrumpen el hilo de renderizado, carecen de estilos de diseño WiWO, no atrapan el foco conforme a WCAG y presentan un diálogo bloqueante del sistema operativo. Esto ocurre existiendo ya en la base `ConfirmarBorrado.tsx` y `ConfirmacionEnLinea.tsx`.
- **Propuesta**: Sustituir cada llamada por `ConfirmacionEnLinea` (para acciones contextuales en filas/tableros) o por `ConfirmarBorrado` / `Dialogo` `ancho="chico"` con botones destructivos declarativos.
- **Prioridad**: Alta · **Esfuerzo**: S

### P2-02 Divergencia de animación de entrada en filas entre `TablaRecurso` y tablas base (resuelto en fe61c2c y ce52e6d)
- **Dónde**: `src/componentes/datos/TablaRecurso.tsx:492-511` vs. `src/componentes/datos/Tabla.tsx:102-120` (y usos directos en `src/app/(panel)/papelera/page.tsx:288`, `src/componentes/proyecto/PanelContactos.tsx:162`, `src/componentes/proyecto/PanelArchivos.tsx:142`)
- **Qué pasa**: `TablaRecurso` dota a cada fila de animación de entrada escalonada (`animate-entrar-abajo` con `animationDelay: ${i * 20}ms`), mientras que `Tabla.tsx` y las pantallas que la instancian directamente montan las filas de golpe, sin delay ni animación unificada.
- **Decisión (30-09-2026)**: la coreografía común es `EntradaEscalonada` (ver P1-26 en `01-proyecto-y-tareas.md`), no `animate-entrar-abajo` con retraso por fila.
- **Propuesta**: Que `Tabla.tsx` adopte `EntradaEscalonada` (filas con `data-entrada="item"`) y `TablaRecurso` deje su retraso propio, para que toda tabla entre igual.
- **Prioridad**: Media · **Esfuerzo**: M

### P2-03 Desplegables de filtrado manual con `<select>` nativo junto a selectores Radix
- **Dónde**: `src/componentes/datos/ControlesTabla.tsx:590-620` (`FiltroCampo`)
- **Qué pasa**: Mientras los filtros de selección masiva y menús usan Radix UI estilizado con tokens neo, el componente `FiltroCampo` recurre a la etiqueta `<select>` nativa de HTML con estilos parciales. Rompe la uniformidad tipográfica, el redondeo de esquina y carece de coreografía de apertura/cierre.
- **Propuesta**: Migrar `FiltroCampo` a `Selector` (`@/componentes/formularios/Selector.tsx`), reutilizando `DisparadorSelector` y `ContenidoSelector`.
- **Prioridad**: Media · **Esfuerzo**: S

### P2-04 Variantes de avatar con cálculos ad-hoc y clases de texto arbitrarias
- **Dónde**: `src/componentes/presentadores/Avatar.tsx:8-14, 57-65` vs. `src/componentes/presentadores/ImagenEntidad.tsx:48-60`
- **Qué pasa**: `Avatar.tsx` define una escala interna con tamaños arbitrarios (`size-5`, `size-7`, `size-9`, `text-[0.6875rem]`, `text-[0.8125rem]`), mientras que `ImagenEntidad` utiliza `tamano="chico" | "medio" | "grande"` y resuelve un cuadrado con iniciales o logo de cliente con diferente espaciado y tipografía.
- **Propuesta**: Unificar `Avatar` e `ImagenEntidad` bajo un mismo contrato de diseño (`tamano="chico" | "medio" | "grande"` o escala basada en variables de sistema `--step-*`), compartiendo la resolución de iniciales y fallback visual.
- **Prioridad**: Media · **Esfuerzo**: S

### P2-05 Indicador de carga asíncrona: dualidad entre Orbe de Thinking y spinners/pulsos
- **Dónde**: `src/componentes/estado/Estados.tsx:16-36` (`Cargando`), `src/componentes/ia/OrbeThinking.tsx` vs. `src/componentes/proyecto/MenuEstadoProyecto.tsx:123`
- **Qué pasa**: El estándar visual de carga viva del proyecto es el Orbe (`OrbeThinking` / `Orbe` de 3 capas), pero en componentes aislados conviven `animate-pulse` infinito en insignias y barras de esqueleto sin unificar.
- **Propuesta**: Mantener el Orbe como único indicador dinámico de carga viva, consolidar `Cargando` en `Estados.tsx` y asegurar que `Skeleton` use transiciones de brillo sutil sin violar el guardrail de animación perpetua no deseada.
- **Prioridad**: Baja · **Esfuerzo**: S

---

## Duplicación

### P2-06 `thinking-orb.css`: tamaño alto, pero sin código muerto verificado
- **Dónde**: `src/estilos/thinking-orb.css` (2.386 líneas, 39 `@keyframes`), consumido por `src/componentes/estado/Orbe.tsx`.
- **Verificación**: la versión original de este hallazgo citaba clases (`.neo-surface-orb`, `.orb-glow-layer-3`) y un `OrbeThinking.tsx` que no existen. Comprobado: las 23 clases raíz del archivo se usan en TSX y los estados `data-thinking-state` se emiten todos salvo, posiblemente, `retry` (sin literal `'retry'` en `componentes/estado`, `componentes/ia` ni `dominio`).
- **Propuesta**: No purgar a ciegas. Solo confirmar si el estado `retry` tiene emisor; si no, borrar su bloque. El resto es el orbe portado de Neo y está vivo.
- **Prioridad**: Baja · **Esfuerzo**: S

### P2-07 Multiplicidad de selectores relacionales divergentes sobre Menú Contextual
- **Dónde**: `src/componentes/formularios/SelectorEtiquetas.tsx`, `src/componentes/formularios/SelectorPersonas.tsx`, `src/componentes/formularios/SelectorClientes.tsx`, `src/componentes/formularios/SelectorEspacios.tsx`, `src/componentes/formularios/SelectorDePersona.tsx`
- **Qué pasa**: Existen 5 componentes separados que reimplementan de forma casi idéntica: caja de búsqueda con filtro en cliente, scroll interno con altura fija, lista de elementos seleccionables con tick/checkbox y disparador con `Boton`. Cada uno maneja su propio estado de apertura y filtrado.
- **Propuesta**: Extraer una primitiva transversal `SelectorBuscableMultiple<T>` o `SelectorRelacion<T>` en `src/componentes/formularios/`, documentada como tal en el sistema de diseño, dejando a los selectores concretos como simples configuraciones de adaptador.
- **Prioridad**: Alta · **Esfuerzo**: M

### P2-08 Duplicación de tokens entre `tokens.css`, `neo-tokens.css`, `neo.css` y `globals.css`
- **Dónde**: `src/estilos/tokens.css`, `src/estilos/neo-tokens.css`, `src/estilos/neo.css` y `src/app/globals.css:1-150`
- **Qué pasa**: Se conservan remanentes de tokens heredados de Huly (`tokens.css` define `--spacing-1` a `--spacing-24`, `--font-sans`, escalas fijas en píxeles), variables en `neo-tokens.css` y la declaración `@theme inline` en `globals.css`. Esta redundancia produce ambigüedad sobre cuál es la fuente de verdad de espaciado y radios.
- **Propuesta**: Eliminar `tokens.css` y consolidar las variables de color, elevación y timing exclusivamente en `globals.css` bajo la directiva unificada `@theme` de Tailwind v4.
- **Prioridad**: Media · **Esfuerzo**: M

### P2-09 Lógica duplicada de formateo de fechas relativas y vencimientos
- **Dónde**: `src/lib/fechas.ts:98-180` vs. `src/componentes/presentadores/Fecha.tsx:30-75` vs. `src/componentes/datos/tabla.ts:40-90`
- **Qué pasa**: Se repite la deducción de si una fecha está vencida ("vence hoy", "vencido hace N días") y la asignación del color semántico (`text-error`, `text-alerta`, `text-texto-tenue`) tanto en helpers de tabla como en el presentador `Fecha` y en utilidades de dominio.
- **Propuesta**: Centralizar la lógica y las clases de severidad temporal en `src/lib/fechas.ts` (`describirVencimiento(fecha)`) y consumir dicho contrato en `Fecha.tsx` y `tabla.ts`.
- **Prioridad**: Baja · **Esfuerzo**: S

---

## Sin terminar

### P2-10 Componentes canónicos prometidos en el Sistema de Diseño que no existen en el código
- **Dónde**: `docs/sistema-de-diseno.md` (§ Inventario de componentes: `Tooltip`, `Casilla`, `AreaTexto`, `Dinero`, `Progreso`, `PanelDetalle`)
- **Qué pasa**: La documentación del sistema de diseño lista componentes base que no están exportados como módulos independientes:
  - `Tooltip`: no existe como componente de superposición (se usa el atributo nativo `title` o hacks con `group-hover`).
  - `Casilla`: solo existe la constante string `CLASES_CASILLA` sobre inputs no controlados.
  - `AreaTexto`: vive subsumido dentro de `Entrada.tsx` sin tipado ni exportación semántica diferenciada.
  - `Dinero`: solo existe como función de formateo (`formatearImporte`).
  - `Progreso`: no existe componente general, solo `BarraProgreso` acoplada a `CabeceraProyecto`.
- **Decisión (30-09-2026)**: corregir el inventario de `docs/sistema-de-diseno.md` a lo que existe (verificado: tampoco existen `PanelDetalle`, `Emergente`, `Migas` ni `Paginacion`). Crear un primitivo solo si hay 3 o más usos reales hechos a mano que lo justifiquen, y anotarlo.
- **Prioridad**: Alta · **Esfuerzo**: S

### P2-11 `TarjetaFlotantePersona` monta en `createPortal` sin animación ni transición (resuelto en 4fe6376)
- **Dónde**: `src/componentes/presentadores/TarjetaFlotantePersona.tsx:85-115`
- **Qué pasa**: La ficha flotante al pasar el cursor sobre un enlace de persona se teletransporta directo a `document.body` mediante `createPortal`, pero aparece y desaparece en 0ms, sin `animate-aparecer` ni transición de opacidad/escala, viéndose rígida y sin pulir.
- **Propuesta**: Incorporar `animate-aparecer` (o `animate-entrar-escala` rápido de 120ms) y encapsular su salida o cierre suave respetando `prefers-reduced-motion`.
- **Prioridad**: Media · **Esfuerzo**: S

### P2-12 El catálogo `/taller` no cubre la totalidad de componentes y estados del sistema
- **Dónde**: `src/app/taller/page.tsx:1-260`
- **Qué pasa**: `/taller` se diseñó como el showroom y catálogo de diseño interno, pero solo muestra Insignias, Avatares, Botones básicos, un Diálogo simple y una Tabla fija. No expone:
  - Estados de formulario: deshabilitado, validación con error (`aria-invalid`), guardando/cargando.
  - Componentes de superposición: `Cajon`, `MenuContextual`, `TarjetaFlotantePersona`, `ConfirmarBorrado`.
  - Componentes relacionales: `SelectorEtiquetas`, `SelectorPersonas`, `SelectorClientes`.
  - Estados de SLA (`EstadoSla`), Copiado (`BotonCopiar`, `BloqueCopiable`) ni banners de calidad/push.
- **Propuesta**: Expandir `/taller` con secciones dedicadas a formularios completos (estados disabled, invalid, submit), overlays y presentadores complejos.
- **Prioridad**: Media · **Esfuerzo**: M

---

## Refinamiento

### P2-13 Ausencia de `aria-label` estricto en botones con `soloIcono` (resuelto en 6072d52)
- **Dónde**: `src/componentes/formularios/Boton.tsx:18-45`
- **Qué pasa**: El componente `Boton` admite la propiedad `soloIcono?: boolean`, pero la interfaz TypeScript `PropsBoton` extiende libremente de `ButtonHTMLAttributes<HTMLButtonElement>` sin hacer obligatorio el atributo `aria-label` cuando no hay texto visible (`children` es un icono).
- **Propuesta**: Utilizar tipos discriminados en TypeScript: si `soloIcono: true`, requerir obligatoriamente `aria-label: string`.
- **Prioridad**: Alta · **Esfuerzo**: S

### P2-14 Paginación manual fragmentada fuera de `TablaRecurso`
- **Dónde**: `src/componentes/datos/PaginacionTabla.tsx` frente a `src/app/(panel)/papelera/page.tsx:295-320` y `src/componentes/proyecto/PanelArchivos.tsx`
- **Qué pasa**: `PaginacionTabla` está fuertemente acoplada a parámetros URL (`?pagina=`), por lo que vistas con paginación local en memoria o con listas independientes reimplementan botones "Anterior / Siguiente" con estilos y espaciados artesanales.
- **Propuesta**: Desacoplar `PaginacionTabla` en dos variantes: una conectada a URL (`PaginacionUrl`) y una controlada pura (`PaginacionControlada` con `pagina`, `totalPaginas`, `onChange`).
- **Prioridad**: Media · **Esfuerzo**: S

### P2-15 Inconsistencia en la presentación de estados vacíos contextuales
- **Dónde**: `src/componentes/estado/Estados.tsx:38-65` (`Vacio`) vs. `src/componentes/proyecto/LineaDeActividad.tsx:42-45` vs. `src/componentes/datos/TablaRecurso.tsx:440-455`
- **Qué pasa**: `Vacio` en `Estados.tsx` tiene un diseño estándar con orbe tenue y tipografía centrada. No obstante, en ciertas subpantallas y tablas se usan textos planos o estructuras `div` sin icono, perdiendo la identidad gráfica del sistema.
- **Propuesta**: Exigir el uso exclusivo de `Vacio` para cualquier contenedor sin datos, permitiendo configurar acción primaria opcional (`accion?: ReactNode`).
- **Prioridad**: Baja · **Esfuerzo**: S

---

## Animaciones faltantes

### P2-16 Desconexión de animación de salida en `OrbeChatIA` (resuelto en 4fe6376)
- **Dónde**: `src/componentes/ia/OrbeChatIA.tsx:210-240`
- **Qué pasa**: La ventana flotante del asistente IA entra suavemente con `animate-entrar-abajo`, pero al cerrarse se desmonta instantáneamente en React sin ejecutar una animación inversa (`animate-salir-abajo` o fade-out), resultando en un cierre abrupto.
- **Propuesta**: Implementar transición con Radix `Presence` o clase de salida antes de desmontar el componente al pulsar cerrar o presionar `Escape`.
- **Prioridad**: Alta · **Esfuerzo**: S

### P2-17 `Interruptor.tsx`: animación de cambio de estado basada en duración genérica (resuelto en 4fe6376)
- **Dónde**: `src/componentes/formularios/Interruptor.tsx:42-56`
- **Qué pasa**: El desplazamiento del círculo del switch (`role="switch"`) utiliza `transition-transform duration-150` de Tailwind en lugar de la curva y tiempo de movimiento unificados del sistema (`--wiwo-ease-emphasized`, `--wiwo-motion-fast`).
- **Propuesta**: Aplicar `ease-neo duration-rapida` (o `transition-transform duration-rapida ease-neo`) para que el rebote y la inercia coincidan con el resto de los componentes interactivos.
- **Prioridad**: Baja · **Esfuerzo**: S

### P2-18 Ausencia de transición en acordeones y paneles colapsables (resuelto en 4fe6376)
- **Dónde**: `src/componentes/proyecto/acta/Paso.tsx:70-92`, `src/componentes/proyecto/HistorialDeAprobaciones.tsx:105-120`
- **Qué pasa**: Aunque el chevron de apertura rota con `rotate-180`, el contenedor colapsable subyacente se oculta/muestra alternando `{abierto && <div>...</div>}` sin animación de altura ni fundido.
- **Propuesta**: Usar el patrón CSS de `grid-template-rows: 0fr -> 1fr` con transición en `duration-rapida ease-neo` para un despliegue suave sin JavaScript invasivo.
- **Prioridad**: Media · **Esfuerzo**: M

---

## Deuda técnica

### P2-19 Dispersión de valores arbitrarios de `z-index` sin escala centralizada
- **Dónde**: `src/componentes/estructura/RecorridoDeNovedades.tsx:112` (`z-[70]`), `src/componentes/estructura/CapaDeBienvenida.tsx:76` (`z-[70]`), `src/componentes/avisos/AvisosDeError.tsx:248` (`z-[55]`), `src/componentes/avisos/aviso-de-error.ts:16`
- **Qué pasa**: En lugar de respetar una escala semántica (`z-base`, `z-fijo`, `z-desplegable`, `z-dialogo`, `z-toast`, `z-tooltip`), se introducen valores literales como `z-[55]` y `z-[70]` para superponer elementos a ciegas.
- **Propuesta**: Tipar e incorporar las capas en Tailwind/CSS (`--z-toast: 50`, `--z-modal: 60`, `--z-onboarding: 70`) y prohibir clases arbitrarias `z-[*]` mediante regla de linting.
- **Prioridad**: Media · **Esfuerzo**: S

### P2-20 Uso residual de tamaños de texto arbitrarios `text-[...px]` rompiendo la escala tipográfica
- **Dónde**: `src/componentes/presentadores/Avatar.tsx:8-12` (`text-[0.6875rem]`, `text-[0.8125rem]`), `src/componentes/presentadores/Insignia.tsx:24` (`text-[0.625rem]`), `src/componentes/proyecto/LineaDeActividad.tsx:52` (`text-[0.6875rem]`)
- **Qué pasa**: Existen 37 apariciones de tamaños de fuente arbitrarios en corchetes (`text-[Npx]`/`text-[Nrem]`) que eluden las clases semánticas de Tailwind y los tokens `--step-*` del sistema fluido.
- **Propuesta**: Remplazar las clases arbitrarias por los tokens semánticos oficiales `text-xs`, `text-texto-sutil` o las utilidades de escala fluida correspondientes.
- **Prioridad**: Baja · **Esfuerzo**: S

---

## Adopción de primitivos con cifras verificadas

La auditoría cuantitativa transversal realizada sobre todo el código fuente de `src/` arrojó las siguientes mediciones:

1. **Uso de `window.confirm()`:**
   - **5 ejecuciones reales y verificadas** en componentes de interacción de usuario (`DetalleActa.tsx`, `TareasPropuestas.tsx`, `FlujoLicitacion.tsx` x2, `Tablero.tsx`).
   - Meta: 0. Toda confirmación destructiva debe pasar por `ConfirmarBorrado` o `ConfirmacionEnLinea`.

2. **Duraciones literales de transición (`duration-N`):**
   - **88 ocurrencias** detectadas en el repositorio (concentradas en `duration-150`, `duration-200`, `duration-300`).
   - Causa: Falta de sustitución por los tokens de sistema `--wiwo-motion-fast` (160ms), `--wiwo-motion-medium` (280ms) o la clase `duration-rapida`.

3. **Valores de z-index arbitrarios (`z-[*]`):**
   - **7 ocurrencias** (`z-[70]`, `z-[55]`) en capas de onboarding, avisos de error y bienvenida.
   - Meta: Unificación en escala semántica en `globals.css`.

4. **Tamaños tipográficos arbitrarios (`text-[*]`):**
   - **37 apariciones** en componentes como `Avatar.tsx`, `Insignia.tsx`, `LineaDeActividad.tsx`, `Organigrama.tsx`.
   - Meta: Retorno estricto a las clases estándar de Tailwind y tokens de fluidez tipográfica.

5. **Uso de tokens de animación (`animate-*`):**
   - **41 ocurrencias** en total en toda la aplicación.
   - Diagnóstico: Adopción aún reducida. Gran cantidad de superficies (tablas base, tarjetas flotantes, colapsables) entran de golpe o usan keyframes desconectados.

6. **Indicadores de carga genéricos (`animate-spin`):**
   - **0 apariciones**. El Orbe de Thinking ha reemplazado exitosamente a los spinners tradicionales.

7. **Registro en consola (`console.log`):**
   - **0 apariciones**. Limpieza total de trazas de desarrollo.

---

## Tabla resumen de hallazgos

| ID | Título | Categoría | Prioridad | Esfuerzo |
|---|---|---|:---:|:---:|
| P2-01 | Diálogos nativos `window.confirm()` en lugar de primitivos de confirmación | Inconsistencias | **Alta** | S |
| P2-02 | Divergencia de animación de entrada en filas entre `TablaRecurso` y tablas base | Inconsistencias | Media | M |
| P2-03 | Desplegables de filtrado manual con `<select>` nativo junto a selectores Radix | Inconsistencias | Media | S |
| P2-04 | Variantes de avatar con cálculos ad-hoc y clases de texto arbitrarias | Inconsistencias | Media | S |
| P2-05 | Indicador de carga asíncrona: dualidad entre Orbe y pulsos infinitos | Inconsistencias | Baja | S |
| P2-06 | `thinking-orb.css`: revisar solo el estado `retry` (sin código muerto verificado) | Deuda técnica | Baja | S |
| P2-07 | Multiplicidad de selectores relacionales divergentes sobre Menú Contextual | Duplicación | **Alta** | M |
| P2-08 | Duplicación de tokens entre `tokens.css`, `neo-tokens.css` y `globals.css` | Duplicación | Media | M |
| P2-09 | Lógica duplicada de formateo de fechas relativas y vencimientos | Duplicación | Baja | S |
| P2-10 | Componentes canónicos prometidos en el Sistema de Diseño que no existen | Sin terminar | **Alta** | M |
| P2-11 | `TarjetaFlotantePersona` monta en `createPortal` sin animación ni transición | Sin terminar | Media | S |
| P2-12 | El catálogo `/taller` no cubre la totalidad de componentes y estados | Sin terminar | Media | M |
| P2-13 | Ausencia de `aria-label` estricto en botones con `soloIcono` | Refinamiento | **Alta** | S |
| P2-14 | Paginación manual fragmentada fuera de `TablaRecurso` | Refinamiento | Media | S |
| P2-15 | Inconsistencia en la presentación de estados vacíos contextuales | Refinamiento | Baja | S |
| P2-16 | Desconexión de animación de salida en `OrbeChatIA` | Animaciones faltantes | **Alta** | S |
| P2-17 | `Interruptor.tsx`: animación de cambio de estado basada en duración genérica | Animaciones faltantes | Baja | S |
| P2-18 | Ausencia de transición en acordeones y paneles colapsables | Animaciones faltantes | Media | M |
| P2-19 | Dispersión de valores arbitrarios de `z-index` sin escala centralizada | Deuda técnica | Media | S |
| P2-20 | Uso residual de tamaños de texto arbitrarios `text-[...px]` | Deuda técnica | Baja | S |
