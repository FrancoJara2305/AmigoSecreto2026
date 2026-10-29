# Edge Functions: acceso, edición e imágenes locales

T14 habilita `media-upload` junto a `wishlist-api` con validación explícita de enlaces privados, sin cuentas Auth. Incluye códecs WASM y archivos estáticos reproducibles; no usa claves privilegiadas en el navegador. La limpieza se ejecuta desde un script local, sin endpoint público. Ver [guía de T14](../../docs/media-upload.md) para contratos, límites y ensayos reales. No se desplegó ninguna función.

T15 añade una barrera persistente de cuotas antes del cuerpo, además de las cuotas atómicas de sus operaciones en SQL. `RATE_LIMIT_IP_SOURCE=off` ignora cabeceras de IP no verificadas y conserva el límite global; el modo explícito de proveedor verificado requiere HMAC de servidor. Nunca se confía por defecto en `X-Forwarded-For`. Ver [T15](../../docs/rate-limits.md) para límites por minuto/hora, mantenimiento y pruebas.

T16 habilita `product-metadata` en local con autorización por enlace, cuotas y parser. La descarga usa el único adaptador Node condicional previsto en el plan, solicitudes/respuestas firmadas y callback de consumo atómico antes de DNS. El adaptador no recibe tokens de participantes ni claves de base de datos. Sin secreto y transporte configurados devuelve 503; no existe descarga directa de respaldo. Ver [T16](../../docs/product-import.md) para la decisión TLS/DNS, archivos de entorno y pruebas. La selección de campos en la UI sigue en T17.

## Antecedentes de T07/T08

T07 habilita únicamente las operaciones de enlaces privados de `wishlist-api` en local:

| Función | Responsabilidad futura |
| --- | --- |
| `wishlist-api` | T07: ciclo de enlaces. T08: actualizar perfil, crear/editar/limpiar regalos con ámbito y versión. |
| `product-metadata` | Importación asistida con límites, cuotas y transporte resistente a SSRF. |
| `media-upload` | Validación/recodificación y carga de archivos pertenecientes al participante. |

`config.toml` habilita Edge Runtime y wishlist-api con `verify_jwt = false`: su handler exige `X-Edit-Token` y valida el hash, permisos, expiración y revocación mediante RPC restringidas al servidor. CORS usa orígenes exactos y las respuestas son no-store. Sin configuración de orígenes falla cerrado. La API no admite bootstrap/recuperación ni flags de administrador. Las mutaciones de T08 validan el token en la misma transacción que guarda.

Las tres funciones usan `verify_jwt = false` porque sus handlers aplican la autorización propia de enlaces privados. `product-metadata` exige la capability para preparar una importación; su rama operativa de callback exige HMAC y reserva vigente de un solo uso. `media-upload` exige la capability, usa dos comprobaciones SQL y procesa archivos con límites; ver T14 arriba. No se usa Supabase Auth.

Estado y requisitos de las próximas tareas:

1. T07 completo: generación criptográfica y bootstrap local; solo hashes SHA-256. Sin endpoint público de bootstrap.
2. T07 completo: validación de token, expiración, revocación, rol y propietario, incluidas pruebas HTTP reales.
3. T08 completo: mutaciones con token bloqueado y comparación de versión. La clave privilegiada elude RLS; la autorización se comprueba explícitamente en SQL.
4. T15 completo: cuotas atómicas, cuerpos acotados, CORS exacto y no-store en las operaciones protegidas.
5. Pruebas de acceso cruzado entre dos participantes y revocación desde una pestaña abierta.
6. T14/T16 completos en local: archivos decodificados con pertenencia; metadatos con DNS/rebinding/redirecciones, timeouts y tamaños comprobados antes de descargar.
7. Ensayos con Deno/Edge Runtime real y PostgreSQL local realizados, además de pruebas de handlers y TLS en Node. Validación alojada pendiente.

La emisión/rotación, validación, CRUD, uploads y servidor de metadatos están implementados en local. Consulta [T07](../../docs/private-access.md), [T08](../../docs/protected-mutations.md), [T14](../../docs/media-upload.md) y [T16](../../docs/product-import.md). No desplegar las funciones a producción en esta iteración.
