# Foto del participante: selección descartada durante la revalidación

Corrección del **1 de noviembre de 2026** tras el reporte «No aparece ninguna vista previa» al elegir un archivo desde el formulario administrativo.

## Diagnóstico

Los JPEG `Alice.jpeg` y `Derek.jpeg` indicados en el selector pasaron la inspección y normalización locales sin modificar los originales. Sus tamaños eran 168 905/179 197 bytes y sus dimensiones 704×1527/896×1195, dentro de los límites previstos. Se comprobó el procesamiento existente en memoria; no se guardaron esas fotos como datos de prueba en producción.

La consulta de logs de la hora inspeccionada no mostró peticiones a `media-upload`; no había objetos Storage o reservas de medios. El fallo se producía antes del transporte de subida. Esa ventana no prueba la ausencia de todos los intentos históricos.

Al volver del selector nativo se dispara el evento de foco. El proveedor de sesión inicia una revalidación y el formulario queda temporalmente sin `canWrite`. El guard inicial de `OrganizerForm.uploadPhoto` devolvía `null` inmediatamente si `canWrite` era falso, sin esperar la comprobación pendiente ni mostrar error. Por tanto, la protección de espera que ya tenía la sesión compartida nunca llegaba a ejecutarse en este formulario. Era un caso administrativo distinto del corregido previamente en los editores de perfil/regalo.

La prueba dirigida reprodujo el problema antes de corregirlo: el archivo se seleccionaba cuando el campo ya había pasado al estado pausado, no aparecía imagen y no se enviaba ninguna subida.

## Cambio

El formulario permite que una selección iniciada llegue a la sesión compartida mientras se comprueba un acceso de **organizador**. La sesión espera y vuelve a validar identidad, permisos y cancelación antes de enviar. Los estados cerrados, denegados y no administrativos siguen rechazándose. No se cambiaron permisos de servidor, cuotas, CORS, JWT o SQL.

Si la comprobación termina denegada, no se sube ni guarda nada y se muestra el mensaje de acceso correspondiente. Si termina válida, se crea la vista previa y la ruta queda en el borrador. **Guardar participante** sigue siendo el paso que asocia la foto; elegir el archivo no guarda todo el formulario automáticamente.

Código: [formulario administrativo](../src/components/admin/OrganizerForm.tsx). Regresiones: [pruebas del organizador](../tests/ui/organizer.spec.ts).

## Verificación

- Prueba previa que fallaba por ausencia de preview; después pasa con validación retenida explícitamente hasta procesar la selección.
- Caso negativo: validación denegada, cero subidas y escrituras, participante intacto.
- **60/60 casos UI** del organizador correctos en escritorio, tableta y móvil, incluidos los dos escenarios nuevos.
- **12 pruebas unitarias** de sesión/transporte, TypeScript y revisión estática correctos.
- Los ensayos de guardado completo se ejecutaron con datos sintéticos locales; las imágenes de los participantes reales no se cambiaron para comprobar esta corrección.

**Publicado:** `dpl_B2s6hEuTTFQGf74NP6XQFRdggkkC`, READY/Node 24.x, con rutas/cabeceras comprobadas antes y después de promover. En navegador alojado se utilizó el organizador y su revalidación reales, se retuvo la respuesta durante el cambio del selector y apareció la vista previa. La subida de esa comprobación fue interceptada y no se pulsó Guardar: no se creó una foto o una referencia ficticia en producción. El guardado completo se verificó en los escenarios locales, no se presenta como un cambio realizado sobre la foto del usuario.

Para volver a probar, abre de nuevo el organizador con tu enlace/comando (recargar una pestaña privada elimina su acceso en memoria), elige la foto, espera la vista previa y pulsa **Guardar participante**. El enlace vigente y los permisos no se rotaron para publicar esta corrección.

Evidencias locales ignoradas en `artifacts/image-save-20261101/`. La publicación afecta únicamente el frontend; los cambios deben incluirse en commit/push para mantenerlos en próximos despliegues Git.
