Front para actividades de formación complementaria

## Login con Google mediante gateway HTTPS

El gateway `3010` y su documentación se administran desde el repositorio AFC Back. AFC Front conserva únicamente la interfaz y el modo runtime `PUBLIC_GOOGLE_AUTH_MODE=gateway`.

## Importación CSV de estudiantes

Desde **Administración → Usuarios**, un administrador con carrera asignada puede descargar la plantilla, seleccionar un CSV de hasta 2 MB y 1000 estudiantes, validarlo y confirmar la importación. El administrador global debe elegir una carrera académica; un administrador de carrera solo puede importar en la suya.

El archivo debe estar codificado en UTF-8 y usar exactamente este encabezado, en el mismo orden:

```csv
nombres,apellidos,correo,numero_cuenta
```

`numero_cuenta` debe contener exactamente 9 dígitos. La validación no crea usuarios: la creación ocurre únicamente después de revisar el resumen y confirmar. Los estudiantes que ya existen exactamente se omiten; cualquier conflicto debe corregirse antes de volver a validar el archivo.