# Integración Supabase: revisión local antes de producción

Estado de esta iteración: preparación local, sin vinculación ni operaciones sobre la instancia `AmigoSecreto2026`. Su estado Healthy fue informado por el usuario; no se consultó el proyecto remoto.

## Comparación con el plan

Al comenzar había README, `implementation_plan.md`, `package.json`, lockfile y `supabase-js`/`supabase/ssr`; no había React/Vite, migraciones, configuración CLI ni funciones. `.env` y `.env.local` existían sin exclusión de Git y se conservaron. Se añadió `.gitignore` antes de trabajar con la integración.

La preparación inicial cubrió la base de T02–T05. Las iteraciones posteriores completaron T06 (demo local), T07 (enlaces privados) y T08 (edición protegida). El MVP visual sigue pendiente. Se mantiene el plan como documento original y se registran aquí las decisiones actuales:

- Desde T10, React/Vite tiene bienvenida y catálogo con dos consultas públicas al montar. La galería de T09 se conserva en `/diseno`. `npm run preview:local` permite revisar el grupo en memoria sin usar el destino de `.env.local`; ver [catálogo](catalogue.md).
- `src/services/supabase.ts` crea el cliente público de forma diferida, sin sesiones de Auth, renovación ni detección de tokens en URL. `public-data.ts` contiene consultas de lectura, sin ejecutarlas automáticamente.
- Las tablas públicas usan grants explícitos y RLS de lectura; las privadas no se exponen por Data API. La RPC `server_access` solo admite service_role; visitantes no pueden ejecutarla ni modificar tablas.
- wishlist-api local permite validar/gestionar enlaces privados y editar perfil/regalos con autorización propia dentro de transacciones. Importación y upload siguen deshabilitadas. Ver [T07](private-access.md) y [T08](protected-mutations.md).
- La preparación inicial no incluyó participantes. En T06 se añadió `supabase/seed.sql` con 11 participantes ficticios y 18 regalos, cargados exclusivamente mediante `npm run seed:local`. El contrato de permisos usa otras dos identidades temporales, siempre con ROLLBACK, y también funciona con la demo presente.
- Presupuesto sigue reservado en el modelo, sin configuración de UI. No se añade sorteo ni cuentas.

## Dependencias y herramientas

Node 24 o superior y npm. Supabase CLI se instaló como dependencia de desarrollo del proyecto (2.122.0 en esta entrega), no globalmente: `npm run supabase -- <comando>`. `npm ci` reproduce las versiones del lockfile.

Se añadieron React/React DOM y Vite/TypeScript para compilar el cliente solicitado; tipos y plugin React para desarrollo. Se conservó la dependencia preexistente `@supabase/ssr`, pero no se importa porque esta es una SPA sin SSR ni cookies de autenticación.

Las pruebas de TypeScript utilizan el runner nativo de Node, sin Vitest en esta iteración. `@electric-sql/pglite` es únicamente una dependencia de desarrollo para ejecutar PostgreSQL en memoria sin Docker; nunca se importa desde `src`. Véase [PGlite](https://pglite.dev/docs/).

Docker, psql y Deno no estaban disponibles en la revisión inicial. La CLI sí queda instalada y `supabase init` fue ejecutado localmente. No se ha ejecutado `login`, `link`, `db push`, `db reset`, `migration up --linked`, `config push` ni despliegue de funciones.

## Archivos para revisar

| Archivo | Contenido |
| --- | --- |
| `supabase/migrations/20261026000100_wishlist_schema.sql` | Seis tablas, relaciones, checks, índices, helpers privados y timestamps/versiones. Solo inserta la fila singleton del evento. |
| `supabase/migrations/20261026000200_wishlist_permissions.sql` | RLS y grants explícitos; público solo lectura; service_role restringido por operación SQL. |
| `supabase/migrations/20261026000300_wishlist_storage.sql` | Bucket público `wishlist-media`, 3 MiB, JPEG/PNG/WebP y políticas restrictivas para clientes. |
| `supabase/migrations/20261027045044_private_access_lifecycle.sql` | T07: validación/bloqueo de credenciales, bootstrap privado y RPC de acceso exclusivamente para el backend. |
| `supabase/config.toml` | Configuración LOCAL: solo esquema public expuesto; seed automático, Auth y realtime deshabilitados; wishlist-api habilitada con autorización propia. |
| `supabase/seed.sql`, `scripts/seed-local.mjs` | T06: datos ficticios y ejecutor fijado al contenedor local; carga automática desactivada. |
| `tests/database/seed.test.mjs` | Cobertura de datos, repetibilidad, preservación de cambios y rechazo de mezclas/conflictos. |
| `supabase/tests/database/001_contract.sql` | Contrato de integridad y permisos bajo roles reales; fixtures y modificaciones revertidos al finalizar. |
| `scripts/test-database.mjs` | Aplica migraciones a PostgreSQL embebido nuevo; nunca lee env ni acepta conexión remota. |
| `tests/fixtures/supabase-platform.sql` | Modelo mínimo de roles/tablas de Storage solo para PGlite; nunca aplicarlo a Supabase. |
| `scripts/test-supabase-local.mjs` | Ejecuta las mismas aserciones contra el contenedor local mediante psql; sin parámetro de URL/remoto y sin alterar la política de ejecución de PowerShell. |
| `src/services/*`, `src/domain/database.types.ts` | Configuración y cliente público; contrato de tipos de solo lectura. |
| `supabase/functions/*` | Estructura bloqueada; leer su README antes de habilitarla. |

Los helpers SQL tienen `search_path` fijo y no son SECURITY DEFINER. El rol service_role tiene acceso explícito para las futuras funciones. No se le concede TRUNCATE ni DELETE/INSERT del evento singleton. Las tablas privadas tienen RLS y ningún permiso para anon/authenticated.

Se revoca EXECUTE global por defecto para nuevas funciones creadas por el propietario que ejecuta la migración: PostgreSQL concede EXECUTE a PUBLIC por defecto y una revocación solo por esquema no anula esa concesión global. Las futuras funciones públicas requerirán un GRANT explícito. No se cambian los permisos de funciones preexistentes fuera de `private`.

Las referencias de imágenes usan claves foráneas compuestas de participante/ruta. Una imagen de otra persona no puede asociarse aunque un futuro handler tenga un error de pertenencia. El almacenamiento de bytes y la comprobación de tipo real siguen pendientes del endpoint seguro de carga.

Los validadores SQL de URL son defensas sintácticas; **no son protección SSRF** ni sustituyen DNS, TLS y validación de redirecciones. Ninguna función actual descarga URLs.

## Configuración de variables sin secretos versionados

1. Mantener intactos `.env`/`.env.local` existentes. Si no hay `.env.local`, copiar `.env.example` a ese nombre; no sobrescribirlo sin revisar.
2. Completar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. `VITE_APP_URL` permite fijar el origen de la aplicación; si falta, se usa el origen del navegador. Al validar localmente, usar la URL y clave pública de la pila local. La clave publishable/anon es pública, pero no hace falta versionar un valor real.
3. Nunca colocar `service_role`, `sb_secret_`, contraseña de PostgreSQL o enlace privado en `VITE_*`: Vite incorpora esas variables al navegador. Se valida la configuración antes del bundle y antes de crear el cliente. El JWT anon heredado/local se acepta; un JWT service_role se rechaza.
4. Para futuros secretos Edge, usar un archivo separado `supabase/functions/.env.local`, que también queda ignorado. El ejemplo correspondiente contiene únicamente marcadores. Los placeholders actuales no necesitan secretos.
5. `git check-ignore .env .env.local supabase/functions/.env.local` debe mostrar los tres archivos. `git ls-files .env .env.local` debe estar vacío. `.gitignore` no retira credenciales ya comprometidas; en el estado inicial ninguno de estos archivos estaba versionado.

Las opciones de `createClient` se apoyan en la [documentación oficial del cliente](https://supabase.com/docs/reference/javascript/initializing). No se crea ningún usuario ni se invoca `signIn`/`signUp`.

## Validar sin Docker y sin acceso remoto

Desde la raíz, en PowerShell:

```powershell
npm ci
npm run typecheck
npm test
npm run build
git check-ignore .env .env.local supabase/functions/.env.local
git diff --check
```

`npm test` comprueba tipos, ejecuta las pruebas del cliente/handlers y después crea bases PostgreSQL efímeras en memoria, aplica todas las migraciones, comprueba SQL y prueba el seed local. No usa `.env`, claves, hostname ni conexión remota. Cada ejecución empieza vacía y se destruye al finalizar.

Los tests prueban posiciones, unicidad, tipos, campos opcionales, URLs, precios, relaciones, cascadas, hashes, permisos anon/authenticated/service_role, RLS y políticas de Storage incluso ante una política permisiva accidental. No prueban el servicio HTTP de Storage, PostgREST ni dos conexiones simultáneas: PGlite ejecuta una conexión embebida.

## Validar con Supabase local completo antes de aprobar producción

Instalar e iniciar Docker Desktop con contenedores Linux. No es necesario iniciar sesión ni vincular un proyecto remoto. Revisar `supabase/config.toml`: el identificador `AmigoSecreto2026` es el nombre del entorno local, **no** el Project Ref remoto. PostgreSQL local se ha configurado en versión 17; confirmar manualmente la versión del servidor alojado antes de cualquier aplicación remota.

```powershell
npm run supabase -- start
npm run supabase -- migration up --local
npm run supabase -- db lint --local --schema public,private --fail-on error
npm run test:db:local
```

`start` puede aplicar migraciones al crear la pila LOCAL; `migration up --local` aplica las pendientes sin resetearla. La carga automática de seed sigue desactivada. El contrato SQL puede ejecutarse antes y después del seed, usando identidades de prueba reservadas y recuentos iniciales; no ejecutar las pruebas en una base de uso real ni en producción.

Para preparar la demo local de T06:

```powershell
npm run seed:local
npm run test:db:local
```

`seed:local` conecta exclusivamente por el socket Docker local al contenedor `supabase_db_AmigoSecreto2026` y a PostgreSQL en loopback dentro de ese contenedor. No admite URL, ref, credenciales ni argumentos adicionales. La marca SQL `app.seed_environment=local` es una protección contra ejecutar accidentalmente el archivo suelto, no un mecanismo de autenticación ni una garantía si alguien copia el SQL a otro servidor.

La transacción inserta únicamente registros faltantes por UUID/posición y preserva ediciones existentes; no restaura ni borra opciones modificadas. Antes de escribir, rechaza participantes no pertenecientes a la demo o conflictos de identidad. En una base nueva crea dos listas vacías, tres con una opción, tres con dos y tres completas: 11 personas y 18 regalos. Hay ropa, calzado EU, objetos, precios ausentes, PEN/USD, mensajes/preferencias opcionales y avatares locales. No se inventan enlaces de tiendas ni fotos externas. No se generan tokens ni objetos de Storage.

Referencia del flujo de seed de Supabase: [documentación oficial](https://supabase.com/docs/guides/local-development/seeding-your-database). En este proyecto se usa un comando explícito en lugar del seed automático para conservar la separación con producción.

El runner Node fija el Docker named pipe local de Windows y el contenedor `supabase_db_AmigoSecreto2026`; dentro usa psql en `127.0.0.1`. No acepta URLs ni `--linked` y no necesita cambiar políticas de PowerShell. Ejecuta las pruebas con `ON_ERROR_STOP` y ROLLBACK, por lo que tampoco deja fixtures en el entorno local.

Estas pruebas usan aserciones PostgreSQL, no TAP. **No usar `supabase test db` para este archivo**: ese comando espera pgTAP. El script local provisto es su ejecutor. Referencias oficiales: [CLI](https://supabase.com/docs/reference/cli/supabase-migration-up) y [testing/linting](https://supabase.com/docs/guides/local-development/cli/testing-and-linting).

Después de pasar SQL, verificar manualmente en local:

- Con la clave pública, GET de participants/gifts/settings funciona; INSERT/UPDATE/DELETE/TRUNCATE y acceso al esquema privado fallan.
- A través de Storage API, un objeto cargado con credenciales de **servidor local** puede descargarse mediante su URL pública. El público no puede listar, subir, reemplazar, mover ni borrar objetos de `wishlist-media`.
- El bucket exige 3 MiB y MIME permitido. T14 añade la comprobación real de bytes, dimensiones y decodificación en `media-upload`, antes de subir el objeto.
- Una imagen de prueba se crea/elimina por Storage API, nunca mediante borrado de filas `storage.objects`. Las migraciones gestionan únicamente la configuración declarativa del bucket y sus políticas. Referencias: [control de acceso](https://supabase.com/docs/guides/storage/security/access-control) y [esquema de Storage](https://supabase.com/docs/guides/storage/schema/design).
- wishlist-api admite las acciones documentadas de T07 y T08. Se pueden repetir las pruebas de CRUD con `npm run test:mutations:http` y las carreras con `npm run test:mutations:concurrency`. T14 habilitó uploads autorizados y T16 preparó importación segura con transporte firmado; consultar sus actualizaciones al final. No desplegar en esta iteración.

## Vincular tu instancia: solo manualmente después de revisión

**Aquí comienza el acceso remoto. No se ejecutó en esta iteración.** El nombre visible `AmigoSecreto2026` no basta: necesitarás el Project Ref del Dashboard. No compartir contraseñas ni claves privilegiadas en el chat.

Después de revisar y aprobar las migraciones, puedes ejecutar:

```powershell
npm run supabase -- login
npm run supabase -- link --project-ref TU_PROJECT_REF
```

Introducir credenciales solo en los prompts privados de la CLI; evitar `--password` en la línea de comandos, historial o archivos versionados. La CLI puede consultar configuración remota y datos de conexión al vincular. Por eso este paso queda expresamente fuera del trabajo automático actual. Los archivos `supabase/.temp` del vínculo están ignorados.

Antes de considerar una aplicación real:

1. Confirmar cuenta, proyecto/ref y versión PostgreSQL en Dashboard, y revisar si ya existen tablas, políticas, buckets o migraciones con estos nombres. Las migraciones de aplicación crean tablas nuevas y fallarán deliberadamente ante una colisión, sin reemplazar datos ajenos.
2. Confirmar que Data API expone solo los esquemas necesarios y nunca `private`. El config local no cambia la configuración del proyecto alojado; no asumir que se sincroniza con `link`.
3. Revisar historial remoto mediante `npm run supabase -- migration list --linked` (lectura remota, solo manual tras aprobación).
4. Revisar una simulación mediante `npm run supabase -- db push --linked --dry-run`. Es una consulta remota que informa pendientes; **no aplica** las migraciones y **no comprueba toda su ejecución**. Las pruebas locales anteriores siguen siendo necesarias.
5. Detenerse y revisar el resultado. La aplicación real requiere una aprobación separada y un respaldo apropiado. Esta guía no ejecuta ni automatiza el comando de aplicación sin dry-run.

No ejecutar `db reset` sobre remoto, no añadir `--include-seed`, no ejecutar fixtures de tests en producción, no usar `migration repair` para ocultar conflictos y no desplegar las funciones preparatorias. No se ha generado ningún enlace de edición ni credencial de organizador.

## Comprobaciones y límites de la entrega

Los resultados concretos se registran en `docs/validation-results.md`. Pasar los tests embebidos no certifica todavía compatibilidad con la pila alojada, Storage HTTP, revocación de enlaces o seguridad del futuro scraping. Esos controles deberán pasar antes de habilitar escritura o publicar el MVP.
## Actualización T14

Las migraciones `20261027214226_protected_media_lifecycle.sql` y `20261027215115_media_cleanup_compatibility.sql` están validadas y aplicadas únicamente en local. Preparan reservas de imágenes, guardas de asociación y reclamaciones privadas de limpieza. `media-upload` se habilita para servir en local y valida enlaces privados; no usa Supabase Auth. El mantenimiento no tiene endpoint de navegador. Consulta [operación y pruebas de T14](media-upload.md). Se mantiene la revisión y aprobación antes de cualquier operación remota.

## Actualización T15

Se añadieron y probaron solo en local `20261029035631_atomic_rate_limits.sql` y `20261029040501_quota_retry_and_saturation.sql`: cuotas compartidas, ventanas de minuto/hora, barrera HTTP y mantenimiento acotado. El modo predeterminado ignora todas las cabeceras IP no verificadas y conserva el límite global. No se cambió `.env.local` ni se habilitó la importación. Ver [archivos, resultados y comandos de T15](rate-limits.md). La instancia alojada sigue pendiente de revisión y aprobación antes de cualquier operación remota.

## Actualización T16

Se aplicó únicamente en local `20261029043751_protected_product_import.sql`: reservas privadas de importación y RPC restringidas al servidor para preparar/consumir una solicitud con autorización, cuotas, vencimiento y protección frente a replay. `product-metadata` queda habilitada para servir localmente, con configuración predeterminada que falla cerrada. No guarda regalos.

El sondeo de Edge verificó las limitaciones de sus clientes HTTP para fijar DNS manteniendo TLS del dominio. Se activó la alternativa Node prevista en el plan: `api/fetch-product.ts`, único adaptador descargador, sin claves de base de datos ni credenciales de participantes. Firma solicitudes/respuestas y exige consumo atómico por callback antes de conectar. Solo se verificó su implementación en Node local; no se desplegó en Vercel ni se probaron tiendas en vivo. Ver [decisión, límites, pruebas y comandos locales de T16](product-import.md). La interfaz permanece en T17 y la aprobación previa a cualquier operación remota sigue vigente.

## Actualización T17

Se integró la vista previa, selección y aplicación al borrador del editor, con sesión privada, comprobación de moneda, cancelación, descarte de resultados obsoletos y espera de cuotas. No se modificaron SQL, RLS, las funciones desplegables ni los archivos de entorno del usuario. El ensayo `npm.cmd run test:import:ui:local` utiliza una pila local ya migrada y participantes efímeros; verifica que consultar/aplicar no persisten y que solo Guardar crea el regalo en PostgreSQL. Configuración manual, archivos y límites: [T17](product-import-ui.md). Sin vinculación o despliegue remoto.

## Actualización T18

Se integró el formulario privado de foto/ilustración, mensaje y gustos. Reutiliza `update_profile` con versión esperada y `media-upload` con propósito `avatar`; el cliente solo envía campos editables, y el servidor mantiene sus controles de rol, propietario, propósito y asociación. No hay nuevas migraciones, RLS, buckets o cambios de contrato en las funciones. El ensayo `npm.cmd run test:profile:ui:local` comprobó la persistencia desde navegador hasta Storage/PostgreSQL local, imágenes pendientes/reemplazo, 403 ajeno, 409 antiguo y regalos intactos. Se retiraron únicamente sus datos efímeros. Ver [archivos, configuración y pruebas T18](profile-editor.md). La instancia remota permanece sin consultar ni modificar.
