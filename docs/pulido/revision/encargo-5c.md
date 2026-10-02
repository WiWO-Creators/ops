# Revisión manual — Encargo 5C (carga, error y vacío)

Rama `feat/pulido-5c`, código en `881fece`. Los errores en línea usan `AvisoEnLinea` (entra con
`animate-entrar-abajo` y admite `elemento="span"` dentro de contenedores en línea); el portal tiene
esqueletos `loading.tsx`; el árbol de Drive espera con filas de `Hueso`; los errores sin salida
ganan «Reintentar»; los controles del encabezado de Tareas y Mis tareas ya no saltan; toda lectura al
BFF que recibe un `401` dice «Se cerró tu sesión…».

## Entorno

```bash
PORT=3421 node mock/servidor.js &
pnpm build && API_BASE=http://localhost:3421/api/v1 PORT=3000 pnpm start &
```

Staff: `ana@wiwo.me` / `mock1234`. Portal: `clienta@acme.com` / `portal1234`. Si aparece «Abre tu
jornada», abrirla antes (`POST /api/bff/me/jornada` con cuerpo `{}`). Para ver los esqueletos,
limitar la red en DevTools (p. ej. «Slow 3G»): con el mock responden demasiado rápido.

## Qué mirar

1. **Esqueletos del portal** (P4-08) — Entrar al portal y, con la red limitada:
   - Desde `/portal`, abrir un proyecto: se ve la cabecera (volver, imagen, nombre, estado, fechas),
     la fila de pestañas y tres tarjetas antes de la ficha, sin salto al llegar.
   - Ir a «Tickets», «Proyectos» o «Perfil»: esqueleto general (título, firma y tarjeta con filas).
   - `/portal/reporte` conserva su esqueleto propio.
2. **Árbol de Drive** (P4-15) — `/proyectos/1?tab=archivos` con la red limitada: una tarjeta con barra
   de herramientas y cinco filas de icono y nombre en lugar del orbe con «Cargando Drive…». También en
   la ficha de un cliente (`/clientes/1`, panel de archivos).
3. **Reintentar** (P1-21) — En el calendario (`/proyectos/1?tab=calendario`) y en Hitos
   (`/proyectos/1?tab=hitos`), si la carga falla, el bloque de error trae «Reintentar» y vuelve a
   pedir sin recargar la página. En `/proyectos/1` y `/proyectos/solicitudes`, un error de la API de
   esa ruta muestra «Reintentar», que hace `router.refresh()`.
4. **Encabezado sin saltos** (P1-22) — `/tareas`, `/tareas/tablero` y `/mis-tareas` con la red
   limitada: el botón «Completadas» (y «Creadas por mí» en Mis tareas) aparece deshabilitado con su
   etiqueta y se habilita al hidratar; en Mis tareas la barra de vencimiento reserva su alto.
5. **Errores en línea** (P1-17) — Con una pantalla ya cargada, detener el mock y guardar algo (p. ej.
   cambiar el estado de una tarea desde la tabla de `/proyectos/1?tab=tareas`, o editar el proyecto
   desde «Más»): el mensaje rojo entra desde abajo; en celdas y barras en línea se ve junto al
   control, sin romper la fila. Con «Reducir movimiento» del sistema no hay animación.
6. **Historial de aprobaciones** (P1-20) — En una tarea con rondas de aprobación, desplegar el
   historial: la carga se ve con el orbe y «Cargando las rondas…», no con texto suelto.
7. **Chat de sala** (P4-10) — En `/teletrabajo/<sala>`, si el envío falla: ícono de advertencia,
   «No se pudo enviar el mensaje.» y botón «Reintentar»; el aviso desaparece al volver a escribir.
8. **Sesión cerrada** (P1-16) — Borrar la cookie de sesión con un panel abierto (archivos, importar
   tareas, agregar al hito, historial de copias de una recurrencia) y forzar la recarga del panel: el
   error dice «Se cerró tu sesión. Vuelve a entrar para seguir trabajando.».

## Verificado

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde (2628 pruebas).
- Navegador, contra el mock: `acta`, `avisos-error`, `filtros`, `gestion`, `ficha-del-cliente`,
  `kanban-del-contacto`, `columnas-del-portal`, `organizacion`, `descripcion-ia` y
  `exportar-tareas-sheets` pasan.
- Sonda Playwright con la respuesta retenida: esqueleto de la ficha de proyecto del portal, esqueleto
  general del portal y esqueleto de Drive capturados en claro/oscuro y escritorio/móvil, sin errores
  de página.

## No verificado

- `ErrorRecargable` en navegador: con el mock detenido falla el layout completo del panel (500) y no
  se llega al error de la página. Hace falta que la API devuelva un error solo en esa ruta.
- Reintento del calendario y de Hitos, chat de sala con fallo de envío e historial de aprobaciones:
  el mock no ofrece una forma directa de provocar esos estados.
- Quedan escritos a mano, a propósito, los avisos rojos que llevan botón, ícono o lista
  (`AltaRapidaProceso`, `ChatOrbe`, `ChatAgente`, `ChatDeSala`, `DialogoReserva`,
  `NotificacionesDelDispositivo`, `AccesoGoogle`, `ModoCorreoAlCliente`, `FormularioDeAjustes`) y
  los rojos sin `role="alert"` o con `role="status"` (auditoría, selectores de Live), que son otra
  semántica.
- Hallazgos sin cambio de código: P2-05 (ya resuelto), P2-06, P2-15 y P4-06 (descartados), con el
  motivo en su documento.
