# Edge Functions: operación actual

Las tres funciones están implementadas y comprobadas en local. No se ha desplegado ninguna. No hay cuentas Supabase Auth ni endpoints públicos de bootstrap, recuperación o limpieza.

| Función | Operación y autorización |
| --- | --- |
| wishlist-api | Acceso privado, perfil/regalos, altas/orden/bajas/evento y ciclo de enlaces. Capacidad por X-Edit-Token, hash/rol/propietario/versión y revocación comprobados en SQL. |
| media-upload | Capacidad y pertenencia antes del cuerpo; límites, validación binaria, recodificación WebP y segunda autorización tras Storage. Solo devuelve una ruta pendiente; guardar la asocia. |
| product-metadata | Capacidad y cuota antes de consultar; transporte Node resistente a SSRF, firma HMAC, callback con nonce SQL de un solo uso y revalidación antes de devolver sugerencias. No guarda regalos. |

verify_jwt=false está definido por función porque la autorización usa enlaces privados, no JWT de Auth. Mantener sus handlers, RPC privadas y límites: apagar la comprobación de plataforma no autoriza escritura. CORS exacto se valida en el handler; el gateway local puede añadir CORS propio, como se documentó en [seguridad](../../docs/security-review.md).

## Iniciar localmente

~~~cmd
npm.cmd run functions:local
~~~

Usa supabase/functions/.env.example con orígenes locales. Acceso, mutaciones y carga funcionan; importación queda sin transporte y falla cerrada, conservando la edición manual. Para valores propios usar un archivo ignorado y no sobrescribirlo:

~~~cmd
npm.cmd run supabase -- functions serve --env-file supabase/functions/.env.local
~~~

[Entornos y secretos](../../docs/environment.md) describe las variables, proxy, callback y HMAC. SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son del runtime, nunca del navegador o del proxy Node. El modo de identidad IP permanece off hasta verificar todas las entradas del proveedor.

Los códecs WASM de media-upload/vendor tienen versiones, licencias y hashes; npm.cmd run vendor:images reproduce el vendorizado desde dependencias fijadas. No usar CDN para cargarlos en ejecución.

## Validar y mantener

~~~cmd
npm.cmd run test:security:local
npm.cmd run test:admin:ui:local
npm.cmd run test:recovery:local
~~~

Ejecutarlos secuencialmente: usan AmigoSecretoAdminTest y la retiran al terminar. El ensayo de recuperación comprueba DB/Storage/permisos y enlaces restaurados, sin modificar tu instancia principal.

La limpieza usa los comandos administrativos locales y sus recibos, nunca un endpoint público o DELETE directo en storage.objects. Contratos: [acceso](../../docs/private-access.md), [mutaciones](../../docs/protected-mutations.md), [imágenes](../../docs/media-upload.md), [cuotas](../../docs/rate-limits.md), [importación](../../docs/product-import.md) y [administración](../../docs/organizer-backend.md). Preparación de publicación/rollback: [T25 pendiente](../../docs/deployment-review.md).
