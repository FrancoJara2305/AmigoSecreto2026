# T25: migraciones aplicadas y verificadas en staging

Resultado del 2026-10-31 (America/Lima). El usuario aprobó preparar recuperación y aplicar exactamente las 14 migraciones revisadas en **AmigoSecreto2026-staging**, Ref **`eknnkmndfxgyjsdgkwkh`**. **14 versiones registradas, cero migraciones pendientes.** Producción no fue consultada por SQL ni modificada. No hubo publicación, seeds, bootstrap o carga de secretos de aplicación.

## Recuperación preparada antes de aplicar

Se revalidaron las 14 huellas del [conjunto revisado](staging-migration-review.md) y el estado remoto: no existían historial, esquema privado, objetos de aplicación, buckets o archivos. Por ser un staging nuevo sin datos de aplicación, se preparó un **baseline lógico del ámbito afectado**, no una copia física completa de los servicios administrados.

- `pg_dump 18.3`, instalado en Windows, exportó `public` del PostgreSQL remoto 17.11 en formato custom y conexión de solo lectura. Incluye esquema, propietarios, ACL y defaults públicos; `private` e historial aún no existían. El catálogo previo documenta también los defaults globales y Storage vacío.
- Se restauró en un PostgreSQL **18.3 local aislado**, dentro de `artifacts/t25-staging-recovery`, escuchando solo en `127.0.0.1:55432`. No se inició Docker o la pila local principal. Los roles de plataforma usados para restaurar ACL fueron simulados, sin login.
- La primera comparación detectó que el recorrido dump/restore no conservaba `PUBLIC USAGE` en el esquema `public`. Se añadió **`restore-public-acl.sql`**, limitado al permiso observado en el origen, y se repitió la restauración. La comparación final confirmó **ACL de esquema y seis registros de DEFAULT ACL idénticos**, cero relaciones/rutinas públicas y servidor de ensayo detenido.
- El dump quedó cifrado con **DPAPI CurrentUser**, con descifrado verificado y SHA-256 en el manifiesto. La copia temporal sin cifrar se retiró; el TOC se regeneró desde el archivo descifrado en memoria. No se imprimieron credenciales ni se guardó la conexión temporal.

Ubicación ignorada por Git y excluida de Vercel: `backups/staging/20261031-initial/`. Contiene `public-before.dump.dpapi.local`, `manifest.json`, catálogo previo, TOC, suplemento ACL, consulta de verificación y resultado de restauración.

**Límites:** depende del usuario/equipo Windows y no tiene copia externa; el ensayo fue local PG18, no restauración alojada PG17. No es un backup completo de Auth, Vault, roles administrados, plataforma o configuración de proveedores. Es apropiado al baseline vacío de esta fase; no certifica la recuperación futura de producción. No se ejecutó rollback destructivo: cualquier recuperación alojada necesita preservar el estado fallido y revisar destino, plataforma, defaults globales, historial y cambios de bucket antes de restaurar, preferentemente en un staging nuevo.

## Aplicación exacta

Se usó el Ref explícito, sin vincular el repositorio:

```cmd
npm.cmd run supabase -- db push --linked --project-ref eknnkmndfxgyjsdgkwkh --skip-vault --dry-run --yes --output-format json
npm.cmd run supabase -- db push --linked --project-ref eknnkmndfxgyjsdgkwkh --skip-vault --yes --output-format json
```

El dry-run devolvió exactamente los 14 nombres aprobados en orden; se comprobó que no había archivos adicionales o huellas cambiadas. La aplicación terminó correctamente. Ambas respuestas indicaron `seeds: []` y `roles: []`; se omitió Vault expresamente. No se usaron include-all/include-seed/include-roles, repair, reset, config push o bootstrap. La CLI gestionó su autenticación y tabla de historial estándar; no se creó un historial manual alternativo.

El conjunto completo y sus SHA-256 siguen en la [tabla revisada](staging-migration-review.md). Evidencias ignoradas: `push-dry-run.json`, `push-result.json` y `migration-plan.json` dentro de `artifacts/deployment/staging/`.

## Resultado comprobado en la base

Las consultas posteriores fueron READ ONLY con ROLLBACK. Se validaron los resultados contra el plan y el contrato esperado, sin ejecutar pruebas destructivas o emitir capacidades.

| Comprobación | Resultado |
| --- | --- |
| Historial | Las 14 versiones y nombres coinciden exactamente con el conjunto aprobado. |
| Tablas de aplicación | 8, todas con RLS habilitado; tres públicas y cinco privadas. |
| Permisos cliente | `anon`/`authenticated`: SELECT en las tres tablas públicas; sin INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER. Sin acceso a tablas ni USAGE de `private`. |
| Rutinas | 23 SECURITY INVOKER con search_path fijo; ninguna ejecutable por `anon`/`authenticated`. |
| RPC públicas | 9, ejecutables por `service_role`; bootstrap privado no ejecutable por ese rol, sí por `postgres`. |
| Lecturas reales por rol | `anon` y `authenticated` leyeron participantes/regalos vacíos y la fila del evento en transacciones READ ONLY. |
| Datos | 0 participantes, regalos, accesos, cuotas, medios, tombstones o importaciones. 1 fila inicial del evento, prevista en la primera migración. |
| Bucket | Solo `wishlist-media`, público, límite 3 MiB, MIME JPEG/PNG/WebP. Cero objetos. |
| Políticas | Tres SELECT públicas y dos restrictivas de Storage; RLS de buckets/objects sigue habilitado. |

El catálogo confirma que las revocaciones explícitas neutralizan los grants de cliente heredados para los objetos de esta aplicación. Los defaults amplios de `public` siguen requiriendo cuidado al crear objetos futuros. La lectura pública del bucket y las rutas de Edge/Storage por HTTP se probarán con el despliegue; los checks SQL no certifican esos transportes.

Evidencias: `verification-after-migrations.json`, `client-reads-after-migrations.json` (authenticated), `anon-read-after-migrations.json` y sus consultas SQL; todos bajo `artifacts/deployment/staging/`. `migration-plan.json` registra aprobación, recuperación, aplicación y hashes de las evidencias; `infrastructure.json` registra el estado actual. El manifiesto offline original conserva el estado de su generación anterior y no sustituye esos registros posteriores.

## Pendiente de T25

Configurar/verificar APIs expuestas y Auth/signup/Realtime del proveedor; desplegar las tres Edge y el descargador Node con secretos propios de staging, configurar variables y publicar el frontend. Después preparar el acceso inicial del organizador mediante un procedimiento alojado revisado y ejecutar aceptación real, incluido lector de T21 y una tienda real. La publicación y el bootstrap quedaron fuera de la autorización de esta fase. Producción conserva su revisión y aprobación separadas.
