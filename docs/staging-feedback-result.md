# T25: confirmación visible y subida de imágenes corregidas

**Estado posterior:** recorrido guiado T21 validado por el usuario y [logs Supabase revisados](staging-logs-review.md), sin 5xx/severidad error en la ventana y con observaciones documentadas. El bloqueo de acceso a logs mencionado en el historial inferior quedó resuelto usando el perfil correcto de la CLI. Sigue la [revisión de producción](production-review.md), preparada y todavía sin consultas a su base.

Seguimiento del 2026-10-31 (America/Lima). **Correcciones publicadas y comprobadas en [staging](https://amigo-secreto2026-staging.vercel.app)**, despliegue Vercel `dpl_GLM6zkS49db44WAJSD7VdhVb7m6h` (`READY`). Proyecto `prj_5efvOrvzHx8WtpOy6YbRRLufpTwp`, Supabase `eknnkmndfxgyjsdgkwkh`. Producción no se consultó por SQL ni se modificó. Se conservaron los datos guardados por el usuario.

## Cambios

La confirmación de guardado existía al principio de los formularios y quedaba fuera de la vista al pulsar Guardar al final. Ahora perfil, regalo, participante y evento muestran una confirmación fija dentro de la ventana, con icono, mensaje de resultado, anuncio `role=status`/`aria-atomic` y botón para ocultarla. No mueve el foco al guardar ni desaparece por un temporizador; se retira al editar o al ocultarla.

Se reprodujo una carrera entre el evento de foco al volver del selector de archivos y la subida. La sesión pasaba transitoriamente a `checking` y el cliente la trataba como acceso denegado antes de conocer el resultado. La subida ahora espera la comprobación en curso y solo continúa con la misma identidad y un alcance válido. Revocación, expiración, cambio de sesión o cancelación siguen impidiendo el envío. No se alteraron permisos, cuotas, JWT, CORS, funciones Edge o migraciones para evitar el rechazo.

El ensayo inicial sin simular el retorno de foco subió correctamente en ambos roles. La prueba dirigida de la carrera falló con el código anterior (`MediaUploadError`, `kind=access`) y pasó después de corregirlo. Esto demuestra el fallo de concurrencia; no atribuye a ese único fallo cualquier tienda o imagen externa que pueda rechazar una descarga.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| Unitarias y tipos | Suite unitaria completa y TypeScript correctos; dos pruebas nuevas sobre espera de validación y rechazo al revocar/cambiar identidad. |
| Navegadores | 141 casos correctos en escritorio, tableta y móvil: perfil, regalos y organizador. Incluyen carrera de foco para ambos roles, guardado visible, URLs, conflictos y revocación. |
| Build y seguridad | Build local y remoto correctos; revisión estática de seguridad correcta. Dry-run: 125 archivos regulares sin entornos, respaldos, artefactos, SQL o tests. |
| Staging real | Organizador y enlace personal: archivos de foto/regalo, URLs HTTPS de foto/regalo, persistencia real y confirmación visible. Validación real demorada 500 ms para reproducir el retorno del selector. |
| Importación real | Steam/Factorio devolvió `ok` e imagen; selección/aplicación al borrador y guardado del URL de imagen comprobados en navegador. |
| Formulario administrativo | Guardar participante muestra confirmación dentro de la ventana y persiste el cambio. El formulario de evento usa el mismo componente y pasó la regresión local. |
| Capturas | Revisadas en móvil y escritorio; mensaje legible y dentro de la ventana, con botón para ocultar. |
| Asesores Supabase | Revisión del staging sin hallazgos (`results: []`). |

El primer ensayo local de tres casos pasó, pero el cierre de su previsualización quedó bloqueado por los permisos del sandbox. Se identificaron/cerraron únicamente sus procesos del puerto 4185 y se ejecutó la regresión completa con permisos de cierre; finalizó 141/141 y retiró sus procesos. No se reutilizó o cerró la previsualización del usuario.

Solo se crearon participantes sintéticos aislados para los ensayos alojados y se eliminaron al terminar. Se comprobó por SQL READ ONLY que no quedaban participantes o referencias a sus seis imágenes. Se retiraron esas seis rutas exactas mediante Storage API, verificando vacíos los dos prefijos; no se ejecutó limpieza global ni se cambiaron fotos/listas del usuario. Los registros internos de mantenimiento de esos medios pueden quedar hasta su siguiente limpieza normal.

Evidencias ignoradas por Git bajo `artifacts/t25-feedback/`: `source-manifest.json`, `vercel-dry-run.json`, `vercel-deploy-result.json`, `hosted-verification.json`, `staging-advisors.json`, `release.json` y capturas. Las 14 migraciones mantienen sus huellas y no se reaplicaron. El manifiesto offline inicial se conserva; el seguimiento tiene su propio inventario de las 137 fuentes, con seis archivos modificados. Sin nuevas dependencias o cambios de variables/secretos.

## Pendientes de cierre

El usuario informó después que el recorrido guiado con lector funcionó salvo la carga de imagen anunciada como deshabilitada, y confirmó que estaba creando un participante nuevo. El bloqueo hasta guardar el alta es el previsto y tiene explicación asociada. La comprobación alojada de apertura nativa/estado accesible pasó para un perfil guardado, sin escrituras o nuevos despliegues. **Recorrido guiado T21 validado por reporte del usuario; caso aclarado.** [Registro y alcance](accessibility-review.md#revisión-con-lector-real-validada-por-el-usuario).

En la primera fase quedó pendiente la revisión de logs Supabase: la CLI no ofrece consulta ClickHouse y solo se probaron los targets antiguos de credenciales. La continuación resolvió el perfil `supabase` y completó las consultas por API; [resultado y límites](staging-logs-review.md). No se enumeraron otras credenciales ni se imprimió/guardó un token. Los asesores y la revisión de logs tienen evidencias separadas.

El resultado de la [revisión T21](accessibility-review.md#revisión-con-lector-real-validada-por-el-usuario) procede de la prueba manual informada por el usuario. Las pruebas de DOM, teclado y axe no equivalen a escuchar un lector.

La promoción a producción mantiene revisión/aprobación separadas, respaldo del destino y reconciliación de sus migraciones antes de operar. El frontend anterior de staging es `dpl_5yVrfEAgD4AdRnopdxdqSdem65tN`; es el punto de retorno del mismo proyecto si se necesita revertir este frontend. Las funciones y el contrato SQL permanecen compatibles. [Guía de promoción y rollback](deployment-review.md).
