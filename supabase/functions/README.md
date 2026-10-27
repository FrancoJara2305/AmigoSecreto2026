# Edge Functions: estructura bloqueada

T07 habilita únicamente las operaciones de enlaces privados de `wishlist-api` en local:

| Función | Responsabilidad futura |
| --- | --- |
| `wishlist-api` | T07: validar acceso, emitir/revocar enlaces personales y rotar el del organizador. El CRUD de perfil/regalos corresponde a T08. |
| `product-metadata` | Importación asistida con límites, cuotas y transporte resistente a SSRF. |
| `media-upload` | Validación/recodificación y carga de archivos pertenecientes al participante. |

`config.toml` habilita Edge Runtime y wishlist-api con `verify_jwt = false`: su handler exige `X-Edit-Token` y valida el hash, permisos, expiración y revocación mediante una RPC restringida al servidor. CORS usa orígenes exactos y las respuestas son no-store. Sin configuración de orígenes falla cerrado. La API no admite bootstrap/recuperación, flags de administrador ni mutaciones de datos de aplicación.

`product-metadata` y `media-upload` siguen deshabilitadas, con verificación JWT y handler que devuelve 503 para POST/405 para otros métodos. No descargan ni suben contenido. No se usa Supabase Auth.

Estado y requisitos de las próximas tareas:

1. T07 completo: generación criptográfica y bootstrap local; solo hashes SHA-256. Sin endpoint público de bootstrap.
2. T07 completo: validación de token, expiración, revocación, rol y propietario, incluidas pruebas HTTP reales.
3. Mutaciones mediante transacciones SQL que vuelvan a validar/bloquear el token y comparen versión. La clave privilegiada elude RLS; RLS no autoriza peticiones a ese cliente.
4. Acceso ya tiene cuotas atómicas, cuerpos acotados, CORS exacto y no-store. T15 completará cuotas de las demás operaciones.
5. Pruebas de acceso cruzado entre dos participantes y revocación desde una pestaña abierta.
6. Para metadatos: proteger DNS/rebinding/redirecciones, timeouts y tamaños antes de hacer fetch. Para archivos: decodificar y comprobar pertenencia antes de subir.
7. Probar bajo Deno/Edge Runtime real, además de las pruebas actuales del handler puro con Node.

La emisión/rotación y validación están implementadas; CRUD, scraping y uploads siguen pendientes. Consulta [T07 y comandos locales](../../docs/private-access.md). No desplegar las funciones a producción en esta iteración.
