# Revisión de formatos de audio en Meeting Paper

El selector y la API admiten MP4, M4A, AAC, MP3, MPEG, MPGA, WAV, OGG, OPUS,
FLAC, AIFF, AIF, WebM, M4V, MOV, MKV, AVI, 3GP, WMA y AMR. El servidor convierte
la pista de audio para transcribirla y descarta el video. El límite sigue siendo 100 MB.

## Entorno de revisión

- Frontend: `/home/wiwo/ops.wiwo/ops-v2-wt-formatos-audio`.
- API: `/home/wiwo/ops.wiwo/wiwo-board-wt-formatos-audio`.
- Rama en ambos repositorios: `fix/formatos-audio`.

La revisión requiere ejecutar ambos worktrees juntos, con ffmpeg y la configuración
de transcripción del entorno. Estos cambios todavía no están publicados en producción.

## Pasos

1. Abrir `GET /espacios/<id>` con un usuario miembro del proyecto y entrar a
   **Meeting Paper**. Crear un acta y elegir **Archivo de audio**.
2. Seleccionar un MP4 que contenga una conversación sin video, de menos de 100 MB.
   Debe aparecer en el selector y permitir escribir el Meeting Paper. El resultado
   debe reflejar la conversación.
3. Repetir con un MOV o MKV que contenga voz y video. El acta debe basarse en la voz;
   no debe describir imágenes que no se mencionen en la conversación.
4. Probar un MP3 o WAV habitual para verificar que sigue funcionando.
5. Probar un archivo vacío, uno de más de 100 MB y una extensión no admitida:
   deben rechazarse antes de enviarlos.
6. Probar un video sin pista de audio y un archivo de texto renombrado a `.mp4`:
   deben rechazarse sin generar un acta.

La selección por extensión no garantiza que cualquier códec sea legible: los
archivos corruptos o con un códec no disponible deben mostrar un error.
