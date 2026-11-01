# T25: respaldo productivo y restauración local

Continuación posterior: [producción publicada y aceptada](production-deployment-result.md), con acceso inicial autorizado. Este informe conserva el estado del respaldo previo, anterior a ese acceso.

Resultado del 2026-10-31 (America/Lima), autorizado para respaldar producción y probar la restauración en un destino local aislado, sin publicar. **Respaldo cifrado y restauración lógica verificados.** No se modificaron datos/configuración de aplicación en producción, no se aplicaron migraciones ni se hizo bootstrap o despliegue.

## Respaldo y comprobaciones

Origen confirmado: `AmigoSecreto2026`, Ref `jtuhcilcnuydsbcbsazo`, PostgreSQL `17.11.0.003`. Se exportaron `public`, `private` y `supabase_migrations` con pg_dump 18.3, formato custom, mediante TLS y el rol temporal oficial de solo lectura. Su credencial duraba 300 segundos, se manejó en memoria y no se guardó. No se restableció la contraseña productiva ni se cambiaron bloqueos de red.

La copia se conserva en `backups/production/20261031-prepublish/application.dump.dpapi.local`, ignorada por Git y excluida del paquete Vercel. El archivo original tenía 129 853 bytes. Se comprobó SHA-256 antes/después del cifrado DPAPI CurrentUser, lectura del catálogo descifrado y restauración del contenido; la copia sin cifrar se eliminó. El manifiesto contiene hashes, alcance, configuración del bucket y resultado de verificación, sin contraseñas o enlaces privados.

Las tres consultas de control —antes de exportar, después y al terminar el ensayo— coincidieron: cero participantes, regalos, accesos, cuotas, medios, borrados, importaciones, objetos Storage y usuarios Auth; una fila de evento y catorce entradas de historial. Se compararon también huellas SHA-256 de las nueve tablas respaldadas, permisos de esquemas/defaults y metadatos del bucket. [Consulta READ ONLY revisable](sql/production-backup-snapshot.sql).

## Restauración aislada

Se creó una instancia nativa PostgreSQL 18.3 propia en `127.0.0.1:55433`, base `amigo_prod_recovery_20261031`. Antes de escribir se verificaron dirección, puerto y directorio exacto del clúster de ensayo. Se usó una simulación mínima local de roles/Auth/Storage; no se restauró sobre producción o staging ni se utilizaron sus servidores locales anteriores. **La instancia de ensayo terminó detenida.**

La restauración conservó propietarios y ACL, sin omitir globalmente permisos. El dump limitado a esquemas necesitó un suplemento local revisado: `PUBLIC USAGE` de `public` y el default global que retira EXECUTE de funciones a PUBLIC. Ambos se reconstruyeron según lo observado en origen. Los seis DEFAULT ACL de `public` también coincidieron; al comparar ACL se ignoró únicamente el orden de sus entradas.

La configuración del bucket y sus dos políticas se reconstruyeron exclusivamente en la simulación local usando la migración Storage revisada. Storage de origen tenía cero objetos en las tres mediciones: no había bytes que exportar/restaurar.

- Conteos y nueve huellas de datos: iguales, incluido el historial de catorce migraciones.
- Ocho tablas, 72 columnas, 71 restricciones previas, 24 índices, cinco políticas, cinco triggers y 23 funciones: contrato igual al productivo, con permisos/RLS y fuentes de funciones conservados.
- PostgreSQL 18 añadió 54 entradas de catálogo NOT NULL: todas validadas y correspondientes exactamente a las columnas NOT NULL de origen. Es el [cambio documentado de PostgreSQL 18](https://www.postgresql.org/docs/18/release-18.html); no se descartaron otras diferencias.
- Lectura con rol `anon`: cero participantes/regalos y un evento, sin alterar permisos privados.
- Las 137 fuentes de la versión candidata y las catorce migraciones conservan sus SHA-256.

## Custodia, límites y siguiente paso

**La copia externa queda pendiente por decisión del usuario.** DPAPI depende de este usuario/equipo Windows; copiar el cifrado a otra unidad por sí solo no lo convierte en portable. El intento opcional de restringir explícitamente el ACL NTFS devolvió acceso denegado; no se cambió la propiedad ni se elevó para forzarlo. El cifrado y descifrado sí quedaron comprobados.

Este resultado prueba recuperación lógica de la aplicación y su historial desde PG17 a un PG18 aislado con plataforma simulada. No certifica restauración alojada, recuperación física completa, roles/servicios administrados, Auth, secretos o despliegues Edge/Vercel. No se reactivaron capacidades restauradas: el origen tenía cero accesos y el destino quedó apagado. Para una recuperación futura con accesos, sigue vigente la revocación previa a reabrir endpoints descrita en [recuperación](backup-recovery.md).

Evidencias locales: `manifest.json`, `export-result.json`, `encryption-result.json`, `source-before.json`, `source-after.json`, `source-final.json`, `restored-snapshot.json`, `restored-contract.json`, `restored-anon-read.json`, `restore-execution.json`, `restore-verification.json`, `application.toc` y `restore-acl-supplement.sql` en la carpeta del respaldo. Los errores de intentos iniciales en artefactos son históricos; el resultado final verificado está en `restore-verification.json`.

**T25 sigue abierto.** Quedan confirmar dominio y configuración efectiva productiva, revisar secretos propios/CSP/CORS/Node y versión de retorno, y aprobar/publicar backend/frontend con aceptación controlada. No hay migraciones pendientes que aplicar. La autorización de este ensayo no incluye publicación. [Plan actualizado](production-review.md).
