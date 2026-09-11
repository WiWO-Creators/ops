# Cron de Ops: operación y revisión

## Alcance real

`node-cron`, bajo PM2 como `ops-cron`, pasa a programar las rutinas existentes mediante la API interna de Board. La lógica de negocio sigue en PHP: no se reescriben facturación, correo, recurrencias ni hooks. Este cambio migra la programación a Node, no elimina PHP del procesamiento.

Node programa cuatro trabajos independientes: `/rutinas` cada cinco minutos, `/jornadas` cada quince minutos, `/papelera` diariamente y el corte de cronómetros a la hora configurada. Cada cinco minutos se comprueban también cortes pendientes; al arrancar se recuperan todos los trabajos. Antes de ejecutar rutinas y jornadas se recupera el corte pendiente para evitar que un cierre antiguo asigne una hora posterior. La limpieza de papelera usa `OPS_CRON_TRASH_SCHEDULE`, cuyo valor predeterminado es `0 3 * * *`. Los horarios usan `America/Santiago`, incluyendo los cambios de horario de Chile. El corte se guarda en el backend para que repetir una solicitud no duplique el cierre.

El corte diario confirmado es a las **19:30 de America/Santiago**. El despliegue exige `OPS_TIMER_CUTOFF_HOUR=19:30` en ambos repositorios.

## Inventario cubierto

`application/models/Cron_model.php::run()` conserva estas rutinas:

- Recordatorios de personal, eventos y tareas; tareas recurrentes.
- Propuestas, facturas vencidas y próximas a vencer; expiración de presupuestos.
- Vencimiento de contratos y recordatorios de firma.
- Cierre automático de tickets; facturas y gastos recurrentes.
- Importación IMAP de tickets e integración de correo de leads.
- Limpieza del registro de actividad, envío de correos programados y limpieza de registros TwoCheckout.
- Corte legado por límite de tiempo y avisos de tareas no facturadas.
- Envío y reintento de la cola de correo; corrección de asignados/seguidores duplicados y limpieza de archivos temporales.

Fuera de `Cron_model::run()`, `/jornadas` conserva el procesamiento del antiguo `api v1 live cron` y `/papelera` conserva la purga del antiguo `api v1 trash cron`. Estos dos lanzadores también deben retirarse en la transición.

Además se ejecutan `before_cron_run` y `after_cron_run`, respetando los módulos activos. Los hooks encontrados en el repositorio incluyen objetivos, backups, encuestas, limpieza diaria de sesiones, score diario de clientes, correo entrante Wiwo y procesamiento de la cola de correo al cliente (`register_cron_task`). Se mantienen las opciones que habilitan cada rutina, sus condiciones y horarios internos: programar Node no activa integraciones que estaban apagadas.

## Configuración y orden de despliegue

1. Configurar el mismo secret de GitHub Actions `OPS_CRON_SECRET` en ambos repositorios, con al menos 32 caracteres. Se recomienda un valor aleatorio hexadecimal de 64 caracteres; nunca copiarlo a commits, capturas o logs.
2. Configurar la variable `OPS_TIMER_CUTOFF_HOUR` en ambos repositorios con la hora confirmada en formato `HH:MM` de 24 horas.
3. En el frontend configurar `OPS_CRON_BASE_URL=https://board.wiwo.me/index.php/api/cron`. Opcionalmente configurar `OPS_CRON_REQUEST_TIMEOUT_MS`: valor predeterminado `240000` ms y máximo admitido `300000` ms. `OPS_CRON_TRASH_SCHEDULE` permite cambiar la programación de papelera; su valor predeterminado es `0 3 * * *` en Santiago.
4. Desplegar primero Board. Su workflow crea atómicamente `application/config/ops-cron.php` con permisos `0600` y propietario de `application/config/database.php`. El usuario PHP debe poder leer ese archivo; el preflight del siguiente paso detecta un backend sin configuración accesible.
5. Desplegar Ops. El workflow escribe `.env.cron` con permisos `0600`, ejecuta `node scripts/cron.mjs --check` contra `GET /estado` sin disparar trabajos y valida hora/zona antes de reiniciar servicios. Luego registra PM2 en systemd, ejecuta `pm2 startOrRestart ecosystem.cron.cjs --update-env`, guarda la lista de procesos y verifica `pm2-root` activo y habilitado.

Las variables llegan al servidor mediante `ssh-action envs`; nunca se interpolan directamente como código shell. Por compatibilidad con el formato privado `.env.cron`, los valores no admiten saltos de línea ni comillas simples. El archivo no debe formar parte del bundle público ni versionarse.

Antes de activar el servicio, revisar los límites de tiempo del proxy y PHP-FPM en el hosting. El controlador solicita `set_time_limit(0)`, pero eso no elimina límites externos: una petición larga puede ser interrumpida por el proxy o el gestor de PHP antes del timeout de Node.

La comprobación de variables ocurre antes de actualizar los checkouts. Un secret ausente, hora inválida o sistema sin systemd aborta el despliegue: no se anuncia cron activo con configuración incompleta. Un fallo posterior de conectividad/configuración de Board aborta antes del reinicio PM2 y requiere corregir la causa y repetir el despliegue.

## Transición desde el cron anterior

La migración operativa no puede darse por terminada hasta auditar el servidor de Board. El acceso SSH anterior fue rechazado, por lo que no está confirmado si existen crontabs de usuario, `/etc/cron.d`, timers systemd o cron configurado mediante el panel del hosting.

Con acceso autorizado, inventariar esos lanzadores y localizar los tres cron anteriores: `cron/index` (también invocado como `index.php cron`), `api v1 live cron` y `api v1 trash cron`. Después de verificar `ops-cron` activo y una ejecución completa de cada reemplazo, desactivar esas entradas concretas y conservar copia para rollback. No borrar otros trabajos del servidor ni usar `crontab -r`. Las URLs legacy externas también deben retirarse de sus servicios de programación.

El bloqueo PHP evita ejecuciones simultáneas, pero no sustituye esta limpieza: dos programadores podrían invocar secuencialmente las rutinas. No declarar «todos los cron migrados» hasta comprobar el origen de las ejecuciones y retirar el lanzador antiguo.

## Verificación operativa

- `pm2 describe ops-cron`: proceso online, una instancia y reinicios estables.
- `systemctl is-enabled pm2-root` y `systemctl is-active pm2-root`: persistencia configurada y servicio activo.
- `node scripts/cron.mjs --check`: preflight autenticado correcto, misma hora de corte y `America/Santiago`. No ejecuta rutinas ni corta cronómetros.
- `pm2 logs ops-cron --lines 50 --nostream`: revisar últimas ejecuciones y errores sin mostrar secretos. Algunos hooks PHP capturan errores y solo los registran en sus logs legacy; un resultado `completed` no demuestra que todos los correos se entregaron. Revisar también los logs PHP, colas y resultados esperados de cada integración. Las rutinas pueden enviar correos y crear documentos; no dispararlas manualmente en producción como prueba de humo.
- En un entorno de pruebas, comprobar cronómetros abiertos antes del corte, ninguno abierto y repetición de la solicitud; solo los elegibles deben cerrarse y la segunda solicitud no debe modificar los ya cerrados.
- Comprobar recuperación tras detener y reactivar el scheduler y tras indisponibilidad temporal del backend. Antes de reiniciar producción, verificar que PM2 tiene guardados tanto `ops-v2` como `ops-cron`.

## Rollback

Detener `ops-cron` antes de restaurar las entradas auditadas de los tres lanzadores legacy: `cron/index` o `index.php cron`, `api v1 live cron` y `api v1 trash cron`. Restaurar una sola entrada por trabajo, evitando duplicados. Guardar después la lista PM2. El corte diario nuevo dejará de programarse durante el rollback; no asumir que el antiguo límite de duración de cronómetros aplica la misma hora de corte.
