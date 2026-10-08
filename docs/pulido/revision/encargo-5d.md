# Revisión manual — Encargo 5D (cabeceras y controles de ficha)

Rama `feat/pulido-5d`, código en `1a36758`. Las fichas vuelven al listado con el nuevo `BotonVolver`
(flecha Lucide y tokens); Editar queda visible y las acciones destructivas pasan al menú ⋯ de
`MenuAccionesFila`, que además orquesta la confirmación de borrado; el regreso del contrato ya no se
anima desfasado; el filtro por campo usa el `Selector` del sistema; `Avatar` e `ImagenEntidad`
comparten la escala `TAMANOS_IDENTIDAD`; `PaginacionTabla` tiene su propio archivo, con modo
controlado y modo enlaces, y la usan papelera, incidentes y discusiones.

## Entorno

```bash
PORT=3421 node mock/servidor.js &
pnpm build && API_BASE=http://localhost:3421/api/v1 PORT=3000 pnpm start &
```

Staff: `ana@wiwo.me` / `mock1234`. Si aparece «Abre tu jornada», abrirla antes
(`POST /api/bff/me/jornada` con cuerpo `{}`).

## Qué mirar

1. **Volver al listado** (P3-02) — En `/clientes/1`, `/equipo/2`, `/prospectos/1`, `/proyectos/1` y
   el detalle de un incidente (desde `/administracion/incidentes`), arriba del título: flecha de
   Lucide, texto chico en tono sutil que se aclara al pasar el mouse, igual en todas. En la ficha de un
   contrato (`/contratos/<id>`) tiene el mismo aspecto.
2. **Acciones de ficha** (P3-04, P3-08) —
   - `/clientes/1`: estrella, logo editable, «Editar» y ⋯. El ⋯ ofrece «Dar de baja». En
     `/clientes/5` (Costa Norte, inactivo) ofrece «Reactivar» y «Enviar a la papelera», que abre la
     confirmación sin palabra escrita.
   - `/equipo/2`: «Editar» con lápiz y ⋯ con «Dar de baja». En una persona dada de baja, «Eliminar
     definitivamente» pide la confirmación escrita y el selector de quién hereda su trabajo.
   - `/prospectos/1`: «Editar» y ⋯ con «Eliminar prospecto»; como Colbún tiene licitaciones, la
     advertencia avisa que va a fallar.
   - `/licitaciones/101` y `/upsells/111`: «Editar», «Ganar» y «Perder» siguen visibles; «Eliminar»
     pasa al ⋯ y abre la misma confirmación de antes («va a la papelera junto con sus tareas…»).
   - La fila del listado `/equipo` conserva sus botones sueltos.
3. **Entrada del contrato** (P3-22) — Al abrir la ficha de un contrato, el enlace «Contratos» entra
   junto con el título, no después como un bloque de contenido.
4. **Filtro por campo** (P2-03) — En `/tareas`, «Agregar filtro» y elegir un campo de texto, número,
   fecha o sí/no: el operador (y el valor sí/no) son desplegables del sistema, con el mismo borde,
   redondeo y apertura que el resto.
5. **Tamaños de cara** (P2-04) — Las cabeceras de `/clientes/1` (cuadrado) y `/equipo/2` (círculo)
   miden lo mismo (48 px). Los avatares de listas, comentarios y tarjetas no cambian de tamaño.
6. **Paginación** (P2-14) — `/papelera` y `/administracion/incidentes` con más de una página:
   «Anterior» y «Siguiente» con aspecto de botón chico, apagados en los extremos, y siguen siendo
   enlaces (se abren en otra pestaña). En `/proyectos/1?tab=discusiones` con más de una página, el pie
   dice «Página X de Y · N en total» con los mismos botones.

## Verificado

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde (2628 pruebas).
- Navegador, contra el mock: `gestion`, `ficha-del-cliente`, `filtros`, `organizacion` y
  `borrado-cliente` pasan. `borrado-cliente` se adaptó al menú ⋯ y acota el aviso de la baja al de la
  ficha, porque la pila global de avisos repite el mismo texto.
- Capturas Playwright de las cabeceras de cliente, prospecto, persona, licitación y papelera en
  claro/oscuro y escritorio/móvil, y del menú ⋯ del cliente abierto.

## No verificado

- Ficha de contrato en navegador (P3-02, P3-04 y P3-22): el mock no tiene contratos y
  `/contratos/1` muestra «Ese contrato no existe».
- Paginación con más de una página en papelera, incidentes y discusiones: el mock no trae tantos
  registros.
- Borrado definitivo de una persona desde el ⋯ de su ficha y eliminación de licitación y upsell desde
  el ⋯: revisados en código, sin recorrerlos en navegador.
- P3-03 descartado: la API de fijados solo admite `project` y `client`, y los dos ya tienen
  `BotonFijar`. El contrato no tiene borrado en el panel, así que queda solo con «Editar».
