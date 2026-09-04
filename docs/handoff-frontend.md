# Handoff — lo que queda del frontend

Podado el 04/09/2026. Lo que este documento decía sobre el estado del proyecto envejeció mal y se
borró: el estado vive en [`README.md`](README.md) (fases), en [`fases/`](fases/) (criterios) y en
[`encargo-brechas-del-board-PNDNG.md`](encargo-brechas-del-board-PNDNG.md) (inventario contra el
board). Acá queda sólo lo que sigue guiando trabajo y no está escrito en otro lado.

Regla de lectura: `docs/contrato-api.md` manda sobre las fichas de `docs/modulos/`, y el código manda
sobre los dos.

---

## 1. El detalle de Proceso

Es el trabajo más grande que queda del panel y el que decide si F1 sirve.

`src/componentes/proyecto/DetalleTarea.tsx` muestra datos de cabecera y **dos contadores**
(`DetalleTarea.tsx:140-141`): cantidad de comentarios y avance de la lista de verificación. No
muestra ni permite editar ninguno de los dos. Desde `03b9b8a` es un diálogo centrado y no un cajón,
con el estado en la URL (`?tarea={id}`), pero sigue siendo de lectura.

Falta, y **la API ya lo sirve todo**:

- Comentarios: `GET /tasks/{id}/comments` más `POST`, `PATCH` y `DELETE`.
- Lista de verificación: `GET /tasks/{id}/checklist` más `POST`, `PUT` para reordenar, `PATCH` y
  `DELETE`.
- Cronómetros del proceso: `GET /tasks/{id}/timers`.
- Adjuntos: `GET /tasks/{id}/files`, y la subida con `POST /tasks/{id}/files`.
- Recordatorios: `GET|POST /tasks/{id}/reminders`.
- Descripción editable en sitio, asignados, seguidores, etiquetas y campos personalizados, todo por
  `PATCH /tasks/{id}` y `PATCH /custom-fields/values`.
- La ruta `/procesos/[id]` como página. Hoy sólo hay diálogo, y una vista de Proceso no se puede
  compartir por enlace.

---

## 2. Los dos huecos que quedan en la API

Todo lo demás que este documento pedía ya se construyó. Quedan dos, y ninguno bloquea una pantalla
entera:

- **`POST /files/{id}/link` — token de un solo uso.** Sin esto, `<img src>` y `<a download>` no
  pueden pedir binarios directo (no mandan `Authorization`) y todo pasa por el BFF. Funciona, pero
  encarece cada miniatura.
- **Preferencias de usuario.** No hay recurso: columnas visibles y orden por defecto no tienen dónde
  vivir, ni siquiera en `localStorage`. Un `GET|PUT /me/preferencias` con un JSON opaco alcanza. Las
  vistas guardadas ya se resolvieron aparte, con `GET|POST /filter-presets`.

---

## 3. Operación

- **Despliegue**: `.github/workflows/deploy.yml` publica `main` en `ops.wiwo.me` por SSH
  (`git pull` + `pnpm build` + `pm2 restart`). No hay staging: `dev` no tiene workflow.
- **Al desplegar**, consultar `GET /api/v1/health`: si `auth_header_visible` es `false`, poner
  `API_CABECERA_TOKEN=x-api-key` en el `.env`.
- **El mock y la API real difieren en la descarga**: el mock sirve `/api/v1/files/{id}/download` y la
  API real `/api/v1/files/{tipo}/{id}/download`.
- **Limpieza pendiente**: `wiwo-board-wt-api-v1`, `wiwo-board-wt-iteraciones-tarea` y
  `frontend-wt-responsive-solido` siguen en `~/ops.wiwo/` como worktrees huérfanos (sin `.git`
  válido), ocupando disco.
