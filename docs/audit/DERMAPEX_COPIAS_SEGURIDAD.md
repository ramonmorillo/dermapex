# DERMAPEX · Procedimiento de copias de seguridad y restauración

**Situación de partida (2026-10-28):** el proyecto Supabase `dermapex` está en el **plan gratuito**.
- Según la documentación de Supabase, ese plan **no ofrece copias descargables ni restaurables desde el panel**, ni recuperación a un punto en el tiempo. *Verificar en Panel → Database → Backups.*
- Además, los proyectos gratuitos se **pausan por inactividad**.
- Mientras no se cambie de plan, **la única copia restaurable es la que se haga con este procedimiento**.

> Las exportaciones Excel/CSV del Dashboard son copias **analíticas**: no permiten reconstruir la base de datos (permisos, funciones, auditoría). No sustituyen a esta copia.

## 1. Qué se copia

| Contenido | Incluido | Observaciones |
|---|---|---|
| Estructura y datos de `public`, `app_private` y `coag_private`: tablas, funciones, triggers, políticas RLS, privilegios, `audit_log` | Sí | `pg_dump` en formato custom |
| Cuentas de profesionales (`auth.users`, `auth.identities`) | Sí | Datos personales de los profesionales: van cifrados |
| Metadatos de documentos PDF (`storage.objects`) | Sí | Ruta y fecha de cada PDF |
| **Ficheros PDF** del bucket `visit-documents` | **No** | Se descargan aparte desde el panel (Storage → visit-documents). Riesgo residual documentado |
| Recuento exacto de filas por tabla | Sí | Para verificar la restauración |

Todo va en **un único fichero cifrado con AES-256** (clave derivada con PBKDF2, 600 000 iteraciones), acompañado de su huella SHA-256 (`.sha256`). Los scripts no escriben en disco la contraseña de la base de datos ni la frase de cifrado.

## 2. Responsables y frecuencia

| Tarea | Responsable | Frecuencia |
|---|---|---|
| Hacer la copia | IP o persona delegada por escrito | **Semanal** durante el reclutamiento y el seguimiento |
| Copia extraordinaria | Ídem | **Antes de cada migración** de la base de datos, **antes de borrar los datos de prueba** al iniciar el estudio y antes de cualquier corrección masiva |
| Verificar la restauración | Ídem | **Cada copia** (en el momento); además, una restauración completa trimestral documentada |
| Custodia de la frase de cifrado | IP + promotor (FISEVI) | Permanente: gestor de contraseñas institucional y copia en sobre cerrado |

La frecuencia propuesta implica perder como máximo una semana de datos. Debe ajustarse al ritmo de inclusión real (decisión del IP y del promotor).

## 3. Requisitos (una sola vez)

1. Cliente PostgreSQL de la **misma versión mayor que el servidor o superior**. Supabase usa PostgreSQL **17**.
   - macOS: `brew install postgresql@17`
   - Linux: paquete `postgresql-client-17`
   - Windows: instalador oficial de PostgreSQL 17 o WSL
2. `openssl` (incluido en macOS y Linux).
3. Datos de conexión: Panel de Supabase → **Connect** → **Session pooler**: host, puerto 5432, usuario `postgres.<ref>` y la contraseña de la base de datos. El plan gratuito no admite conexión directa por IPv4, así que se usa el *Session pooler*.
4. Para la verificación, un PostgreSQL local (versión 17 o superior) en el mismo equipo.

## 4. Hacer una copia

```bash
scripts/backup/dermapex-backup.sh /ruta/segura/copias-dermapex
```

El script pide host, usuario, contraseña de la base de datos y frase de cifrado (mínimo 16 caracteres, dos veces). Al terminar muestra la ruta del fichero `dermapex_backup_<fecha>.tar.gz.enc` y su huella.

## 5. Verificar la restauración (obligatorio tras cada copia)

```bash
RESTORE_ADMIN_URL=postgresql:///postgres scripts/backup/dermapex-restore-verify.sh /ruta/segura/copias-dermapex/dermapex_backup_<fecha>.tar.gz.enc
```

Pasos que realiza:
1. Comprueba la huella del fichero cifrado y lo descifra.
2. Comprueba la huella de cada fichero interno.
3. Restaura en una base **local nueva**.
4. Compara el número de filas de **cada tabla** con el registrado en la copia.

Resultado esperado: `RESULTADO: RESTAURACIÓN VERIFICADA · N tablas con el mismo número de filas que en la copia.` Si falla, la copia **no es válida**: hay que repetirla y anotar la incidencia. La base de verificación se elimina al terminar; con `KEEP_RESTORED_DB=1` se conserva para consultarla.

**Registro:** anote en el cuaderno del investigador la fecha, el fichero, la huella y el resultado de la verificación.

## 6. Almacenamiento y retención

- **Dos ubicaciones independientes de Supabase**: unidad institucional cifrada del hospital o fundación y un soporte externo cifrado guardado bajo llave. No usar servicios personales en la nube.
- Acceso restringido al IP y a la persona delegada.
- Retención: **todas las copias durante el estudio** y, al cierre, según la política de archivo del promotor y la normativa aplicable. *A definir por el promotor; no se fija aquí ningún plazo.*
- Destrucción de copias caducadas: borrado seguro y anotación en el registro.

## 7. Recuperación ante un incidente

| Situación | Actuación |
|---|---|
| Borrado o corrección errónea de pocos registros | **Primero `audit_log`**: contiene el valor anterior de cada cambio. Si no basta, restaurar la última copia en local (`KEEP_RESTORED_DB=1`) y recuperar los registros afectados. La corrección en producción la hace coordinación con trazabilidad |
| Proyecto pausado por inactividad (plan gratuito) | Reanudar desde el panel de Supabase. Los datos se conservan mientras el proyecto no se elimine |
| Pérdida o corrupción del proyecto | Crear un proyecto nuevo y restaurar la estructura y los datos del `.dump` y las cuentas de `auth_data.dump` (cada profesional deberá restablecer su contraseña). Volver a subir los PDF. **Procedimiento técnico asistido**: solicitar apoyo antes de ejecutarlo |
| Sospecha de acceso indebido | Revocar sesiones y contraseñas, revisar `audit_log` y seguir el procedimiento de brechas de seguridad del centro y del delegado de protección de datos |

## 8. Prueba realizada (2026-10-28, datos sintéticos)

La copia se probó contra una base PostgreSQL local con todas las migraciones y 1 102 visitas sintéticas, y después se restauró:

| Comprobación | Resultado |
|---|---|
| Copia cifrada y recuentos de 39 tablas | OK |
| Restauración: huellas, `pg_restore`, recuentos tabla a tabla | **OK**: 39/39 tablas; 149 políticas RLS restauradas; ninguna tabla de `public` sin RLS |
| Frase de cifrado incorrecta | Rechazada |
| Fichero alterado (un byte modificado) | Rechazado por la huella |

**Pendiente:** ejecutar el procedimiento **contra producción** (requiere la contraseña de la base de datos, solo en manos del IP) y anotar el resultado.

Corrección derivada de la prueba: el volcado incluye `CREATE SCHEMA public`, que falla en una base nueva. El script de verificación lo omite al restaurar.
