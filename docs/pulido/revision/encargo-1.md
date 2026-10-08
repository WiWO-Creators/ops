# Revisión manual — Encargo 1 (rápidas y visibles)

Rama `feat/pulido-1`, código en `6072d52`. Los `confirm()` nativos pasan a confirmaciones del
sistema (o a un paso propio en el tablero de mantenimiento), aparecen `loading.tsx` y `error.tsx`
que faltaban, el portal usa `TituloModulo`, `Boton` exige `aria-label` con `soloIcono`, los textos
visibles pasan de voseo a tuteo y la cabecera de Novedades e Inicio tiene una sola coreografía.

## Entorno

```bash
PORT=3421 ORIGENES=http://localhost:3000,http://127.0.0.1:3000 node mock/servidor.js &
pnpm build && API_BASE=http://localhost:3421/api/v1 PORT=3000 pnpm start &
```

Credenciales del mock: equipo `ana@wiwo.me` / `mock1234` (en `/colab`); portal `clienta@acme.com` /
`portal1234` (en `/`).

## Flujos

### 1. Confirmaciones sin diálogo del navegador

- **Meeting Paper, salir con cambios** (Ana): un Proyecto → pestaña Meeting Paper → abrir un acta →
  «Corregir», cambiar un texto → «← Volver a los Meeting Papers». Esperado: diálogo chico «Salir sin
  guardar» con «Seguir editando» (vuelve al editor sin perder nada) y «Salir sin guardar» (vuelve a la
  lista). Sin cambios, «Volver» sale directo.
- **Tareas propuestas, crear todas** (Ana): en un acta con propuestas pendientes y sin ninguna marcada,
  «Crear todas (N)». Esperado: el botón se reemplaza por una confirmación en línea con la advertencia y
  «Crear N tareas» (primario, con foco). «Cancelar» o Escape vuelven al botón. Con propuestas
  marcadas, crea directo sin preguntar.
- **Flujo de licitación** (Ana): `/prospectos` → abrir el alta de licitación → «Descartar borrador».
  Esperado: confirmación en línea dentro del modal, en lugar de la fila de botones; Escape cancela sin
  cerrar el modal. «Cerrar sin guardar» solo aparece cuando hay aviso de guardado local fallido
  (no verificado a mano: requiere que falle `localStorage`).
- **Tablero de mantenimiento** (Ana): `/s/k3p9x` → pulsar un interruptor con triángulo apagado.
  Esperado: bloque ámbar al pie de la lista con «Cancelar» / «Encender», foco en «Encender»; los demás
  interruptores quedan deshabilitados mientras tanto; Escape cancela. Apagar uno peligroso no pregunta.

### 2. Cargas

- Ana: navegar a `/mis-tareas`, `/tareas/tablero` y `/tareas/calendario`. Esperado durante la carga:
  su propio título («Mis tareas», «Tablero de …», «Calendario de …») y el orbe, no «Cargando tareas…».
- Ana: desde cada listado abrir una ficha de `/clientes/[id]`, `/prospectos/[id]`, `/contratos/[id]` y
  `/equipo/[id]`. Esperado: esqueleto de ficha (volver, avatar, nombre, insignias, pestañas, bloque),
  no el título plural del listado. Con el mock responde rápido: para verlo, limitar la red en DevTools.

### 3. Contingencias

- `/sala/[token]`: con un `panel_token` válido (Salas → Administrar salas), detener el mock y esperar el
  refresco de 60 s. Esperado: «Reconectando con Ops…» con logo, sin controles de colaborador; reintenta
  cada 30 s y recarga la página tras 5 intentos. **No verificado** en esta rama.
- `/s/k3p9x`: si falla la lectura del estado, pantalla en la estética del tablero («Sin lectura») con
  «Reintentar», sin detalle técnico. **No verificado** a mano (forzar el fallo sin que `pedir()`
  redirija a `/colab` depende de cómo caiga el mock).
- `/colab` no tiene `error.tsx` propio a propósito: lo cubre `(acceso)/error.tsx` (ver su docblock).

### 4. Portal

- Clienta: `/portal/proyectos`, `/portal/soporte`, `/portal/perfil` (y `archivos`, `anuncios`, `ayuda`
  si la cuenta los tiene activos). Esperado: título grande con gradiente y la barra de marca debajo,
  igual que en `/portal/reporte`; en proyectos y soporte el botón de acción queda a la derecha del título.

### 5. Movimiento

- Ana: `/novedades`. Esperado: el título entra con la animación CSS de página (desenfoque a nítido) y la
  firma se barre una vez; los ítems entran escalonados después, sin que la cabecera haga un segundo
  fundido desde arriba. Mismo criterio en el bloque «Lo nuevo en Ops» del Inicio cuando hay novedades
  sin ver.
- Con «reducir movimiento» del sistema: nada se mueve; el punto verde de la mini llamada de teletrabajo
  queda quieto (antes latía igual).

### 6. Textos y accesibilidad

- Voseo a tuteo en 19 archivos. Muestras: `/perfil` → placeholder de firma «Todavía no tienes firma.»;
  alta de persona en Equipo → ayuda de Áreas «Puedes marcar varias áreas.»; Administración → recálculo
  de foto diaria sin permiso «No tienes permiso para recalcular»; portal, gráfico del tablero: leyenda
  «Depende de ti».
- `Boton` con `soloIcono` sin `aria-label` ya no compila (`pnpm typecheck`).

## Comprobado en esta rama

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde (2600 pruebas).
- Navegador: `mantenimiento`, `acta` y `ficha-del-cliente` en verde. `portal-paridad` y
  `visibilidad-del-portal` fallan por causas ajenas al encargo: el mock ya trae tareas completadas
  donde la prueba espera un listado vacío, y el aviso flotante repite el texto del alerta en línea.
- Capturas claro/escritorio y oscuro/móvil de Novedades, tablero con confirmación y portal.
