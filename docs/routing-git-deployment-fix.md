# Corrección: entradas privadas con 404 tras un despliegue Git

Resultado del **1 de noviembre de 2026, America/Lima**. **Corregido en producción**, despliegue `dpl_2RVveE6BASxrffnjnCiTnZHfK1JR`, Node 24.x, dominio [amigo-secreto2026.vercel.app](https://amigo-secreto2026.vercel.app).

## Causa comprobada

La raíz `/` e `/index.html` respondían 200, pero `/organizador/acceso`, `/acceso` y `/organizador/evento` devolvían un 404 de Vercel. Tampoco se recibían las cabeceras/CSP previstas. El error sucedía al pedir el documento, antes de que React pudiera leer o validar el enlace.

El dominio apuntaba a `dpl_8zrSUWqFMYS8uy2eGSD8dV15edLN`, un despliegue automático Git del commit `5e6145841cdfd89271c0491901b3c4341127d836`. La publicación CLI anterior sí había pasado sus comprobaciones, pero había utilizado `--local-config artifacts/deployment/production/vercel.json`. Ese archivo estaba ignorado por Git y no existía un `vercel.json` en la raíz del repositorio.

Por tanto, el siguiente despliegue Git construyó el frontend sin las reglas de fallback SPA ni las cabeceras del archivo de configuración usado manualmente. Era una omisión en la preparación del repositorio para despliegues automáticos. La rotación del enlace no causó este 404.

## Corrección

- Añadido [vercel.json en la raíz](../vercel.json), con las mismas reglas productivas revisadas: las rutas de documento SPA sirven `index.html`, mientras `/api`, assets y rutas de archivos siguen fuera de ese fallback.
- Restauradas CSP con el Supabase productivo exacto, `no-referrer`, `nosniff`, protección de framing, caché de documentos/assets y configuración del adaptador Node.
- El [generador del paquete](../scripts/prepare-deployment.mjs) incluye ahora `vercel.json` en su inventario de huellas.
- Añadida una regresión que exige que el archivo raíz coincida con el generador y cubre expresamente `/acceso` y `/organizador/acceso`, además de excluir API y archivos inexistentes.

La configuración raíz corresponde a **producción**. Para staging se mantiene la configuración generada con su propio origen y la opción `--local-config artifacts/deployment/staging/vercel.json`. No reutilizar la CSP productiva para publicar un frontend contra otro backend. Un preview Git no recibe autorización de edición ni variables Production por tener este archivo.

## Verificación y publicación

Pasaron **seis pruebas de configuración**, TypeScript y el build remoto. El inventario de subida revisó **126 archivos regulares**, incluido el `vercel.json` raíz, sin respaldos, archivos de entorno o credenciales. El despliegue se ejecutó **sin `--local-config`**, para verificar que el proveedor descubre la configuración raíz que utilizará Git.

Primero se construyó con `--prod --skip-domain`. En la URL inmutable se comprobaron documentos SPA, cabeceras, rutas API y assets; el bypass temporal de prueba se revocó. Después se promovió y asignó el dominio canónico al nuevo build, comprobando su recurso de alias.

| Comprobación | Resultado |
| --- | --- |
| `/`, `/acceso`, `/organizador/acceso`, `/organizador/participantes`, `/organizador/evento` y perfil no existente como documento SPA | 200 con HTML de la aplicación en el build revisado. |
| Entradas privadas en dominio canónico | 200 y cabeceras/CSP restauradas. |
| Asset y API inexistentes | 404, sin HTML de React como sustituto. |
| GET del adaptador `/api/fetch-product` | 405, conserva su función de servidor. |
| Edge real de navegador, entradas personal/organizador y recarga | Cargan React, consumen el fragmento y muestran el rechazo de una credencial deliberadamente inválida dentro de la app. |

No se utilizó el token de las capturas, se generaron enlaces nuevos o se recuperó/rotó el organizador. Tampoco hubo consultas o cambios de base, despliegue Edge o cambios en staging. La prueba de navegador fue de enrutamiento, no una afirmación de haber autenticado el nuevo enlace real del usuario.

## Qué conservar

El enlace nuevo copiado después de la rotación es el que corresponde utilizar. El enlace anterior y el archivo local que conservaba aquel acceso inicial no se actualizan automáticamente al rotar desde la interfaz; no se ejecutó recuperación para sustituir la elección del usuario.

**El `vercel.json` raíz debe incluirse en el próximo commit/push**, junto con los cambios del generador y la prueba. La corrección ya está desplegada mediante CLI, pero no se hizo commit o push: Git solo conservará la configuración en futuros despliegues cuando el archivo forme parte de la revisión enviada. Añadirlo únicamente al equipo local no modifica una revisión Git remota.

Evidencias ignoradas en `artifacts/routing-fix-20261101/`: `inspection.json`, `upload-review.json`, `deployment.json`, `build-status.json`, `verification.json`, `temporary-bypass.json` y `browser-verification.json`. El despliegue Node 24 anterior `dpl_Bo3Vt83ahS1pi98FEv7yCbiAf3DD` conserva el punto de retorno de la publicación inicial; no confundirlo con el despliegue Git que perdió la configuración.

La [documentación oficial de Vercel para Vite](https://vercel.com/docs/frameworks/frontend/vite) exige definir el enrutamiento de documentos de una SPA en la configuración raíz. En este proyecto la regla se acota para conservar correctamente las API y los assets. La lección práctica es comprobar el mismo camino de configuración que utilizarán las siguientes publicaciones, además de verificar el primer despliegue manual.
