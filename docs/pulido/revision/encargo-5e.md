# Revisión manual — Encargo 5E (portal, móvil y movimiento)

Rama `feat/pulido-5e`, código en `7ce8ef8`. El portal en móvil deja el avatar del cliente chico
dentro de la cabecera y lista los proyectos en tarjetas; el chat del orbe en móvil ocupa el ancho de
la pantalla; las respuestas del chat, las aprobaciones del portal y el delta de indicadores entran
con `animate-aparecer`; `livekit.css` y `acta.css` dejan de viajar en `globals.css`; los colores del
panel `/s/[clave]` y del explorador de Drive salen de tokens donde existen, y toda duración de
transición fuera de `/pantalla` usa `duration-rapida|media|lenta`, con lint que lo exige.

## Entorno

```bash
PORT=3421 node mock/servidor.js &
pnpm build && API_BASE=http://localhost:3421/api/v1 PORT=3000 pnpm start &
```

Staff: `ana@wiwo.me` / `mock1234`. Portal: `clienta@acme.com` / `portal1234`. Si aparece «Abre tu
jornada», abrirla antes (`POST /api/bff/me/jornada` con cuerpo `{}`). Para móvil, DevTools con un
ancho de 375 px.

## Qué mirar

1. **Cabecera móvil del portal** (P4-13) — `/portal` a 375 px: el avatar de la empresa queda dentro
   de la barra (40 px) y la fila de navegación empieza pegada al margen, con cuatro destinos a la
   vista. En escritorio el avatar sigue grande y colgando sobre el contenido.
2. **Proyectos en tarjetas** (P4-14) — `/portal/proyectos` a 375 px: cada proyecto es una tarjeta con
   nombre (enlace a su ficha), insignia de estado, barra de avance con porcentaje, tareas abiertas y
   entrega. En escritorio sigue la tabla.
3. **Aprobaciones del portal** (P4-17) — En la ficha de un proyecto del portal con una tarea en
   espera de respuesta, aprobar o rechazar con motivo: el texto «Aprobaste/Pediste cambios» entra
   con un fundido corto; «Responder de nuevo» trae los botones con el mismo fundido. Al cargar la
   página las respuestas previas aparecen quietas.
4. **Chat del orbe en móvil** (P4-20) — En `/inicio` a 375 px, abrir el orbe: el panel ocupa todo el
   ancho, se apoya sobre la barra inferior, no muestra el tirador de redimensionado y el botón
   flotante se oculta hasta cerrar con «Cerrar». En escritorio conserva tamaño, tirador y posición.
5. **Entrada de los turnos del chat** (P4-18) — Con una IA que responda, cada pregunta, respuesta,
   bloque de fuentes, propuesta y pregunta del asistente entra con `animate-aparecer`.
6. **Delta de indicadores** (P3-25) — En `/indicadores`, cambiar la fecha base o la de corte: la
   columna «Diferencia» vuelve a entrar con un fundido.
7. **Hojas de LiveKit y del acta** (P4-21) — En `/portal`, DevTools → Sources/Network: no
   se descargan las reglas de `[data-lk-theme='wiwo']` ni `.acta-editor`. En el panel siguen
   llegando (la llamada en curso vive en el layout): una sala de `/teletrabajo` se ve con su tema, y
   en `/proyectos/1?tab=actas`, al abrir un Meeting Paper y pulsar «Corregir», la hoja del editor es
   blanca también en tema oscuro.
8. **Colores del panel `/s/[clave]` y de Drive** (P4-12) — En el panel de interruptores, el ícono
   de advertencia y los estados de peligro usan el ámbar de `--texto-aviso` con el tema claro u
   oscuro. En el explorador de Drive, PDF, hoja, presentación y texto toman los tokens de peligro,
   éxito, aviso y texto sutil.
9. **Duraciones** — Hover de botones, tarjetas, selector de tema y menús: mismas transiciones, ahora
   con `duration-rapida`/`duration-media` y la curva `ease-neo`. El cierre en iris de la bienvenida
   dura 420 ms. La barra de cuenta regresiva del aviso de cierre de jornada sigue avanzando continua.
   `pnpm exec eslint` marca cualquier `duration-N` literal nuevo fuera de `src/app/pantalla/`.

## Verificado

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde (2628 pruebas).
- Navegador, contra el mock: `columnas-del-portal`, `kanban-del-contacto`, `gestion`, `acta`,
  `ficha-del-cliente` y `avisos-error` pasan.
- Capturas Playwright en claro/oscuro: portal (inicio y proyectos, escritorio y móvil), chat del orbe
  (escritorio y móvil), `/teletrabajo`, `/indicadores` y el editor del Meeting Paper. En móvil el
  panel del chat mide 375 px desde `x = 0`; el portal no carga las reglas de LiveKit ni del acta;
  `/teletrabajo` sí carga LiveKit; el editor del acta tiene fondo `rgb(255, 255, 255)` en los dos
  temas; la lista de proyectos del portal muestra dos tarjetas en móvil.

## No verificado

- `mapa-presencia` falla porque necesita sesión superadmin y datos de presencia que el mock no
  trae; `dictado` falla porque el mock responde «Recurso de IA desconocido: "chat"» y el campo del
  chat no llega a montarse. Por lo mismo no se vio la entrada de los turnos del chat (P4-18).
- El delta de indicadores (P3-25): el mock responde «Recurso desconocido: "indicadores"».
- La transición de las aprobaciones del portal (P4-17) y la sala de LiveKit conectada: no se
  provocaron en el mock.
- P4-19 sin cambio de código (ya resuelto), con el motivo en su documento.
