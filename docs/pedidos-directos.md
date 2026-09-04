# Pedidos directos del usuario

Lista corta de pedidos que el usuario fue dando por chat, fuera del encargo de
[brechas del board](encargo-brechas-del-board-PNDNG.md). A diferencia de ese documento, esta lista
no se cierra: se va agregando a medida que aparecen pedidos nuevos, y cada fila se actualiza cuando
cambia de estado. Back = `wiwo-board`. Front = `ops-v2`.

## Estado (03/09/2026)

| Ítem | Back | Front | Notas |
|---|---|---|---|
| Aplicar filtros al tablero kanban | ✅ `main` | ✅ `main` | |
| Guardar selección de filtros (presets) | ✅ `main` | ✅ `main` | |
| Imágenes de clientes y proyectos | ✅ `main` | ✅ `main` | |
| Renombrar "Notas" a "Meeting Paper" | ✅ `main` | ✅ `main` | |
| Tabla de tareas con orden automático (pendientes y recientes primero) | ✅ `main` | ✅ `main` | |
| Asignar área y cargo a cada persona (directores derivan) | ✅ `main` (`4d53671`/`ef1e814`) | ✅ `main` (`8c65fe1`) | Back: cargo Director + catálogo de áreas + auto-follower del director en las tareas de su gente. Front: columnas/filtros en Equipo, ficha de persona, pantalla `/equipo/mi-area` |
| Mover tareas en el tablero kanban (drag&drop) | ✅ `main` | ✅ `main` | Ya existía en ambos repos cuando se revisó. De paso se encontró y corrigió un bug real: reordenar dentro de la misma columna no exigía permiso (`51b1993`) |
| Borrar funciones de venta y contrato | ✅ `main` (`b854567`) | ✅ `main` (`be6dd27`) | Front lo había sacado antes; back se emparejó borrando `Escritura/Cotizacion.php`, `RecursoContratos.php`, `RecursoVentas.php` (recortado, no borrado — ver commit), `comparar-ventas.php`, `comparar-contratos.php`, etc. |
| Proyectos en Drive: carpeta por Cliente > Proyecto > Tarea | 🔄 en curso | ❌ sin empezar | Rama `feat/drive-uploads` en `wiwo-board`, otra sesión trabajando en vivo |
| Patente de proyecto (código `XXX-123` único, usado como nombre de carpeta en Drive) | 🔄 en curso | ❌ sin empezar | Mismo frente que Drive, misma rama |

## Cómo verificar lo hecho

Con `board-api` (contenedor podman, puerto 8091) y `ops-v2` (`npm run dev`, puerto 3000) levantados,
login en `/colab` con el usuario de prueba local (ver memoria de la cuenta). Rutas relevantes:
`/procesos/tablero` (kanban con filtros y drag&drop), `/equipo` y `/equipo/mi-area` (cargo/área).

## Reglas

Mismas del [encargo de brechas](encargo-brechas-del-board-PNDNG.md#reglas-del-encargo): todo lo que
agrega algo nuevo se construye con `feature-aislada` (worktree propio, rama propia, pausa para
revisión, merge). Nada de trabajar directo sobre el clon principal.
