# T11: perfiles públicos

Cada tarjeta abre `/participante/:slug`. Se muestra nombre, avatar o foto, mensaje opcional, tres posiciones de regalo y un bloque separado de gustos generales. No hay acciones de edición para visitantes. Desde T12, un enlace privado validado muestra controles únicamente para el participante autorizado o el organizador. Los formularios siguen en T13/T18 y la administración del nombre/orden en T20.

## Previsualización

```powershell
npm run preview:local
```

Abrir `http://127.0.0.1:5173/` y elegir una tarjeta, o abrir directamente `http://127.0.0.1:5173/participante/melyza`. También funciona `/participante/derek-leonardo`. Recargar conserva la ruta; Ctrl+C detiene los procesos.

Los once participantes siguen con listas vacías, sin deseos ni preferencias inventados. Las tarjetas de regalo completo que aparecen en las pruebas son fixtures aislados del navegador: no se cargan en la previsualización normal, en el roster ni en Supabase. El modo temporal no utiliza la conexión de `.env.local`, no necesita Docker y no guarda cambios al cerrar.

El modo habitual `npm run dev` sí lee el destino de `.env.local`; usarlo solo con el entorno local revisado y autorizado, como se explica en [catálogo](catalogue.md). T11 no modificó esa configuración ni se conectó a la instancia remota.

## Comportamiento

- Las posiciones son siempre 1, 2 y 3. Un regalo en la posición 3 no ocupa un hueco anterior. El orden no indica preferencia.
- Los huecos muestran «Regalo pendiente» y «Pronto habrá una pista por aquí», con estructura estable y sin acciones de edición.
- Una opción completa muestra solo los datos disponibles: imagen, título, descripción, precio referencial, características y enlace de tienda. La imagen conserva su proporción con `object-fit: contain`; si falta o falla se presenta una alternativa local sin perder el texto.
- El precio cero se muestra; un precio ausente se omite. `Intl.NumberFormat` usa `es-PE`. PEN aparece en soles y las monedas extranjeras conservan su código y valor, sin conversión.
- Las características se etiquetan según tipo. Calzado conserva numeración y sistema EU/US/UK tal como fueron guardados, sin deducir equivalencias. Colores alternativos, notas y demás campos no se mezclan con gustos generales.
- Mensaje, descripción y preferencias son texto plano, con saltos de línea y ajuste de palabras largas. No se interpreta HTML de la base de datos.
- «Copiar perfil público» genera la URL desde el origen actual y el slug, descartando parámetros y fragmentos. No copia la URL de acceso privado. Si el portapapeles no existe o se deniega, muestra un campo de solo lectura para seleccionar y copiar el enlace manualmente.
- Slug malformado o inexistente muestra «No encontramos este perfil» y retorno al catálogo. Un fallo temporal muestra error y reintento, sin revelar información interna del proveedor.

## Archivos

| Archivo | Responsabilidad |
| --- | --- |
| `src/pages/ParticipantProfilePage.tsx` | Composición pública y estados; reemplaza el aviso transitorio de T10. |
| `src/hooks/usePublicProfile.ts` | Carga por slug, cancelación y descarte de respuestas antiguas. |
| `src/services/profile.ts` | Un GET público con regalos relacionados y `maybeSingle`; límite de 12 s. |
| `src/domain/profile.ts` | Tres posiciones, detalles, precios, imágenes y URL pública limpia. |
| `src/components/profile/WishlistGrid.tsx` | Tarjetas completas y pendientes. |
| `src/components/profile/GiftImage.tsx` | Imagen con espacio reservado y fallback. |
| `src/components/profile/CopyPublicProfile.tsx` | Copia y alternativa manual accesible. |
| `src/styles/profile.css` | Perfil y cuadrícula 3/2/1, tipos y pantallas estrechas. |
| `scripts/preview-catalogue.mjs` | Lectura local por slug con SQL fijo y parámetros; solo en memoria. |
| `tests/unit/profile.test.ts`, `tests/ui/profile.spec.ts` | Reglas de dominio, servicio, interacción y accesibilidad. |

`App.tsx` carga el perfil bajo demanda. `ParticipantAvatar` acepta ahora los campos comunes de catálogo/perfil. No se añadieron paquetes, migraciones ni permisos.

## Seguridad y validación

La consulta usa el cliente público de solo lectura, con el slug como filtro y los campos públicos necesarios. Las posiciones duplicadas, fuera de rango o con otro propietario se rechazan al construir el modelo. Al salir o cambiar de slug se cancela la consulta; una respuesta anterior no sustituye el perfil actual.

Las imágenes de Storage se resuelven dentro de `wishlist-media` y bajo el UUID del propietario. Las URL de productos/imágenes externas se validan como HTTPS público; los enlaces de tienda usan `noopener noreferrer` y anuncian la nueva pestaña. Ninguna función de servidor descarga productos en este bloque. La API temporal conserva el rechazo de escrituras y solo admite un filtro por slug validado con consulta SQL parametrizada.

Las pruebas cubren 0/1/2/3 regalos, huecos, moneda, datos opcionales, calzado, retorno/recarga, slug inexistente, error/reintento, imágenes rotas, copia sin secretos y cambio de perfil con una respuesta demorada. Axe comprueba reglas WCAG A/AA en perfiles vacíos y completos. Se revisan capturas en escritorio/tableta/móvil, reflujo a 320 px y texto al 200 %. Lectores de pantalla reales y otros motores siguen previstos para T21.

T11 se validó con PostgreSQL embebido, el SDK real con transporte controlado y navegador contra la API temporal. La comprobación con PostgREST real queda pendiente de Supabase local; no se ejecutó ninguna operación sobre la base remota.

Referencia del contrato de lectura: [Supabase maybeSingle](https://supabase.com/docs/reference/javascript/using-modifiers-maybesingle) y [AbortSignal](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal).
