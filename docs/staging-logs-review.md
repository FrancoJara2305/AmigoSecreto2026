# T25: revisión de logs Supabase completada

Revisión del 2026-10-31 (America/Lima), limitada a staging `eknnkmndfxgyjsdgkwkh`. **No se observaron 5xx o eventos de severidad ERROR/FATAL/CRITICAL en la ventana revisada.** Se conservaron observaciones de plataforma y los límites indicados abajo. Producción no se consultó por SQL ni se modificó.

Ventana fija: **15:41:03–17:41:03 del 31 de octubre, hora de Lima** (`20:41:03.119Z–22:41:03.119Z`). Se consultó la API oficial de gestión, endpoint `analytics/endpoints/logs`, con SQL ClickHouse acotado. El endpoint anterior `logs.all` está retirado; [cambio oficial](https://supabase.com/changelog/48235-migration-of-supabase-management-api-logs-all-analytics-endpoint-to-logs-endpoint) y [guía actual](https://supabase.com/docs/guides/observability/advanced-log-filtering).

El bloqueo anterior de autenticación quedó resuelto: la CLI 2.122.0 usa el perfil `supabase`, además del fallback antiguo `access-token`. Se usó únicamente la entrada de Supabase del almacén seguro en memoria, sin enumerar otras credenciales, mostrar/guardar el token o cambiar el login. No fue necesario operar el navegador.

## Cobertura y resultado

Se revisaron **1832 eventos de diez fuentes**; son registros de distintas capas, no solicitudes únicas.

| Fuente | Eventos | Resultado |
| --- | --- | --- |
| Gateway API | 582 | 577 respuestas 200, cuatro 304 y una 404; cero 5xx. |
| Invocaciones Edge | 282 | 149 respuestas 200, quince 201, 106 preflight 204; cinco 401, cinco 403, un 409 y un 422; cero 5xx. |
| Consola Edge | 780 | Sin severidad error o patrones uncaught/exception/panic/error/failed en los mensajes registrados. |
| Storage | 40 | 27 registros con estado HTTP: 26 respuestas 200 y una 204; los otros trece no traen ese campo. |
| PostgreSQL | 32 | 31 con SQLSTATE 00000 y uno 08006, todos de nivel LOG. |
| Auth | 5 | Tres INFO y dos WARNING de deprecación; un registro tiene estado HTTP 200. |
| PgBouncer / Supavisor | 77 / 24 | Sin eventos de severidad error/fatal/crítica. |
| PostgREST / Realtime | 9 / 1 | Sin eventos de severidad error/fatal/crítica. |

Se descubrieron las claves reales de cada fuente antes de interpretar el resultado. Gateway e invocaciones usan `response.status_code`; Storage usa `res.statusCode`. Un campo ausente **no** se contó como éxito. Los 401/403/409/422 pertenecen a las funciones de autorización/mutación; la aceptación alojada incluyó deliberadamente rechazo de acceso, origen/medio ajeno y conflicto. No se atribuye causalidad a cada evento únicamente por coincidir el código.

## Observaciones

- Auth emitió dos avisos de retirada futura: `GOTRUE_JWT_ADMIN_GROUP_NAME` y `GOTRUE_JWT_DEFAULT_GROUP_NAME`, uno de cada tipo. La app no usa cuentas Auth convencionales. No se modificó el servicio o su configuración para ocultar los avisos.
- PostgreSQL registró una conexión reiniciada por el cliente (`08006`, nivel LOG). No se estableció una correlación con un fallo de aplicación. No equivale a un error SQL de las migraciones.
- El Gateway registra prefijos de clave en `request.sb.apikey.apikey.prefix` (378 eventos) y `request.sb.apikey.authorization.prefix` (368). Los valores observados tienen exactamente **15 caracteres**, sin coincidencias de sufijo de clave de veinte o más caracteres en esos campos. Son metadatos truncados; no se recuperaron sus valores ni se confundieron con una clave completa expuesta.
- En el escaneo acotado no aparecieron marcadores `#token=`, `x-edit-token` o `sbp_`. Esto no certifica ausencia de cualquier capacidad cruda desconocida en toda la infraestructura. La [referencia oficial](https://supabase.com/docs/guides/observability/log-field-reference) explica fuentes, campos y límites de captura.

Solo se recuperaron agregados, nombres de campos/configuración y tres mensajes censurados desde la consulta; no se descargaron cuerpos/cabeceras crudos o filas de participantes. Las consultas no cambian DB, Storage, funciones, cuotas, retención, plan o logging. No se habilitaron servicios de pago.

Evidencias bajo `artifacts/t25-feedback/`: `supabase-log-review.json`, `supabase-log-review-detailed.json`, `supabase-log-findings.json`, `supabase-log-exceptions.json` y `logs-review-result.json`, con rango, consultas, cobertura y hashes. Los scripts usan la credencial por stdin; no aparece en argumentos o archivos.

**Alcance:** revisión puntual de los eventos que el proveedor registró/retuvo en esas dos horas. No sustituye monitoreo continuo, métricas de visitantes o una auditoría completa de secretos. El recorrido T21 ya fue validado por el usuario. La revisión de logs pendiente queda completada con las observaciones anteriores; sigue la [revisión de producción](production-review.md).
