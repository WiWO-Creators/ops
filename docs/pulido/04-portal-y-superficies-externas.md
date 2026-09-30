# Pulido — Portal y superficies externas

Auditoría exhaustiva de consistencia de interfaz, refinamiento visual, deuda técnica, estados de carga/error y cobertura de animación en el portal del cliente (`src/app/portal/`, `src/componentes/portal/`), superficies de autenticación y acceso (`src/app/(acceso)/`, `src/app/clave/[token]/`), salas y tablets públicas (`src/app/sala/[token]/`), fichas anónimas (`src/app/tarea/[token]/`), tablero interno de mantenimiento (`src/app/s/[clave]/`), cartelería digital para pantallas de área (`src/app/pantalla/`), módulos satélites y multimedia (`live/`, `teletrabajo/`, `archivos/`, `ia/`) y hojas de estilo especializadas (`livekit.css`, `monito.css`, `acta.css`, `movil.css`, `thinking-orb.css`).

Solo hallazgos verificados en el código de `ops-v2`; no se modificó ningún archivo.

---

## Cobertura por superficie externa

| Superficie / Ruta | Tipo de Acceso | Sistema Visual / Cabecera | Estados (Carga / Error / Vacío) | loading.tsx | Animaciones de Entrada |
|---|---|---|---|---|---|
| `portal/(dentro)/proyectos` | Cliente (sesión) | `SeccionDePortal` (`h1` plano) | `Cargando` en Suspense / `ErrorEstado` | No | Sí (`.entrada-pagina` en template) |
| `portal/(dentro)/proyectos/[id]` | Cliente (sesión) | `CabeceraProyecto` compartida | Inline / `EstadoDeError` | No | Sí (`.entrada-pagina` en template) |
| `portal/(dentro)/soporte` | Cliente (sesión) | `SeccionDePortal` (`h1` plano) | `Cargando` en Suspense / `ErrorEstado` | No | Sí (`.entrada-pagina` en template) |
| `portal/(dentro)/archivos` | Cliente (sesión) | `h1` plano manual | `Vacio` / `EstadoDeError` | No | Sí (`.entrada-pagina` en template) |
| `portal/(dentro)/anuncios` | Cliente (sesión) | `h1` plano manual | `Vacio` / `EstadoDeError` | No | Sí (`.entrada-pagina` en template) |
| `portal/(dentro)/ayuda` | Cliente (sesión) | `h1` plano manual | `Vacio` / `EstadoDeError` | No | Sí (`.entrada-pagina` en template) |
| `portal/(dentro)/perfil` | Cliente (sesión) | `h1` plano manual | Datos directos / Boundary | No | Sí (`.entrada-pagina` en template) |
| `portal/(dentro)/reporte` | Cliente (sesión) | `TituloModulo` (marca completa) | `Vacio` / `SinPermiso` / `notFound` | Sí (skeleton dedicado) | Sí (`.entrada-pagina` en template) |
| `(acceso)/` (login cliente) | Público / Anónimo | `PanelVidrio` + `Orbe` marca | Feedback inline en orbe y texto | N/A | No (montaje estático) |
| `(acceso)/colab` (login staff) | Público / Anónimo | `PanelVidrio` + `Orbe` marca | Feedback inline en orbe y texto | N/A | No (montaje estático) |
| `clave/[token]` (fijar clave) | Público (token temporal) | `PanelVidrio` + `Orbe` marca | Feedback inline en orbe y texto | N/A | No (montaje estático) |
| `sala/[token]` (tablet pared) | Público (kiosco pasillo) | Tipografía `vmin` pantalla completa | No hay / Fallo no atrapado | No | No (transición de color dura) |
| `tarea/[token]` (ficha pública) | Público (token 30 días) | `CabeceraFichaTarea` + `Logo` | Componentes `Vacio` / `notFound` | No | No (montaje estático) |
| `s/[clave]` (tablero mantenimiento) | Soporte técnico (clave) | Monospace CRT / `panel.css` | Ad-hoc en estado local | No | Sí (keyframes CRT `bk-encender`) |
| `pantalla/[codigo]` (smart TV) | Kiosco / TV pared | Escala pura `vmin` (Solari + TV) | Auto-reintento loop / Error TV | No (Server loop) | Sí (rotación Solari + derivas) |

---

## Hallazgos por categoría

### Inconsistencias

### P4-01 Discrepancia en títulos del portal: `TituloModulo` vs `h1` planos sin marca (resuelto en 6072d52)
- **Dónde**: `src/app/portal/(dentro)/seccion.tsx:60`, `src/app/portal/(dentro)/archivos/page.tsx:40`, `src/app/portal/(dentro)/anuncios/page.tsx:41`, `src/app/portal/(dentro)/ayuda/page.tsx:34`, `src/app/portal/(dentro)/perfil/page.tsx:29` frente a `src/componentes/reporte/ReporteMensual.tsx:65`
- **Qué pasa**: Mientras que el reporte mensual del cliente (`reporte/page.tsx` a través de `ReporteMensual.tsx`) utiliza `TituloModulo` con tipografía titular (`font-titular`), degradado dinámico de marca (`texto-gradiente-animado`) y la barra inferior de marca (`bg-gradiente-marca`), todas las demás pantallas del portal (Proyectos, Soporte, Archivos, Anuncios, Ayuda y Perfil) utilizan un `h1` plano con `text-texto text-xl font-semibold`. Esto rompe la identidad visual del portal cuando el cliente navega entre el reporte y el resto de sus secciones.
- **Propuesta**: Reemplazar los `h1` planos en `seccion.tsx` y en las páginas de Archivos, Anuncios, Ayuda y Perfil por `TituloModulo`, unificando la jerarquía tipográfica y la firma de marca en todo el portal.
- **Prioridad**: Alta · **Esfuerzo**: S

### P4-02 Discrepancia tipográfica y de escala entre pantallas de acceso (`/colab` vs `/` y `/clave/[token]`) (resuelto en 2e5b108)
- **Dónde**: `src/app/(acceso)/colab/FormularioEntrar.tsx:261`, `src/app/(acceso)/FormularioEntrarPortal.tsx:114`, `src/app/clave/[token]/FormularioFijarClave.tsx:132`
- **Qué pasa**: En el login de colaboradores (`/colab`), el encabezado de la tarjeta utiliza `font-titular text-3xl font-extrabold tracking-tight text-texto` con `mb-6`. En cambio, el login del cliente en la raíz (`/`) y la pantalla de fijar clave (`/clave/[token]`) utilizan `font-titular text-texto text-xl font-semibold` con `mb-8`. Aunque ambas pantallas comparten la misma composición (`PanelVidrio`, `Orbe` de marca y layout simétrico a dos columnas), la jerarquía tipográfica dentro de la tarjeta de autenticación está desfasada (3xl extrabold vs xl semibold).
- **Propuesta**: Estandarizar el encabezado de las tarjetas de autenticación usando la misma escala tipográfica (`text-2xl font-bold` o `text-3xl font-extrabold`) y el mismo margen inferior (`mb-6`) en los tres formularios.
- **Prioridad**: Media · **Esfuerzo**: S

### P4-03 Feedback desigual tras acciones en el portal: aprobaciones sin toast vs soporte con toast (resuelto en 47e25a9)
- **Dónde**: `src/app/portal/(dentro)/proyectos/[id]/AprobacionesPendientes.tsx:116-119` frente a `src/app/portal/(dentro)/soporte/NuevaSolicitud.tsx:112`
- **Qué pasa**: En `NuevaSolicitud.tsx`, al crearse o detectarse un ticket repetido se informa adecuadamente al cliente con `useAviso.advertencia()` o con un modal de confirmación. Por el contrario, en `AprobacionesPendientes.tsx`, cuando el cliente aprueba o rechaza una tarea crítica de su proyecto, la mutación se envía con `escribirEnBff`, cierra el diálogo de rechazo y ejecuta `router.refresh()` sin emitir ningún toast de confirmación (`useAviso.exito()`). El único feedback visual es el cambio sutil de estado en la fila tras el refresco.
- **Propuesta**: Incorporar `useAviso().exito('Visto bueno registrado para la tarea.')` y `useAviso().exito('Observación enviada al equipo.')` en `AprobacionesPendientes.tsx` tras resolver la llamada con la API.
- **Prioridad**: Media · **Esfuerzo**: S

### P4-04 Duraciones de transición arbitrarias sin uso de tokens del sistema (resuelto en 4fe6376)
- **Dónde**: `src/app/sala/[token]/page.tsx:48`
- **Qué pasa**: La pantalla de tablet de sala utiliza `transition-colors duration-500` en Tailwind crudo en lugar de utilizar los tokens de duración y curva del sistema de diseño (`--wiwo-motion-slow`, `duration-lenta` o `ease-neo`).
- **Propuesta**: Reemplazar `duration-500` por `duration-lenta ease-neo` para respetar los tokens semánticos definidos en `tokens.css`.
- **Prioridad**: Baja · **Esfuerzo**: S

---

### Duplicación

### P4-05 Duplicación de lógica de color y extracción de iniciales entre `Cara` y `personas.ts` (ya resuelto: `Cara` en `piezas.tsx` ya usa `coloresAvatar` e `iniciales` de `@/lib/personas`)
- **Dónde**: `src/app/pantalla/[codigo]/escenas/piezas.tsx:191-209` frente a `src/lib/personas.ts:16-56`
- **Qué pasa**: El componente `Cara` (utilizado en las escenas de pantalla de cartelería para mostrar los avatares en `vmin`) reescribe la paleta de colores de fondo (`PALETA_AVATARES`) y la selección basada en el id de la persona mediante una función local `colorDeCara`, en lugar de reutilizar `coloresAvatar` de `src/lib/personas.ts`. Aunque el dimensionamiento en `vmin` justifica tener un nodo DOM especializado distinto del `Avatar` estándar en píxeles, la lógica algorítmica de asignación de color a una persona está duplicada.
- **Propuesta**: Importar y consumir la paleta o la función de color directamente desde `src/lib/personas.ts`, manteniendo únicamente el marcado específico en `vmin` dentro de `piezas.tsx`.
- **Prioridad**: Media · **Esfuerzo**: S

### P4-06 Reglas CSS históricas y duplicadas de Neo v1/v3 en `thinking-orb.css`
- **Dónde**: `src/estilos/thinking-orb.css:32-38`, `:88-340`, `:2349-2353`
- **Qué pasa**: `thinking-orb.css` acumula 2.386 líneas de estilos. Gran parte del inicio del archivo define variables obsoletas de versiones tempranas de Neo (`--orb-size: 245px`, selectores con `:nth-of-type` y keyframes de versiones previas) que luego son anuladas explícitamente en el bloque inferior "Capa del producto" (líneas 2310-2386) mediante `--orb-w`, `--orb-h`, `--orbe-u` y selectores con nombres de clase específicos (`.orb-particle-uno`, `.orb-particle-dos`). Este archivo se importa de manera global en `globals.css` para toda la aplicación, forzando a los navegadores a parsear 2.4k líneas de keyframes y gradientes que en su mayoría están en desuso.
- **Verificación**: el archivo es **generado** por `herramientas/construir-orbe-css.mjs` y su cabecera (`thinking-orb.css:80-83`) conserva a propósito las reglas v1→v3→v6 en el orden original: «la cascada es parte del diseño final. No reordenar ni "limpiar" duplicados sin probar». Todas sus clases raíz se usan (ver P2-06).
- **Propuesta**: Solo si el peso del CSS global llega a medirse como problema: hacer la purga en el generador (no a mano), con comparación visual del orbe en sus 8 estados antes y después.
- **Prioridad**: Baja · **Esfuerzo**: M

### P4-07 Formateo de fecha y reloj duplicado en escenografías de cartelería digital (resuelto en 6db7735)
- **Dónde**: `src/app/pantalla/[codigo]/MarcoDePantalla.tsx:120-138`, `src/app/pantalla/[codigo]/Escenario.tsx:78-85` frente a `src/lib/fechas.ts` y `src/dominio/momento-del-dia.ts`
- **Qué pasa**: En `MarcoDePantalla.tsx` se define un formateador local ad-hoc `Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })` y se manipulan mayúsculas manualmente con `slice()`, mientras que en `Escenario.tsx` se formatea la hora de sincronización de datos con otra rutina inline. En `src/lib/fechas.ts` ya existen funciones centralizadas para formateo de fechas en español de Chile (`es-CL`) y en `dominio/momento-del-dia.ts` ya existe `horaDeReloj()`.
- **Propuesta**: Centralizar el formateo del reloj y la fecha del marco de pantalla en helpers compartidos de `lib/fechas.ts` o `dominio/pantalla-area.ts`.
- **Prioridad**: Baja · **Esfuerzo**: S

---

### Sin terminar

### P4-08 Ausencia casi total de skeletons dedicados (`loading.tsx`) en el portal del cliente
- **Dónde**: `src/app/portal/(dentro)/proyectos/`, `src/app/portal/(dentro)/proyectos/[id]/`, `src/app/portal/(dentro)/soporte/`, `src/app/portal/(dentro)/archivos/`, `src/app/portal/(dentro)/anuncios/`, `src/app/portal/(dentro)/ayuda/`, `src/app/portal/(dentro)/perfil/`
- **Qué pasa**: A excepción de `reporte/loading.tsx` (que implementa un skeleton estructural excelente con `Hueso`), **ninguna otra sección del portal cuenta con un archivo `loading.tsx` propio ni existe un `loading.tsx` general en `portal/(dentro)/`**. Cuando el cliente navega a un proyecto con gran volumen de datos, a la bandeja de tickets o a sus archivos, la interfaz congela la pantalla anterior hasta que el Server Component resuelve los datos del backend, produciendo una sensación de lentitud o de interfaz no receptiva.
- **Propuesta**: Crear un `loading.tsx` en `src/app/portal/(dentro)/loading.tsx` con un esqueleto base de página (título y tarjeta o tabla con `Hueso`), y un `loading.tsx` específico en `portal/(dentro)/proyectos/[id]/` que reserve el espacio de la cabecera y el tablero del proyecto.
- **Prioridad**: Alta · **Esfuerzo**: M

### P4-09 Rutas públicas sin pantallas de contingencia `error.tsx` dedicadas (resuelto en 6072d52; colab ya lo cubre `(acceso)/error.tsx`)
- **Dónde**: `src/app/sala/[token]/`, `src/app/s/[clave]/`, `src/app/(acceso)/colab/`
- **Qué pasa**:
  - En `src/app/sala/[token]/` (pantalla kiosco para tablets de puerta en oficinas) no existe `error.tsx` ni `not-found.tsx`. Si la API de salas responde un 500 o la red falla temporalmente, la tablet salta al `error.tsx` de la raíz del sistema, mostrando controles de colaborador que no corresponden a un dispositivo de pared desatendido.
  - En `src/app/s/[clave]/` no existe `error.tsx`. Cualquier error en tiempo de ejecución renderiza la pantalla de error global de Ops en lugar del entorno visual terminal/CRT del tablero de mantenimiento.
  - En `(acceso)/colab` no existe `error.tsx` propio, dependiendo del error general de `(acceso)/`.
- **Propuesta**:
  - Crear `src/app/sala/[token]/error.tsx` con recarga o reconexión periódica automática idéntica a la implementada en `src/app/pantalla/[codigo]/error.tsx`.
  - Crear `src/app/s/[clave]/error.tsx` con el estilo monoespaciado de `panel.css` y botón de reintento.
- **Prioridad**: Alta · **Esfuerzo**: M

### P4-10 Ausencia de reintento asistido e iconografía de aviso en fallos del chat de salas LiveKit
- **Dónde**: `src/componentes/teletrabajo/ChatDeSala.tsx:117-121`
- **Qué pasa**: Cuando el envío de un mensaje falla en el chat de la videollamada (`catch` en `enviar()`), el componente simplemente muestra un texto rojo plano: `<p role="status" className="text-texto-peligro px-3 text-xs">No se pudo enviar. Prueba de nuevo.</p>`. No se acompaña de un icono de advertencia (`AlertTriangle`), no ofrece un botón explícito de reintento sobre el mensaje fallido ni se limpia automáticamente cuando el usuario vuelve a tipear en la entrada.
- **Propuesta**: Enriquecer el estado de fallo con un icono semántico, aria-live adecuado y borrado del error tan pronto el usuario modifique el texto del campo.
- **Prioridad**: Baja · **Esfuerzo**: S

---

### Refinamiento

### P4-11 Uso de `window.confirm()` nativo en el tablero interno de mantenimiento (resuelto en 6072d52)
- **Dónde**: `src/app/s/[clave]/Tablero.tsx:109-114`
- **Qué pasa**: Al alternar un interruptor catalogado como peligroso (que dispara correos, abre la puerta de entrada o genera costos con proveedores externos), la función `alternar` invoca `window.confirm(...)` nativo del navegador. Esto detiene el hilo de ejecución principal, muestra un modal gris del sistema operativo ajeno a la estética visual cyberpunk/CRT del tablero (`panel.css`) y carece de soporte accesible estructurado.
- **Propuesta**: Reemplazar `window.confirm()` por un diálogo modal ligero acorde a la estética del tablero o por el componente `ConfirmacionEnLinea` del sistema.
- **Prioridad**: Media · **Esfuerzo**: S

### P4-12 Colores hexadecimales hardcodeados y desconectados de tokens en `Tablero.tsx` y `explorador-drive.css`
- **Dónde**: `src/app/s/[clave]/Tablero.tsx:159`, `src/app/s/[clave]/panel.css:2-7`, `src/estilos/explorador-drive.css:12-32`
- **Qué pasa**:
  - En `Tablero.tsx:159`, el icono de advertencia tiene su color hardcodeado: `<TriangleAlert size={13} aria-hidden="true" color="#f2b705" />`.
  - En `panel.css`, se declaran variables con valores fijos (`--verde: #3bff00; --peligro: #f2b705;`) sin referenciar la paleta de tokens.
  - En `explorador-drive.css`, los 10 tipos de archivo definen colores mediante `light-dark(#..., #...)` con colores hex crudos (`#1a73e8`, `#1e8e3e`, `#e37400`, `#ea4335`, etc.) en lugar de utilizar variables semánticas o tokens de paleta de `tokens.css`.
- **Propuesta**: Utilizar `className="text-texto-aviso"` en el icono de `Tablero.tsx` y enlazar los colores de `explorador-drive.css` con los tokens de color del sistema de diseño.
- **Prioridad**: Baja · **Esfuerzo**: S

### P4-13 Restricción de espacio horizontal en navegación móvil del portal por padding excesivo
- **Dónde**: `src/app/portal/(dentro)/layout.tsx:87-90`
- **Qué pasa**: En dispositivos móviles, la barra de navegación del portal se desplaza horizontalmente con la clase `pl-28` para esquivar el avatar del cliente que cuelga desde la cabecera superior. En pantallas angostas (320px–360px como iPhone SE o Galaxy A), el área útil de navegación queda reducida a menos de 220px, forzando un scroll horizontal prematuro que oculta casi todas las pestañas disponibles.
- **Propuesta**: Reducir el tamaño relativo del avatar en móvil o reubicar el avatar dentro de la fila de cabecera en pantallas `< 400px`, reduciendo `pl-28` a `pl-4` para que el cliente visualice al menos 3 destinos principales sin necesidad de scroll horizontal.
- **Prioridad**: Media · **Esfuerzo**: S

### P4-14 Falta de vista adaptada en tarjetas (`tarjetasEnMovil`) para la tabla de proyectos del portal
- **Dónde**: `src/app/portal/(dentro)/TablaPortal.tsx:114-118`
- **Qué pasa**: `TablaPortal` activa `tarjetasEnMovil={esSoporte}` únicamente cuando la sección es Soporte (`tarjeta={esSoporte ? (fila, catalogos) => <TarjetaDeSolicitud ... /> : undefined}`). En la sección de Proyectos (`/portal/proyectos`), la tabla no define prop `tarjeta` ni activa `tarjetasEnMovil`. En teléfonos móviles, la lista de proyectos se renderiza como una tabla HTML tradicional con scroll horizontal, mientras que Soporte se transforma limpiamente en tarjetas verticales táctiles mediante las utilidades de `movil.css`.
- **Propuesta**: Implementar un renderizador de tarjeta `TarjetaDeProyectoPortal` y habilitar `tarjetasEnMovil` también para la sección de proyectos en `TablaPortal.tsx`.
- **Prioridad**: Media · **Esfuerzo**: M

### P4-15 Estado de carga sin skeleton estructurado en el árbol de Drive
- **Dónde**: `src/componentes/archivos/ArbolDrive.tsx:105`
- **Qué pasa**: Durante la carga inicial de carpetas y archivos de Google Drive, el componente muestra un componente genérico `<Cargando alto="min-h-40" mensaje="Cargando Drive…" />` (spinner con texto). Dado que el árbol renderiza filas de archivos y carpetas con iconos y jerarquía, este indicador genérico produce saltos de layout (CLS) en cuanto el árbol se resuelve.
- **Propuesta**: Reemplazar `Cargando` por un skeleton de árbol que muestre 3 a 5 filas con `Hueso` simulando carpetas y archivos antes de que lleguen los datos de la API.
- **Prioridad**: Baja · **Esfuerzo**: S

---

### Animaciones faltantes

### P4-16 Ausencia de animación de entrada en superficies públicas de autenticación y token (resuelto en 4fe6376)
- **Dónde**: `src/app/(acceso)/FormularioEntrarPortal.tsx:112`, `src/app/(acceso)/colab/FormularioEntrar.tsx:259`, `src/app/clave/[token]/FormularioFijarClave.tsx:130`, `src/app/tarea/[token]/page.tsx:64`
- **Qué pasa**: Las pantallas de autenticación (`/`, `/colab`, `/clave/[token]`) y la ficha pública de tarea (`/tarea/[token]`) montan su contenedor principal y su tarjeta de vidrio de forma estática instantánea, sin aprovechar la clase `animate-entrar-abajo`, `animate-aparecer` o `.entrada-pagina` que sí utilizan las vistas del panel interno. Siendo la primera impresión del cliente y de los colaboradores al entrar al sistema, la tarjeta aparece de golpe sobre el fondo de aurora.
- **Propuesta**: Aplicar `animate-entrar-abajo` o `animate-aparecer` (con soporte para `motion-reduce:animate-none`) en el contenedor `<PanelVidrio>` de los formularios de acceso y en el `<main>` de la ficha pública de tarea.
- **Prioridad**: Media · **Esfuerzo**: S

### P4-17 Transiciones bruscas en el diálogo de rechazo de aprobaciones del portal
- **Dónde**: `src/app/portal/(dentro)/proyectos/[id]/AprobacionesPendientes.tsx:187-220`
- **Qué pasa**: Al pulsar el botón "Rechazar", se abre un `Dialogo` con un `AreaTexto` para ingresar el motivo. El cambio de estado local (`rechazando`) y el reemplazo de la fila por el estado "Decisión enviada" tras la respuesta de la API ocurre de forma instantánea sin ninguna transición de opacidad o altura, produciendo un salto brusco en la lista de aprobaciones.
- **Propuesta**: Añadir transiciones suaves de salida (`transition-opacity duration-rapida ease-neo`) en la fila aprobada/rechazada antes de removerla de la vista.
- **Prioridad**: Baja · **Esfuerzo**: S

### P4-18 Ausencia de animación al desplegar respuestas y citas en `ChatOrbe`
- **Dónde**: `src/componentes/ia/ChatOrbe.tsx:490-540`, `src/componentes/ia/TextoChat.tsx`
- **Qué pasa**: Los nuevos turnos de respuesta de la IA y las tarjetas interactivas de propuestas/preguntas se montan directamente en el flujo del DOM sin una animación de entrada gradual (`animate-aparecer`). Al recibir la confirmación de una propuesta o una nueva respuesta de streaming, los bloques aparecen cortados abruptamente.
- **Propuesta**: Agregar una clase de entrada sutil (`animate-aparecer` con `duration-rapida`) en las burbujas y tarjetas interactivas generadas en el hilo del chat.
- **Prioridad**: Baja · **Esfuerzo**: S

---

### Deuda técnica

### P4-19 Reglas de `.entrada-pagina` en `entrada-pagina.css` asumen estructura exclusiva del panel
- **Dónde**: `src/estilos/entrada-pagina.css:42-70` frente a `src/app/portal/(dentro)/layout.tsx:93` y `src/app/portal/(dentro)/template.tsx:14`
- **Qué pasa**: `portal/(dentro)/template.tsx` envuelve a sus hijos en `TransicionDePagina` (que aplica la clase `.entrada-pagina`). Sin embargo, en `entrada-pagina.css`, los selectores que escalonan y animan la página están fuertemente acoplados a la estructura del panel interno:
  - `.entrada-pagina header .bg-gradiente-marca` (el portal no usa `header` con barra de marca en la mayoría de sus pantallas).
  - `.entrada-pagina > :is(div, section) > :nth-child(-n + 4)`: en el portal, `(dentro)/layout.tsx` intercala un componente `<ScrollSuave>` que renderiza un `<main>` intermedio. Debido a este elemento intermedio, el selector directo `>` falla o se comporta de forma dispar entre páginas directas y páginas envueltas.
- **Propuesta**: Generalizar los selectores de `entrada-pagina.css` para que soporten tanto la estructura del panel (`main > section`) como la del portal (`ScrollSuave > main > div/section`), garantizando que el escalonamiento de entrada funcione de manera idéntica en ambos entornos.
- **Prioridad**: Alta · **Esfuerzo**: M

### P4-20 El chat flotante de IA (`OrbeChatIA`) carece de comportamiento drawer en pantallas móviles
- **Dónde**: `src/componentes/ia/OrbeChatIA.tsx:254-257`
- **Qué pasa**: En `OrbeChatIA.tsx`, el panel flotante se posiciona con `fixed bottom-[calc(6rem_+_var(--barra-inferior,0px))] right-4` y `max-w-[calc(100vw-2rem)]`. En dispositivos móviles con pantallas estrechas, una caja flotante con tirador de redimensionamiento táctil (`alBajarPuntero`) resulta incómoda de maniobrar, tapa los elementos inferiores y compite con el teclado virtual.
- **Propuesta**: En pantallas `< 768px`, hacer que el panel flotante se fije al fondo de la pantalla como un modal inferior / cajón deslizante a ancho completo (`inset-x-0 bottom-0 rounded-t-tarjeta max-w-full`), desactivando el tirador de redimensionamiento libre en pantallas táctiles pequeñas.
- **Prioridad**: Media · **Esfuerzo**: M

### P4-21 Inclusión global obligatoria de `livekit.css` y `acta.css` en todas las páginas de la aplicación
- **Dónde**: `src/app/globals.css:20-25`
- **Qué pasa**: `globals.css` importa `@import '../estilos/livekit.css'` y `@import '../estilos/acta.css'` en el bundle global que se descarga en cada pantalla del sitio (incluyendo el portal del cliente, login y pantallas públicas). Estas hojas contienen selectores específicos (`[data-lk-theme='wiwo']`, `.acta-editor`) que únicamente se utilizan dentro de `/teletrabajo/[sala]` y en el editor de actas.
- **Propuesta**: Mover la importación de `livekit.css` exclusivamente al layout o página de videollamadas (`src/app/(panel)/teletrabajo/`), evitando sobrecargar el CSS crítico inicial del portal y de las superficies públicas.
- **Prioridad**: Baja · **Esfuerzo**: S

---

## Resumen de hallazgos

| ID | Hallazgo | Categoría | Prioridad | Esfuerzo |
|---|---|---|---|---|
| **P4-01** | Discrepancia en títulos del portal: `TituloModulo` vs `h1` planos sin marca | Inconsistencias | Alta | S |
| **P4-02** | Discrepancia tipográfica y de escala entre pantallas de acceso (`/colab` vs `/` y `/clave`) | Inconsistencias | Media | S |
| **P4-03** | Feedback desigual tras acciones en el portal: aprobaciones sin toast vs soporte | Inconsistencias | Media | S |
| **P4-04** | Duraciones de transición arbitrarias sin uso de tokens del sistema (`duration-500`) | Inconsistencias | Baja | S |
| **P4-05** | Duplicación de lógica de color y extracción de iniciales entre `Cara` y `personas.ts` | Duplicación | Media | S |
| **P4-06** | `thinking-orb.css` generado conserva cascada v1/v3/v6 a propósito; purga solo vía generador | Deuda técnica | Baja | M |
| **P4-07** | Formateo de fecha y reloj duplicado en escenografías de cartelería digital | Duplicación | Baja | S |
| **P4-08** | Ausencia casi total de skeletons dedicados (`loading.tsx`) en el portal del cliente | Sin terminar | Alta | M |
| **P4-09** | Rutas públicas sin pantallas de contingencia `error.tsx` dedicadas (`sala/`, `s/`) | Sin terminar | Alta | M |
| **P4-10** | Ausencia de reintento asistido e iconografía de aviso en chat de salas LiveKit | Sin terminar | Baja | S |
| **P4-11** | Uso de `window.confirm()` nativo en el tablero interno de mantenimiento | Refinamiento | Media | S |
| **P4-12** | Colores hexadecimales hardcodeados y desconectados de tokens en `Tablero.tsx` y Drive | Refinamiento | Baja | S |
| **P4-13** | Restricción de espacio horizontal en navegación móvil del portal por `pl-28` | Refinamiento | Media | S |
| **P4-14** | Falta de vista adaptada en tarjetas (`tarjetasEnMovil`) para proyectos del portal | Refinamiento | Media | M |
| **P4-15** | Estado de carga sin skeleton estructurado en el árbol de Drive (`Cargando` spinner) | Refinamiento | Baja | S |
| **P4-16** | Ausencia de animación de entrada en superficies públicas de autenticación y token | Animaciones faltantes | Media | S |
| **P4-17** | Transiciones bruscas en el diálogo de rechazo de aprobaciones del portal | Animaciones faltantes | Baja | S |
| **P4-18** | Ausencia de animación al desplegar respuestas y citas en `ChatOrbe` | Animaciones faltantes | Baja | S |
| **P4-19** | Reglas de `.entrada-pagina` en `entrada-pagina.css` asumen estructura exclusiva del panel | Deuda técnica | Alta | M |
| **P4-20** | El chat flotante de IA (`OrbeChatIA`) carece de comportamiento drawer en móvil | Deuda técnica | Media | M |
| **P4-21** | Inclusión global obligatoria de `livekit.css` y `acta.css` en todas las páginas | Deuda técnica | Baja | S |

### Conteo por prioridad
- **Alta**: 4 hallazgos
- **Media**: 10 hallazgos
- **Baja**: 7 hallazgos
- **Total**: 21 hallazgos verificados
