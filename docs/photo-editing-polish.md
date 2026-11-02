# Foto de perfil: encuadre, subida y confirmación visibles

Ajuste solicitado el **1 de noviembre de 2026** para que subir una foto y guardar cambios se sienta más claro.

## Encuadre antes de subir

Al elegir una foto válida en el perfil (participante u organizador) se abre **Ajusta tu foto**. La imagen se ve dentro del mismo círculo que mostrará el perfil:

- arrastrar con mouse o dedo, o usar las flechas con el encuadre enfocado (Mayús mueve más rápido);
- acercar o alejar con el control deslizante, los botones de lupa, la rueda del mouse o las teclas `+` y `−`, hasta 4×;
- **Centrar** vuelve al cuadrado central y **Cancelar** o Escape cierran sin subir nada; el foco vuelve al selector.

**Usar esta foto** recorta el cuadrado en el navegador (hasta 1024 px, el tamaño final del avatar) y lo envía como JPEG sin metadatos. El servidor no cambia: sigue validando y normalizando a WebP. Si el archivo no pasa la comprobación local (tipo, tamaño, animación) se muestra el mensaje habitual sin abrir el ajuste ni enviar nada. Si el navegador no puede mostrarla, el diálogo ofrece subirla sin ajustar.

El cálculo vive en `src/domain/photo-crop.ts` (función pura) y el diálogo en `src/components/editor/PhotoCropDialog.tsx`, montado fuera del formulario para que un formulario deshabilitado no deshabilite sus botones.

### Fotos guardadas antes del encuadre

Las fotos subidas antes de este cambio pueden no ser cuadradas (el servidor solo limita el lado mayor). El avatar ahora **siempre** muestra un círculo 1:1 con la parte central de la imagen, sin estirarla: antes, una foto vertical hacía crecer el contenedor y se veía como un óvalo en el catálogo, el perfil y el listado del organizador. La imagen queda fuera del flujo (`position: absolute` con `object-fit: cover`), de modo que su proporción ya no puede cambiar el tamaño del círculo.

Con una foto subida en el formulario aparece **Ajustar encuadre**. Si la foto se acaba de elegir, reabre el original completo que quedó en memoria; si ya estaba guardada, la lee del almacenamiento público (sin credenciales; Storage responde con `Access-Control-Allow-Origin: *`, comprobado en el Supabase local) y abre el mismo diálogo. Al confirmar se sube el nuevo recorte y, como siempre, solo se aplica al guardar. Si no se puede leer, se muestra un aviso y no cambia nada.

Las fotos por URL se muestran con su parte central; para elegir el encuadre hay que subir el archivo, porque la política de seguridad no permite leer imágenes de otros dominios. Las imágenes de regalos no se recortan.

## Zona de subida

El selector de archivos de foto y de imagen de regalo es ahora un área con icono y texto. Al pasar el mouse o arrastrar un archivo encima cambia de borde y fondo; con teclado muestra el contorno de foco. Mientras sube, el icono pasa a un indicador de carga. Por dentro sigue siendo el mismo `input type="file"` con su etiqueta, de modo que lectores de pantalla y pruebas lo encuentran igual.

## Pantalla de carga y check

Subir una foto o imagen y guardar el perfil, un regalo, un participante o el evento muestran un velo sobre la página con un indicador y, al confirmarse, un check animado («Foto lista», «Perfil guardado», «Regalo guardado»…) durante algo más de un segundo. Respuestas de menos de 150 ms no muestran el indicador para evitar parpadeos, pero sí el check. Un error no muestra check: se mantiene el aviso de error existente.

El velo no captura clics ni foco: el formulario ya está deshabilitado mientras trabaja y los avisos de salida siguen funcionando. El estado se anuncia en una región `status`. Con movimiento reducido el check aparece sin animación.

## Botones

Todos los botones tienen respuesta al pasar el mouse (tono, borde y una ligera elevación en primario/secundario), un tono al enfocarlos con teclado y una pequeña compresión al presionar. Las ilustraciones locales también reaccionan al pasar el mouse.

## Comprobaciones

- `tests/unit/photo-crop.test.ts`: recorte centrado, arrastre con límites, zoom acotado y tamaño de salida.
- `tests/ui/photo-crop.spec.ts`: una foto vertical se ve como círculo 1:1 en catálogo, perfil, vista previa y listado del organizador; reencuadre de la foto guardada (se sube la mitad elegida) y del original en memoria, y aviso si no se puede leer; lo que se sube es exactamente el encuadre elegido (imagen mitad roja/azul, se encuadra la mitad azul y se decodifica el JPEG enviado), velo y check al subir y guardar, arrastre, zoom, Centrar, Escape/Cancelar sin subida y retorno del foco, hover y Axe WCAG 2.2 AA con el diálogo abierto.
- Las pruebas existentes de perfil y organizador confirman el encuadre con **Usar esta foto** y mantienen sus comprobaciones de acceso, cuotas y borradores.
