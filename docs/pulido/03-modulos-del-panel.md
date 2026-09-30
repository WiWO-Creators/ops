# Pulido — Módulos del panel

Auditoría exhaustiva de consistencia de interfaz, refinamiento visual, deuda técnica, estados de carga/error y cobertura de animación en las 38 páginas del panel interno «WiWO Ops» y sus componentes asociados (`src/app/(panel)/{inicio,novedades,clientes,prospectos,licitaciones,upsells,contratos,tickets,focals,supervision,auditoria,papelera,equipo,indicadores,perfil,administracion,salas,live,teletrabajo}`).

---

## Cobertura por página

| Página | TituloModulo | entrada-pagina | Vacío / Carga / Error | loading.tsx | Notas |
|---|---|---|---|---|---|
| `inicio` | Sí (h2) / Saludo | Completa | Ad-hoc / Parcial / Silencioso | No | Cabecera propia `Saludo` con `h1`, gradiente dinámico y firma de marca. Bloques asíncronos en `Suspense`. |
| `novedades` | Sí | Incompatible | Ad-hoc (texto) / No / No | No | Envuelto en `EntradaEscalonada`; `:not(:has(h1))` anula la animación CSS de contenido. Vacío sin componente `Vacio`. |
| `clientes` | Sí | Completa | Fallback directorio / `Cargando` / Boundary | Sí | Vistas tabla/tarjetas. Carga con `Cargando` en `Suspense`. |
| `clientes/[id]` | No | Parcial (sin firma) | `Vacio` / `Cargando` / `ErrorEstado` / `SinPermiso` | Heredado (lista) | Cabecera manual `CabeceraCliente`. Hereda `clientes/loading.tsx` que muestra esqueleto de lista. |
| `prospectos` | Sí (título erróneo) | Completa | Boundary / `Cargando` / Boundary | Sí (erróneo) | Titulado erróneamente como "Licitaciones" (`GLOSARIO.licitacion.plural`). `loading.tsx` copia idéntico error. |
| `prospectos/[id]` | No | Parcial (sin firma) | `Vacio` / `Cargando` / `ErrorEstado` / `SinPermiso` | Heredado (lista) | Cabecera manual. Enlace retorno dice erróneamente `← Licitaciones` volviendo a `/prospectos`. |
| `licitaciones` | Sí | Completa | Boundary / `Cargando` / Boundary | Sí | Alertas de vencimiento y tabla con `Cargando` en `Suspense`. |
| `licitaciones/[id]` | No | Parcial (sin firma) | `Vacio` / Boundary / `ErrorEstado` / `SinPermiso` | Heredado (lista) | Usa `DetalleDeEspacio` y `CabeceraProyecto` sin `TituloModulo` ni firma de marca. |
| `upsells` | Sí | Completa | Boundary / `Cargando` / Boundary | Sí | Tabla con `Cargando` en `Suspense`. |
| `upsells/[id]` | No | Parcial (sin firma) | `Vacio` / Boundary / `ErrorEstado` / `SinPermiso` | Heredado (lista) | Usa `DetalleDeEspacio` y `CabeceraProyecto`. Sin firma de marca animada. |
| `contratos` | Sí | Completa | `Vacio` / `Cargando` / Boundary | Sí | Botón de alta y acceso en cabecera de tabla. |
| `contratos/[id]` | Sí (en subcomp.) | Desfasada | `Vacio` / Boundary / `ErrorEstado` | Heredado (lista) | `FichaContrato` usa `TituloModulo`, pero el enlace de retorno es el child 1 y se anima antes. |
| `tickets` | Sí | Completa | Boundary / `Cargando` / Boundary | No | Bandeja en `Suspense`. Sin `loading.tsx` a nivel de ruta. |
| `focals` | Sí | Completa | `Vacio` / `Cargando` / `SinPermiso` | Sí | Vista de cartera con `PanelFocals`. |
| `supervision` | Sí | Completa | `Vacio` / `Cargando` / `ErrorEstado` / `SinPermiso` | Sí | Cabecera en componente `Encabezado`. Estados completos. |
| `auditoria` | Sí | Completa | Boundary / `Cargando` / `SinPermiso` | Sí | Navegación por `Segmentado` entre vistas de actividad y calidad. |
| `papelera` | Sí | Completa | `Vacio` / Boundary / `ErrorEstado` / `SinPermiso` | No | Filtro por entidad y vacíos contextuales. Sin `loading.tsx`. |
| `equipo` | Sí | Completa | Boundary / `Cargando` / Boundary | Sí | Listado de personas con `Cargando` en `Suspense`. |
| `equipo/[id]` | No | Parcial (sin firma) | `Vacio` / `Cargando` / `ErrorEstado` / `SinPermiso` | Heredado (lista) | Cabecera manual `CabeceraPersona` sin gradiente ni firma. |
| `equipo/jerarquia` | Sí | Completa | Boundary / `Cargando` / `ErrorEstado` / `SinPermiso` | Heredado (equipo) | Unifica organigrama y accesos; doble panel de persona divergente. |
| `equipo/mi-area` | Sí | Completa | Boundary / Boundary / `ErrorEstado` / `SinPermiso` | Heredado (equipo) | Vista acotada del organigrama. Sin `loading.tsx` propio. |
| `indicadores` | Sí | Completa | Boundary / Boundary / `ErrorEstado` / `SinPermiso` | No | Tablero de fotos nocturnas. Sin `loading.tsx`. |
| `perfil` | Sí (en subcomp.) | Completa | Boundary / Boundary / Ad-hoc inline | No | `FormularioPerfil` monta `TituloModulo`. Sin `loading.tsx`. |
| `administracion` | Sí | Completa | Boundary / `Cargando` / `ErrorEstado` / `SinPermiso` | No | Cuadrícula de accesos y pestañas de configuración. Sin `loading.tsx`. |
| `administracion/accesos` | No | N/A | N/A | No | Redirección fija 307 hacia `/equipo/jerarquia?tab=personas`. |
| `administracion/animaciones` | Sí | Completa | Boundary / Boundary / `SinPermiso` | No | Laboratorio interactivo de motion y onboarding. Sin `loading.tsx`. |
| `administracion/recalculo-de-foto-diaria` | Sí | Completa | Ad-hoc voseado / Boundary / Boundary | No | Formulario crítico con textos voseados. Sin `loading.tsx`. |
| `administracion/motivos-de-iteracion` | Sí | Completa | Boundary / Boundary / `ErrorEstado` / `SinPermiso` | No | Tabla y modal de motivos. Sin `loading.tsx`. |
| `administracion/pantallas` | Sí | Completa | Boundary / Boundary / `ErrorEstado` / `SinPermiso` | No | Inventario de TVs con `<details>` sin animar. Sin `loading.tsx`. |
| `administracion/pantallas/anuncios` | Sí | Completa | Boundary / Boundary / `ErrorEstado` / `SinPermiso` | No | Listado y publicación de anuncios. Sin `loading.tsx`. |
| `administracion/incidentes` | Sí | Completa | `Vacio` / Boundary / `ErrorEstado` / `SinPermiso` | No | Tabla de errores registrados. Sin `loading.tsx`. |
| `administracion/incidentes/[incidente]` | No | Parcial (sin firma) | `Vacio` / Boundary / `ErrorEstado` / `SinPermiso` | No | Cabecera manual con `h1` plano sin gradiente ni firma. |
| `administracion/correos-entrantes` | Sí | Completa | `Vacio` / Boundary / `ErrorEstado` / `SinPermiso` | No | Bandeja de briefs recibidos por email. Sin `loading.tsx`. |
| `salas` | Sí (en subcomp.) | Completa | Boundary / Boundary / Boundary | No | `AgendaSalas` monta `TituloModulo`. Sin `loading.tsx`. |
| `live` | Sí | Completa | Boundary / Boundary / Ad-hoc en subcomps | No | Tablero en vivo con recarga periódica. Sin `loading.tsx`. |
| `live/resumen` | Sí | Completa | `Vacio` / Boundary / `ErrorEstado` / `SinPermiso` | No | Vista de resumen diario a las 20:00. Sin `loading.tsx`. |
| `teletrabajo` | Sí | Completa | Boundary / Boundary / Boundary | No | Cuadrícula de salas con componente `Tarjeta`. Sin `loading.tsx`. |
| `teletrabajo/[sala]` | No | No aplica | Ad-hoc (LiveKit WebRTC) | No | Interfaz de videollamada a pantalla completa. |

---

## Hallazgos por categoría

### Inconsistencias entre módulos

### P3-01 Discrepancia visual en cabeceras de detalle de entidad (resuelto en ce52e6d)
- **Dónde**: `src/componentes/cliente/CabeceraCliente.tsx:37`, `src/app/(panel)/prospectos/[id]/page.tsx:162`, `src/componentes/equipo/CabeceraPersona.tsx:37`, `src/componentes/contrato/FichaContrato.tsx:64`
- **Qué pasa**: `FichaContrato` utiliza `TituloModulo` con degradado `.texto-gradiente-animado` y firma de marca `.bg-gradiente-marca`. En cambio, Cliente, Prospecto y Equipo usan etiquetas `h1` manuales con clases `text-seccion leading-tight font-semibold` sin degradado ni firma, generando una experiencia visual fragmentada al navegar entre fichas comerciales y operativas.
- **Propuesta**: Unificar las cabeceras de detalle mediante `TituloModulo` (con soporte para entidad, avatar/icono e insignias adyacentes) o extraer un componente estándar `CabeceraEntidad` que garantice la firma de marca en todas las fichas.
- **Prioridad**: Alta · **Esfuerzo**: M

### P3-02 Divergencia en botón y formato de retorno a listado anterior
- **Dónde**: `src/componentes/contrato/FichaContrato.tsx:58`, `src/componentes/cliente/CabeceraCliente.tsx:25`, `src/app/(panel)/prospectos/[id]/page.tsx:156`, `src/componentes/equipo/CabeceraPersona.tsx:26`, `src/app/(panel)/administracion/incidentes/[incidente]/page.tsx:48`
- **Qué pasa**: Contratos implementa un enlace accesible con el icono SVG de Lucide `<ArrowLeft className="size-4" />` y estilos `text-texto-tenue hover:text-acento`. Las demás fichas de detalle usan un caracter unicode plano `←` con clases dispares (`text-texto-sutil hover:text-texto text-xs` en clientes/equipo vs `text-texto-tenue hover:text-texto text-sm` en incidentes).
- **Propuesta**: Reemplazar las flechas de texto plano por un componente de enlace canónico `<BotonVolver href="..." etiqueta="..." />` basado en Lucide `ArrowLeft` y tokens de color semánticos.
- **Prioridad**: Media · **Esfuerzo**: S

### P3-03 Asimetría en botón de fijar (`BotonFijar`) en detalles de entidad
- **Dónde**: `src/app/(panel)/clientes/[id]/page.tsx:233`, `src/app/(panel)/prospectos/[id]/page.tsx:168`, `src/app/(panel)/licitaciones/[id]/page.tsx:143`, `src/app/(panel)/upsells/[id]/page.tsx:127`, `src/componentes/contrato/FichaContrato.tsx:66`
- **Qué pasa**: El detalle de Cliente incluye `BotonFijar` para anclarlo en la sección "Fijados y recientes" del Inicio. Las demás entidades principales (prospectos, licitaciones, upsells, contratos y personas del equipo) carecen de este botón en su cabecera, pese a que el almacén de fijados y la barra rápida soportan estos tipos.
- **Propuesta**: Incorporar `BotonFijar` en las cabeceras de Licitación, Upsell, Prospecto y Contrato junto a la botonera de acciones.
- **Prioridad**: Media · **Esfuerzo**: M

### P3-04 Discrepancia en botones de acción y menú ⋯ en cabeceras de entidad
- **Dónde**: `src/componentes/cliente/AccionesCliente.tsx:56`, `src/componentes/prospecto/AccionesProspecto.tsx:49`, `src/componentes/contrato/FichaContrato.tsx:66`, `src/componentes/licitacion/AccionesLicitacion.tsx:48`
- **Qué pasa**: Cliente ofrece botón secundario "Editar" junto al menú ⋯ con `BajaYBorrado`. Prospecto expone en fila abierta un botón rojo destructivo "Borrar" junto al de editar, sin menú contextual. Contrato solo expone "Editar" sin menú ni borrado. Licitaciones y Upsells muestran botones de flujo comercial en línea.
- **Propuesta**: Homogeneizar las cabeceras de detalle con el patrón canónico: acción principal en botón destacado, acciones secundarias o destructivas agrupadas en el menú contextual ⋯ (`MenuAccionesFila` o `MenuContextual`).
- **Prioridad**: Media · **Esfuerzo**: M

### P3-05 Doble panel lateral para editar la misma persona en Organización (resuelto en 1489c4b)
- **Dónde**: `src/componentes/organigrama/PanelDePersona.tsx:58`, `src/componentes/organizacion/PanelDePersona.tsx:64`
- **Qué pasa**: Existen dos componentes completamente distintos con el mismo nombre en la ruta `/equipo/jerarquia`. Al hacer clic en un nodo del mapa de organigrama se abre el cajón de `organigrama/PanelDePersona` (solo edita jefatura, área y escalón); al hacer clic en la pestaña "Personas" se abre `organizacion/PanelDePersona` (edita rol de sistema, cargos, permisos, coordinación y ve auditoría). La misma persona se edita con dos formularios y alcances distintos dentro de la misma pantalla.
- **Propuesta**: Unificar ambos cajones en `organizacion/PanelDePersona.tsx`, reutilizándolo en el organigrama interactivo para que cualquier interacción sobre una persona abra la misma ficha integral.
- **Prioridad**: Alta · **Esfuerzo**: L

---

### Duplicación

### P3-06 Cuádruple implementación idéntica de matriz de asignación N-a-M (resuelto en b10ab1c)
- **Dónde**: `src/componentes/cliente/FocalesCliente.tsx:102`, `src/componentes/cliente/SupervisoresCliente.tsx:96`, `src/componentes/equipo/ClientesDeFocal.tsx:114`, `src/componentes/equipo/SupervisionPersona.tsx:92`
- **Qué pasa**: Los cuatro componentes replican exactamente la misma arquitectura: llamada en `useEffect` con `AbortController`, mezcla de catálogo disponible vs asignado en `Map`, mutación vía `escribirEnBff` (`PUT`), estado de guardado booleano local, y renderizado idéntico de chips y selectores.
- **Propuesta**: Extraer un componente genérico `MatrizAsignacion<T>` o hook `useAsignacionRelacion` que encapsule la carga, selección múltiple, confirmación por toast y manejo de errores.
- **Prioridad**: Alta · **Esfuerzo**: L

### P3-07 Selectores de persona buscables reimplementados ad-hoc (resuelto en 47e25a9)
- **Dónde**: `src/componentes/organizacion/SelectorDePersona.tsx:44`, `src/componentes/tickets/MenuAsignadoTicket.tsx:32`, `src/componentes/organigrama/AgregarAlArea.tsx:140`
- **Qué pasa**: Tres módulos distintos construyen un selector de personas sobre `MenuContextual` y `BuscadorMenu`. Cada uno implementa su propio filtrado por texto e incluso `MenuAsignadoTicket` importa la función `filtrarPersonas` desde `@/dominio/salas`, acoplando tickets con teletrabajo.
- **Propuesta**: Promover `src/componentes/organizacion/SelectorDePersona.tsx` a `src/componentes/formularios/SelectorPersona.tsx` como componente base del sistema para asignación individual con búsqueda integrada.
- **Prioridad**: Media · **Esfuerzo**: M

### P3-08 Diálogos de eliminación y borrado divergentes
- **Dónde**: `src/componentes/prospecto/AccionesProspecto.tsx:93`, `src/componentes/cliente/AccionesCliente.tsx:60`, `src/componentes/datos/MenuAccionesFila.tsx:22`
- **Qué pasa**: Se utilizan tres primitivas diferentes para confirmar la eliminación de un registro: `DialogoBorrar` ad-hoc en prospectos, `BajaYBorrado` en clientes y `ConfirmarBorrado` dentro de `MenuAccionesFila`. Cada una maneja textos, alertas de cascada e inputs de confirmación de manera desigual.
- **Propuesta**: Estandarizar todas las confirmaciones destructivas sobre la primitiva canónica `ConfirmarBorrado` (`src/componentes/datos/ConfirmarBorrado.tsx`).
- **Prioridad**: Media · **Esfuerzo**: M

---

### Sin terminar y errores funcionales

### P3-09 ~~Prospectos rotulado como Licitaciones~~ (descartado)
- **Verificación**: falso positivo. El módulo `/prospectos` se llama «Licitaciones» a propósito (`REVISION-nombre-licitaciones.md`); menú, título, carga y retorno lo dicen así por diseño.

### P3-10 ~~Skeleton de Prospectos rotulado como Licitaciones~~ (descartado)
- **Verificación**: mismo cambio deliberado que P3-09.

### P3-11 Dos textos distintos para volver al listado desde un prospecto (descartado: es la convención de todas las fichas, «← Sección» como miga de la cabecera y «Volver a Sección» como acción del estado inexistente; clientes hace lo mismo)
- **Dónde**: `src/app/(panel)/prospectos/[id]/page.tsx:93` («Volver a Licitaciones») y `:158` («← Licitaciones»).
- **Qué pasa**: El nombre es correcto, pero la ficha y su estado de inexistente usan dos redacciones distintas para el mismo retorno.
- **Propuesta**: Unificar en una sola forma, idealmente la misma que usan las demás fichas del panel.
- **Prioridad**: Baja · **Esfuerzo**: S

### P3-12 Uso de diálogo nativo bloqueante `window.confirm` en FlujoLicitacion (resuelto en 6072d52)
- **Dónde**: `src/componentes/prospecto/FlujoLicitacion.tsx:127`, `src/componentes/prospecto/FlujoLicitacion.tsx:355`
- **Qué pasa**: Al descartar o cerrar el borrador del flujo de creación de licitaciones se llama a `window.confirm()` nativo sincrónico del navegador, interrumpiendo el hilo de React, degradando la accesibilidad y rompiendo el sistema de diseño visual.
- **Propuesta**: Reemplazar los dos `window.confirm` por el componente `Dialogo` o `ConfirmarBorrado` con un modal no bloqueante accesible.
- **Prioridad**: Alta · **Esfuerzo**: S

### P3-13 Acción "Ver como" deshabilitada sin explicación contextual (resuelto en 2e5b108)
- **Dónde**: `src/componentes/equipo/BotonSuplantar.tsx:70`
- **Qué pasa**: El botón de suplantación para superadministradores define `disabled={!activa}` cuando la cuenta está dada de baja, pero no incluye ningún tooltip, `title` ni mensaje informativo que explique la causa de la inhabilitación.
- **Propuesta**: Envolver el botón en un contenedor con tooltip accesible o mostrar una aclaración textual adyacente: *"No se puede suplantar una cuenta inactiva"*.
- **Prioridad**: Baja · **Esfuerzo**: S

### P3-14 Estado vacío ad-hoc con texto plano sin estilo en Novedades (resuelto en 2e5b108)
- **Dónde**: `src/app/(panel)/novedades/page.tsx:36`
- **Qué pasa**: Cuando no hay novedades publicadas se renderiza `<p className="text-texto-tenue text-sm">Todavía no hay novedades publicadas.</p>`, rompiendo la pauta visual del sistema que exige el componente `Vacio` con icono y salida contextual.
- **Propuesta**: Utilizar `<Vacio titulo="Todavía no hay novedades publicadas" descripcion="Las actualizaciones del sistema aparecerán aquí organizadas por fecha." />`.
- **Prioridad**: Media · **Esfuerzo**: S

---

### Refinamiento y consistencia de UI

### P3-15 Inconsistencia gramatical de tratamiento: Voseo rioplatense vs Tuteo neutro (resuelto en 6072d52)
- **Dónde**: `src/app/(panel)/perfil/FormularioPerfil.tsx:468`, `src/componentes/equipo/campos.ts:65`, `src/componentes/administracion/RecalculoDeFotoDiaria.tsx:144`, `src/componentes/administracion/RecalculoDeFotoDiaria.tsx:147`
- **Qué pasa**: El sistema utiliza tuteo neutro en la inmensa mayoría de pantallas (*"No tienes permiso"*, *"Si crees que deberías tener acceso"*). No obstante, en perfil aparece `"Todavía no tenés firma."`, en equipo `"Podés marcar varias áreas."`, y en recálculo `"No tenés permiso para recalcular"` y `"Revisá lo que pediste"`.
- **Propuesta**: Normalizar todos los textos a tuteo neutro: *"Todavía no tienes firma"*, *"Puedes marcar varias áreas"*, *"No tienes permiso para recalcular"* y *"Revisa los datos ingresados"*.
- **Prioridad**: Media · **Esfuerzo**: S

### P3-16 Discrepancia terminológica en botones de confirmación de formularios (resuelto en 2e5b108; «Reservar» y los «Guardar foto/datos/firma» del perfil quedan por convención documentada)
- **Dónde**: `src/componentes/proyecto/FormularioRecurso.tsx:195`, `src/componentes/cliente/DialogoContacto.tsx:254`, `src/app/(panel)/salas/DialogoReserva.tsx:265`, `src/app/(panel)/perfil/FormularioPerfil.tsx:405,488,527`
- **Qué pasa**: Mientras `FormularioRecurso` usa siempre `"Guardar"` (tanto en alta como en edición), `DialogoContacto` y `DialogoReserva` alternan entre `"Crear contacto"` / `"Reservar"` y `"Guardar cambios"`. En perfil coexisten en la misma pantalla `"Guardar datos"`, `"Guardar firma"` y `"Guardar foto"`.
- **Propuesta**: Adoptar la convención estándar del sistema de diseño: botón de acción afirmativa nombra la entidad en creación (*"Crear contacto"*, *"Crear contrato"*) y utiliza `"Guardar cambios"` en modificaciones.
- **Prioridad**: Media · **Esfuerzo**: M

### P3-17 Conflicto terminológico "Borrar" vs "Eliminar" en acciones destructivas (resuelto en 2e5b108)
- **Dónde**: `src/componentes/prospecto/AccionesProspecto.tsx:59`, `src/componentes/datos/MenuAccionesFila.tsx:22`, `src/componentes/cliente/AccionesCliente.tsx:68`
- **Qué pasa**: En la botonera de Prospecto se rotula el botón como `"Borrar"`, mientras que el vocabulario de diseño institucional en menús de tabla, papelera y avisos utiliza consistentemente `"Eliminar"` o `"Enviar a la papelera"`.
- **Propuesta**: Reemplazar `"Borrar"` por `"Eliminar"` en `AccionesProspecto.tsx` para mantener coherencia léxica.
- **Prioridad**: Baja · **Esfuerzo**: S

### P3-18 Omisión generalizada de feedback de éxito (`useAviso`) tras mutaciones (resuelto en 47e25a9)
- **Dónde**: `src/componentes/equipo/DialogoRolSistema.tsx:112`, `src/componentes/licitacion/PresentacionLicitacion.tsx:75`, `src/app/(panel)/salas/DialogoReserva.tsx:110`, `src/componentes/equipo/ExportarTareasSheets.tsx:48`
- **Qué pasa**: Al ejecutar mutaciones en estos componentes (cambiar un rol de sistema a un usuario, fijar la URL de una licitación o reservar una sala), el modal simplemente se cierra o ejecuta `router.refresh()`. No se invoca `aviso.exito('...')` de `useAviso`, dejando al usuario sin confirmación perceptible.
- **Propuesta**: Incorporar `useAviso().exito('...')` al resolver satisfactoriamente cada mutación antes de cerrar los diálogos.
- **Prioridad**: Alta · **Esfuerzo**: M

### P3-19 Icono ausente en botón "Editar" de cabeceras de cliente y prospecto (resuelto en 2e5b108)
- **Dónde**: `src/componentes/cliente/AccionesCliente.tsx:57`, `src/componentes/prospecto/AccionesProspecto.tsx:51`, `src/componentes/contrato/FichaContrato.tsx:68`
- **Qué pasa**: `FichaContrato` y `MenuAccionesFila` utilizan el icono canónico `<Pencil className="size-4" />` junto a la etiqueta `"Editar"`. Por contraste, `AccionesCliente` y `AccionesProspecto` renderizan botones planos de solo texto, reduciendo la consistencia visual y la velocidad de escaneo.
- **Propuesta**: Incorporar `<Pencil aria-hidden className="size-4" />` a los botones de edición de `AccionesCliente` y `AccionesProspecto`.
- **Prioridad**: Baja · **Esfuerzo**: S

---

### Animaciones faltantes

### P3-20 Bloqueo estructural de `.entrada-pagina` en Novedades (resuelto en 6072d52)
- **Dónde**: `src/app/(panel)/novedades/page.tsx:23`
- **Qué pasa**: La página envuelve su árbol en `<EntradaEscalonada><div className="...">...</div></EntradaEscalonada>`. En el DOM resultante, el hijo directo del selector `.entrada-pagina > :is(div, section)` es el `div` contenedor de `EntradaEscalonada`, el cual contiene un único hijo que aloja el `h1`. La regla `:not(:has(h1))` descarta ese hijo y ningún grupo de contenido recibe la animación CSS de entrada de página (`entrada-contenido`), dependiendo exclusivamente de JS.
- **Verificación**: que los grupos no reciban la entrada CSS es coherente, porque la entrada JS la reemplaza. El problema real es el inverso: la cabecera (`novedades/page.tsx:28`, `inicio/NovedadesDelInicio.tsx:66`) lleva `data-entrada="cabecera"` **y** contiene el `h1` y la firma de `TituloModulo`, así que corren dos coreografías superpuestas (fundido JS desde −8 px más desenfoque CSS del `h1` y barrido de la firma) con curvas y tiempos distintos.
- **Propuesta**: Definir una sola dueña de la cabecera. Lo más simple: quitar `data-entrada="cabecera"` y dejar que la entrada CSS anime título y firma; la entrada JS queda solo para los ítems, con `start` alineado a los 80–180 ms de `entrada-pagina.css`.
- **Prioridad**: Media · **Esfuerzo**: S

### P3-21 Ausencia de la firma de marca animada en páginas de detalle de entidad (resuelto en ce52e6d)
- **Dónde**: `src/componentes/cliente/CabeceraCliente.tsx`, `src/app/(panel)/prospectos/[id]/page.tsx`, `src/componentes/proyecto/CabeceraProyecto.tsx`, `src/componentes/equipo/CabeceraPersona.tsx`, `src/app/(panel)/administracion/incidentes/[incidente]/page.tsx`
- **Qué pasa**: Ninguna de estas páginas de detalle de entidad utiliza `TituloModulo`, careciendo del elemento `header .bg-gradiente-marca[aria-hidden]`. El `h1` y los grupos sí reciben la entrada (verificado: `CabeceraCliente.tsx:37`, `CabeceraProyecto.tsx:148` tienen `h1`), pero falta la firma de marca de 560 ms, así que las fichas —donde más tiempo se trabaja— entran con una coreografía incompleta respecto de los listados.
- **Propuesta**: Incorporar la barra de marca animada `<span aria-hidden="true" className="bg-gradiente-marca h-1 w-16 shrink-0 rounded-full" />` dentro de los encabezados de `CabeceraCliente`, `CabeceraPersona`, `CabeceraProyecto` e incidentes.
- **Prioridad**: Alta · **Esfuerzo**: M

### P3-22 Desfase de animación de entrada en Contratos por posición del botón de retorno
- **Dónde**: `src/componentes/contrato/FichaContrato.tsx:58`
- **Qué pasa**: Dentro de `<section className="flex flex-col gap-6">`, el primer hijo es `<Link href="/contratos">...`. Al no ser un `<header>` ni tener `h1`, la regla `.entrada-pagina > section > :nth-child(-n+4)` lo trata como el primer bloque de contenido y le aplica `entrada-contenido` (580ms, 80ms delay), desplazándolo de forma extraña respecto al título que se encuentra debajo.
- **Propuesta**: Integrar el enlace de retorno dentro del `header` o colocarlo en la prop `acciones` / contenedor superior para no desfasar la cascada `:nth-child`.
- **Prioridad**: Media · **Esfuerzo**: S

### P3-23 Listas y cuadrículas de tarjetas sin animación de entrada escalonada (resuelto en ce52e6d; VistaClientes ya lo estaba por fe61c2c)
- **Dónde**: `src/app/(panel)/inicio/FijadosYRecientes.tsx:45`, `src/componentes/cliente/VistaClientes.tsx:140`, `src/app/(panel)/teletrabajo/page.tsx:60`, `src/app/(panel)/administracion/page.tsx:209`
- **Qué pasa**: Las cuadrículas de tarjetas de fijados y recientes en Inicio, la vista de tarjetas de clientes, las salas de teletrabajo y los accesos de administración se renderizan de golpe. Solo `novedades/page.tsx` e `inicio/NovedadesDelInicio.tsx` utilizan hoy `EntradaEscalonada`.
- **Propuesta**: Aplicar `EntradaEscalonada` o el token de clase `animate-aparecer` con retrasos de animación secuenciales escalonados en las tarjetas de fijados, salas y administración.
- **Prioridad**: Media · **Esfuerzo**: M

### P3-24 Despliegue tosco sin animación en bloques de diagnóstico y ayuda `<details>` (resuelto en 4fe6376)
- **Dónde**: `src/app/(panel)/administracion/incidentes/[incidente]/page.tsx:136`, `src/app/(panel)/administracion/pantallas/page.tsx:59`, `src/app/(panel)/administracion/pantallas/anuncios/page.tsx:43`
- **Qué pasa**: Los bloques `<details>` se expanden y contraen de forma instantánea y rígida, sin transición fluida en la altura del contenedor ni animación de rotación en el indicador o chevron de apertura.
- **Propuesta**: Implementar un componente `Acordeon` basado en Radix UI (`@radix-ui/react-accordion`) o aplicar transiciones CSS con `interpolate-size: allow-keywords` y `transition: height var(--wiwo-motion-fast) var(--ease-neo)`.
- **Prioridad**: Baja · **Esfuerzo**: M

### P3-25 Cifras comparativas y métricas de KPIs estáticas sin animación numérica
- **Dónde**: `src/componentes/indicadores/TableroDeIndicadores.tsx:93`, `src/componentes/supervision/HojasDelEquipo.tsx:32`, `src/app/(panel)/inicio/AvisoJornada.tsx:45`
- **Qué pasa**: Al cambiar las fechas en el tablero de indicadores o al cargar la supervisión del equipo, los deltas numéricos (+4, -12) y totales se dibujan planos y estáticos, sin ninguna microanimación de actualización o conteo.
- **Propuesta**: Añadir la clase `animate-entrar-escala` o `animate-aparecer` a las celdas de deltas y contadores clave al actualizar datos.
- **Prioridad**: Baja · **Esfuerzo**: S

---

### Deuda técnica

### P3-26 `loading.tsx` padre heredado erróneamente en fichas de detalle dinámicas (resuelto en 6072d52)
- **Dónde**: `src/app/(panel)/clientes/[id]/page.tsx`, `src/app/(panel)/prospectos/[id]/page.tsx`, `src/app/(panel)/contratos/[id]/page.tsx`, `src/app/(panel)/equipo/[id]/page.tsx`
- **Qué pasa**: Al no existir un `loading.tsx` dedicado en los directorios `[id]`, Next.js recurre al `loading.tsx` del directorio padre. Esto provoca que mientras se carga la ficha individual de un cliente o contrato, la pantalla muestra fugazmente el esqueleto de la tabla y el título plural ("Clientes", "Contratos").
- **Propuesta**: Crear archivos `loading.tsx` específicos en cada subdirectorio `[id]` que rendericen un esqueleto de cabecera con avatar, badges y pestañas con `Hueso`.
- **Prioridad**: Alta · **Esfuerzo**: M

### P3-27 Acoplamiento de dominios en filtros de tickets (`filtrarPersonas` desde salas) (resuelto en 47e25a9)
- **Dónde**: `src/componentes/tickets/MenuAsignadoTicket.tsx:15`
- **Qué pasa**: Para filtrar el desplegable de asignación de tickets se importa `filtrarPersonas` desde `@/dominio/salas`, generando un acoplamiento indebido entre el dominio de mesa de ayuda y el de videoconferencias y salas físicas.
- **Propuesta**: Trasladar la utilidad de filtrado de personal a `@/dominio/personal.ts` o `@/lib/busqueda.ts` y consumirla desde ambos módulos.
- **Prioridad**: Media · **Esfuerzo**: S

### P3-28 Casts de tipo inseguros `as unknown as Record<string, unknown>` en formularios (resuelto en 6db7735)
- **Dónde**: `src/app/(panel)/clientes/[id]/page.tsx:274`, `src/componentes/cliente/AccionesCliente.tsx:83`, `src/componentes/prospecto/AccionesProspecto.tsx:75`
- **Qué pasa**: Para alimentar `FormularioRecurso` se recurre a doble casteo inseguro `as unknown as Record<string, unknown>`, desactivando la verificación estática de TypeScript sobre los campos mutables del recurso.
- **Propuesta**: Tipar `FormularioRecurso<T>` con un genérico `T extends Record<string, unknown>` y definir transformadores de registro tipados en `campos.ts`.
- **Prioridad**: Baja · **Esfuerzo**: S

---

## Tabla resumen

| Código | Título | Categoría | Prioridad | Esfuerzo |
|---|---|---|---|---|
| **P3-01** | Discrepancia visual en cabeceras de detalle de entidad | Inconsistencias | Alta | M |
| **P3-02** | Divergencia en botón y formato de retorno a listado anterior | Inconsistencias | Media | S |
| **P3-03** | Asimetría en botón de fijar (`BotonFijar`) en detalles de entidad | Inconsistencias | Media | M |
| **P3-04** | Discrepancia en botones de acción y menú ⋯ en cabeceras de entidad | Inconsistencias | Media | M |
| **P3-05** | Doble panel lateral para editar la misma persona en Organización | Inconsistencias | Alta | L |
| **P3-06** | Cuádruple implementación idéntica de matriz de asignación N-a-M | Duplicación | Alta | L |
| **P3-07** | Selectores de persona buscables reimplementados ad-hoc | Duplicación | Media | M |
| **P3-08** | Diálogos de eliminación y borrado divergentes | Duplicación | Media | M |
| ~~P3-09~~ | Descartado: nombre «Licitaciones» deliberado | — | — | — |
| ~~P3-10~~ | Descartado: nombre «Licitaciones» deliberado | — | — | — |
| **P3-11** | Dos textos distintos para volver al listado desde un prospecto | Refinamiento | Baja | S |
| **P3-12** | Uso de diálogo nativo bloqueante `window.confirm` en FlujoLicitacion | Sin terminar | Alta | S |
| **P3-13** | Acción "Ver como" deshabilitada sin explicación contextual | Sin terminar | Baja | S |
| **P3-14** | Estado vacío ad-hoc con texto plano sin estilo en Novedades | Sin terminar | Media | S |
| **P3-15** | Inconsistencia gramatical de tratamiento: Voseo rioplatense vs Tuteo neutro | Refinamiento | Media | S |
| **P3-16** | Discrepancia terminológica en botones de confirmación de formularios | Refinamiento | Media | M |
| **P3-17** | Conflicto terminológico "Borrar" vs "Eliminar" en acciones destructivas | Refinamiento | Baja | S |
| **P3-18** | Omisión generalizada de feedback de éxito (`useAviso`) tras mutaciones | Refinamiento | Alta | M |
| **P3-19** | Icono ausente en botón "Editar" de cabeceras de cliente y prospecto | Refinamiento | Baja | S |
| **P3-20** | Doble coreografía (JS + CSS) en la cabecera de Novedades e Inicio | Animaciones | Media | S |
| **P3-21** | Ausencia de la firma de marca animada en páginas de detalle de entidad | Animaciones | Alta | M |
| **P3-22** | Desfase de animación de entrada en Contratos por posición del botón de retorno | Animaciones | Media | S |
| **P3-23** | Listas y cuadrículas de tarjetas sin animación de entrada escalonada | Animaciones | Media | M |
| **P3-24** | Despliegue tosco sin animación en bloques de diagnóstico y ayuda `<details>` | Animaciones | Baja | M |
| **P3-25** | Cifras comparativas y métricas de KPIs estáticas sin animación numérica | Animaciones | Baja | S |
| **P3-26** | `loading.tsx` padre heredado erróneamente en fichas de detalle dinámicas | Deuda técnica | Alta | M |
| **P3-27** | Acoplamiento de dominios en filtros de tickets (`filtrarPersonas` desde salas) | Deuda técnica | Media | S |
| **P3-28** | Casts de tipo inseguros `as unknown as Record<string, unknown>` en formularios | Deuda técnica | Baja | S |
