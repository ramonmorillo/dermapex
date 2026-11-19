# DERMAPEX — recuperación segura de cuentas (procedimiento operativo)

## Diagnóstico confirmado (19/11/2026)
- El proyecto Supabase está activo.
- El flujo React ya contiene `requestPasswordReset`, `ConfirmEmailLinkPage` (canje al pulsar **Continuar**, no al cargar) y `SetPasswordPage`.
- Existe `profiles.must_change_password` y la función `mark_password_changed`.
- En los logs se observan `One-time token not found` y `invalid_credentials`; no identifican de manera concluyente a la persona afectada ni confirman error SMTP.
- En la captura del panel, el SMTP personalizado estaba inicialmente desactivado; fue activado manualmente sin configurar credenciales. No se debe guardar esa configuración incompleta.

## Recuperación ordinaria para todos los investigadores
1. Confirmar la existencia de la cuenta y que no está suspendida.
2. Configurar un proveedor SMTP transaccional legítimo con remitente autenticado y SPF/DKIM/DMARC; guardar secretos solamente en Supabase, nunca en GitHub ni el frontend Vite.
3. Verificar `Site URL`, `Redirect URLs` y la plantilla de recuperación, particularmente para GitHub Pages y HashRouter.
4. En la plantilla de correo, preferir el enlace a `/#/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` [adaptar la URL real]; comprobar que los enlaces llevan a `ConfirmEmailLinkPage`.
5. La página de confirmación NO canjea el token hasta un clic expreso, por compatibilidad con escáneres corporativos.
6. Realizar una prueba con cuenta de ensayo autorizada: entrega, clic, cambio de contraseña, inicio de sesión, y conservación de permisos.

## Procedimiento excepcional si no llega el correo
- Autenticar por un canal independiente la identidad del investigador antes de modificar nada.
- Un administrador autorizado puede actualizar la contraseña de la cuenta **existente** con `supabase.auth.admin.updateUserById(userId, { password: temporalAleatoria })` desde un entorno seguro del servidor.
- Nunca incluir claves `service_role` o `sb_secret` en GitHub Pages, scripts de navegador, commits ni conversaciones.
- Compartir la contraseña temporal por canal seguro previamente verificado; nunca por correo afectado o enlaces públicos.
- Marcar `profiles.must_change_password=true` mediante el procedimiento administrativo autorizado **antes** de facilitar la contraseña; verificar que la app fuerza el cambio antes del acceso funcional.
- Requerir contraseña nueva y comprobar que se llama `mark_password_changed`.
- Revisar sesiones previas y revocarlas si el riesgo lo justifica. Un cambio de contraseña no debe darse por prueba de que todos los JWT previos han caducado.
- No dar de alta otro usuario ni eliminar el anterior. Validar el mismo UUID, rol y pertenencia al centro antes y después.
- Registrar evento administrativo mínimo en bitácora autorizada, sin contraseñas ni tokens.

## Criterios de aceptación
- Cuentas activas pueden recuperarse por correo real, incluidos dominios corporativos.
- La página de confirmación no consume automáticamente el enlace de un solo uso.
- No hay claves privilegiadas en frontend.
- El mecanismo excepcional conserva UUID, `profiles`, `center_memberships` y datos clínicos.
- Acciones privilegiadas con autenticación de administrador, auditoría y control de acceso estricto.
- Pruebas automatizadas para URL, expiración, petición repetida, envío fallido y falta de divulgación de existencia de usuarios.

## Estado
**Documento de procedimiento; NO se ha rotado ninguna contraseña, configurado SMTP ni desplegado código.**
