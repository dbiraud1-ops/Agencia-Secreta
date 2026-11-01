# Configuración final de Google Sheets

El backend de Vercel ya está preparado para aceptar cambios de agentes, casos y avisos. Para que pueda escribir en las hojas falta autorizar a una cuenta de servicio de Google.

## 1. Crear una cuenta de servicio de Google

1. En Google Cloud, crea o selecciona un proyecto.
2. Activa **Google Sheets API**.
3. Crea una cuenta de servicio.
4. Genera una clave JSON y descárgala.
5. No subas ese JSON a GitHub ni lo compartas en chats. Contiene una clave privada.

Si la cuenta de Google es de un menor o está gestionada por un adulto, pide al titular adulto que realice esta configuración.

## 2. Dar acceso a las tres hojas

Abre el JSON descargado y copia el valor de `client_email`. Comparte estas hojas con esa dirección y permiso **Editor**:

- Agentes: https://docs.google.com/spreadsheets/d/1knpqWSvA_-HV6ds3S1_zfnlGra0Rntruyr5yfxckNLI/edit
- Casos: https://docs.google.com/spreadsheets/d/1UggxnFhR_qOjQTvCJB7kMUSJHyTr2S4WpBT7wNM2pzc/edit
- Avisos: https://docs.google.com/spreadsheets/d/1Hn_oprid9VGgd7w5jP654yWw31Ap3cRb6mxYA8kk3Vw/edit

## 3. Guardar la credencial en Vercel

En el proyecto `agencia-secreta-backend`, entra en **Settings → Environment Variables** y crea:

- Nombre: `GOOGLE_SERVICE_ACCOUNT_JSON`
- Valor: el JSON completo de la cuenta de servicio.
- Entornos: Production (y Preview/Development si también se van a probar).
- Tipo: Sensitive.

Guarda el cambio y vuelve a desplegar el proyecto.

## 4. Qué sincroniza el backend

- Agentes: altas y modificaciones. El campo `password` se descarta expresamente antes de llamar a Google Sheets.
- Casos: altas y modificaciones.
- Avisos: altas y modificaciones.
- Expedientes y base de pistas: no se envían.
- Eliminaciones: no existe ninguna operación de borrado en el backend; se mantienen solo en la web.

El backend añade una columna `ID_SISTEMA` a las hojas de casos y avisos si no existe, para poder actualizar registros sin duplicarlos.

## Seguridad

La contraseña administrativa y la clave de firma de sesiones están configuradas como variables Sensitive de Vercel. La contraseña de Dirección se gestiona en Vercel, no en el almacenamiento local del navegador. Nunca guardes credenciales de Google en `index.html`, en otros archivos públicos ni en el repositorio.
