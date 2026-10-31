# T25: revisión de migraciones de staging

Inspección inicial autorizada el 2026-10-31 (America/Lima), limitada a **solo lectura** sobre `eknnkmndfxgyjsdgkwkh` (`AmigoSecreto2026-staging`): encontró 14 migraciones pendientes. Después el usuario aprobó recuperación y aplicación de ese conjunto. **Las 14 ya están aplicadas y verificadas; cero pendientes.** El [resultado de aplicación](staging-migration-result.md) documenta recuperación, historial y controles posteriores. Producción no fue consultada por SQL ni modificada.

## Resultado observado antes de migrar

- PostgreSQL 17.11; las tres consultas confirmaron `transaction_read_only=on` y finalizaron con `ROLLBACK`.
- No existe `private` ni `supabase_migrations.schema_migrations`. No se creó el historial para inspeccionarlo.
- Cero relaciones o rutinas de aplicación en `public`/`private`, cero políticas propias en esos esquemas/Storage, cero buckets y cero objetos de Storage.
- Las tablas administradas `storage.buckets` y `storage.objects` tienen RLS habilitado; sus columnas requeridas son compatibles con las migraciones. `storage.buckets.id` tiene PK.
- El ejecutor tiene permisos de crear esquema/objetos en `public` y SELECT/INSERT/UPDATE del bucket; solo se comprobaron privilegios, sin intentar escrituras.
- Permanecen los esquemas/extensiones administrados de plataforma; no se propone borrarlos o recrearlos.

No se observaron colisiones con objetos de la aplicación o un bucket `wishlist-media` existente. Esto justifica la lista pendiente, pero no demuestra que las migraciones ya se hayan aplicado o que el backend alojado funcione.

## Conjunto aprobado y aplicado: orden y huellas

La tabla reconcilió el inventario local con el catálogo remoto inicial. Sus huellas se revalidaron antes de aplicar; el dry-run posterior coincidió con los 14 nombres y se aplicaron una vez en ese orden. No se usaron repair, seed, reset o include-all. Los archivos SQL no cambiaron.

| Versión y archivo | SHA-256 |
| --- | --- |
| [20261026000100_wishlist_schema.sql](../supabase/migrations/20261026000100_wishlist_schema.sql) | `ff9d956ece5146e8992846b8bd889ab08444beea4ee72a5d1495c6a90af40589` |
| [20261026000200_wishlist_permissions.sql](../supabase/migrations/20261026000200_wishlist_permissions.sql) | `a8fa8aa94ce7fa26c3aa13eaa69d88afab053f11f11b988d248e874a3544a591` |
| [20261026000300_wishlist_storage.sql](../supabase/migrations/20261026000300_wishlist_storage.sql) | `2cb6ac64f1f9e3262d450495faa28e448802aff021310b61c1029cc4e76c4d43` |
| [20261027045044_private_access_lifecycle.sql](../supabase/migrations/20261027045044_private_access_lifecycle.sql) | `3ff934faa1b44b55f9564480e3a630c547f37bdd04fba4c973427912b069f904` |
| [20261027103637_protected_wishlist_mutations.sql](../supabase/migrations/20261027103637_protected_wishlist_mutations.sql) | `070df33d6ea57b39571da8684c5c898ce3e0a84958f706f876a87339da79f5b1` |
| [20261027104406_correct_mutation_helper_volatility.sql](../supabase/migrations/20261027104406_correct_mutation_helper_volatility.sql) | `36316d5f693674107eecd9ddebcad1d8a67c99a502f81bc222cd21553dac819f` |
| [20261027214226_protected_media_lifecycle.sql](../supabase/migrations/20261027214226_protected_media_lifecycle.sql) | `142391627791109b2d748bcfc231af99c64413b7f38a4205b6c9165d6275b2fe` |
| [20261027215115_media_cleanup_compatibility.sql](../supabase/migrations/20261027215115_media_cleanup_compatibility.sql) | `c821591183e77ad197e15cdb55d7b64155246c61bf96e1d02f86539fdda5c345` |
| [20261029035631_atomic_rate_limits.sql](../supabase/migrations/20261029035631_atomic_rate_limits.sql) | `8400bfd6866cec1e94ffdc94b9a0970a91788e7192c9cb654f421e7cf4a7f1ec` |
| [20261029040501_quota_retry_and_saturation.sql](../supabase/migrations/20261029040501_quota_retry_and_saturation.sql) | `043e13cda67ed4d0a218ec17a0817cccda1c3dccd0019ce6f6561126ae9e74be` |
| [20261029043751_protected_product_import.sql](../supabase/migrations/20261029043751_protected_product_import.sql) | `19fd4f823ed60ae594ce6270053fcd01c7451ef7cbb3ac9ecbcfb22bd0fc26c6` |
| [20261030121604_protected_organizer_admin.sql](../supabase/migrations/20261030121604_protected_organizer_admin.sql) | `5476cb90677a6455716eab229a4ca8004d632131d75e678ef45f9f20ece3df3b` |
| [20261030124122_organizer_admin_lint_fixes.sql](../supabase/migrations/20261030124122_organizer_admin_lint_fixes.sql) | `aba15b4167cba31036057ac7f5d3c84001c3988324d974d1b7bf931a80b42944` |
| [20261030125225_organizer_link_lock_order.sql](../supabase/migrations/20261030125225_organizer_link_lock_order.sql) | `a26b59fdb019da15e22daab14a6ddb312d22b15b8b6b6d7b0039ecdc9646a9b3` |

Los efectos de cada archivo y los riesgos están en el [inventario comentado](staging-review.md#inventario-sql-para-revisar-en-orden). El plan JSON completo y las evidencias se conservan ignorados en `artifacts/deployment/staging/`.

## Permisos y límites que deben revisarse

La captura inicial mostró grants por defecto amplios en `public` para tablas, secuencias y funciones futuras de `postgres` y `supabase_admin`, todavía sin objetos de aplicación. Las migraciones revocaron permisos explícitamente en las tablas/RPC de la app y los controles posteriores confirmaron los permisos esperados. La revocación global de EXECUTE de la primera migración **no elimina por sí sola los grants por defecto específicos del esquema public**; los objetos futuros siguen requiriendo revisión y verificación explícita de EXECUTE.

Se reprodujeron en PGlite los grants por defecto de tablas/secuencias/funciones de `postgres` antes de aplicar las 14 migraciones en memoria: **303 aserciones SQL correctas**, incluidos los contratos de permisos. Log: `artifacts/deployment/staging/default-privileges-rehearsal.log`. Es un ensayo local adicional motivado por la diferencia observada; no instala la app en staging ni valida HTTP/PostgREST/Storage alojados.

Storage conserva privilegios SQL de anon/authenticated con RLS; la captura inicial no tenía políticas permisivas. Los grants por sí solos no acreditan acceso efectivo. Después de migrar se verificaron las dos políticas restrictivas del bucket; no se modificaron los grants/propietarios de las tablas administradas como arreglo general. La comprobación HTTP/Storage con archivos queda para la aceptación alojada.

La inspección no obtuvo configuración de esquemas expuestos por PostgREST: no había ajustes `pgrst.db_schemas`/`pgrst.db_extra_search_path` en los roles. Eso no significa que la API esté desactivada. Auth/signup/Realtime, CORS, funciones y aceptación alojada siguen pendientes.

La CLI informó `Initialising login role...` como parte de su autenticación. No se ejecutaron cambios manuales de roles o grants. Las consultas de catálogo se ejecutaron como `postgres` en transacciones READ ONLY; no se descargaron contraseñas, claves API, tokens o filas de participantes/regalos.

## Requisitos previos completados en esta fase

1. El usuario aprobó después de la inspección estas 14 huellas y el Ref de staging.
2. Se preparó un baseline del staging vacío, cifrado y con restauración/ACL verificados localmente; su alcance y límites están en el [resultado](staging-migration-result.md).
3. Se revalidaron destino/estado, huellas y dry-run. Se aplicaron una vez, sin seeds o bootstrap.
4. Se verificaron historial, grants/RLS/EXECUTE y Storage. Configuración API/Auth, funciones y frontend siguen pendientes de su fase de despliegue.

No hay migraciones nuevas o cambios de SQL en esta continuación. Las guías de [despliegue](deployment-review.md) y [recuperación](backup-recovery.md) mantienen los pasos posteriores.
