# Enlace del organizador guardado y recuperación

Recuperación autorizada y completada el **1 de noviembre de 2026**, después de que el usuario indicara que rotó el organizador y perdió el enlace nuevo. La página «Este enlace de edición no está disponible» era una respuesta de la aplicación: el comando local conservaba la capacidad inicial revocada. Es distinto del [404 de alojamiento ya corregido](routing-git-deployment-fix.md).

## Abrir o actualizar la copia cifrada

Desde la raíz del repositorio:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\organizer-production.ps1 -Open
```

Si conservas un enlace nuevo después de rotar desde la interfaz, sincronízalo con el archivo local:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\organizer-production.ps1 -Import -Open
```

La terminal solicita el enlace mediante entrada oculta, sin introducirlo como argumento o guardarlo en el historial. Verifica dominio/ruta/formato, cifra con DPAPI CurrentUser, comprueba el descifrado y reemplaza el archivo local. No genera accesos ni modifica el servidor. El importador comprueba el formato; no demuestra por sí solo que la capacidad siga vigente.

`-Check` verifica el cifrado y formato **locales**, sin certificar vigencia del enlace. El comando anterior bajo `artifacts/deployment/production/open-organizer.ps1` delega ahora en este script, por lo que puede seguir utilizándose. Los secretos siguen fuera de Git; el script se puede conservar en el repositorio.

## Si se perdió el enlace nuevo

La base solo conserva un hash: no puede reconstruirse la capacidad original. La propuesta de recuperación usa la rutina existente `private.bootstrap_organizer(nuevo_hash, true)`. **Revoca los accesos no revocados del organizador y crea un reemplazo**, sin cambiar participantes, regalos, evento, imágenes o accesos personales. No implica recrear la base, aplicar migraciones o desplegar servicios.

La [transacción preparada](sql/production-recover-organizer.sql) comprueba contexto administrativo, formato de hashes y una huella del estado revisado del organizador bajo el bloqueo de su ciclo de acceso. Si el organizador cambió entre revisión y ejecución, se detiene en lugar de invalidar una elección posterior del usuario. El reemplazo se conserva cifrado antes de operar para poder resolver una respuesta perdida, y la copia activa local se sincroniza después de verificar el resultado.

**Resultado:** tras la autorización expresa «Autorizo completamente», se ejecutó la transacción revisada. Quedó un único organizador nuevo sin revocar, con cuatro registros históricos en total; se conservaron el participante existente, los regalos, evento, archivos/historial y las huellas de accesos personales. Solo se sustituyó el acceso del organizador. Los contadores de cuotas pueden cambiar por las propias comprobaciones HTTP.

El enlace pendiente se guardó cifrado antes de operar. La transacción y la validación HTTP terminaron correctamente; el primer reemplazo local del archivo falló por el tratamiento de una ruta de backup nula en Windows PowerShell. Se corrigió usando una ruta real de copia cifrada y se reanudó con **la misma capacidad**, sin otra rotación. La copia que utiliza el comando quedó sincronizada y verificada. Los tokens originales no se imprimieron ni se guardaron en claro.

Las evidencias están ignoradas en `artifacts/organizer-recovery-20261101/`: plan, conteos/huellas previos, ensayo local, resultado de transacción, resultado final y prueba de navegador. El error del primer intento es histórico y no implica una recuperación pendiente. No hubo migraciones, despliegues o cambios en participantes/regalos para recuperar el acceso.

El ensayo local en PostgreSQL embebido comprobó que una huella obsoleta rechaza la operación, que queda exactamente un organizador nuevo activo y que se conservan datos y accesos personales. No se usó producción para ese ensayo.
