# DERMAPEX · Puesta en marcha de la base de datos (Supabase)

Guía para aplicar el esquema del núcleo al proyecto Supabase **de DERMAPEX** y dar de alta los primeros centros y usuarios.

> ⚠️ Antes de empezar, comprueba en Supabase (arriba a la izquierda) que estás en el **proyecto DERMAPEX** y **no** en el de IRIS. Estos pasos crean tablas y políticas: en el proyecto equivocado causarían daños.

## 0. Qué incluye el esquema

| Migración | Contenido |
|---|---|
| `20261005100000_dermapex_foundation.sql` | Centros, perfiles (alta automática al crear usuario), pertenencias a centros, registro de auditoría. |
| `20261005100100_dermapex_clinical_core.sql` | Pacientes seudonimizados, consentimientos, visitas, puntuación CMO (vacía), intervenciones, cuestionarios, proceso por visita, documentos. |
| `20261005100200_dermapex_medication_module.sql` | Medicación longitudinal y catálogo normalizado CIMA. |
| `20261005100300_dermapex_rls.sql` | Seguridad por centro (RLS) y privilegios. |
| `20261005100400_dermapex_storage.sql` | Bucket privado `visit-documents` y sus permisos. |

No incluye variables clínicas de dermatitis atópica, catálogo de intervenciones ni cuestionarios configurados: dependen del protocolo.

Validación previa: `scripts/test-db.sh` aplica todo en un PostgreSQL local y ejecuta más de 60 comprobaciones de seguridad e integridad; también se ejecuta en cada PR (CI → job `database`).

## 1. Ajustes de autenticación (recomendado antes de aplicar)

En Supabase → **Authentication**:

1. **Sign In / Providers → Email → desactivar "Allow new users to sign up"**. Los usuarios se crearán solo desde el panel. Aunque alguien se registrara, no vería datos: un usuario nuevo no tiene centro asignado.
2. **URL Configuration**:
   - **Site URL**: `https://ramonmorillo.github.io/dermapex/`
   - **Redirect URLs → Add URL**: `https://ramonmorillo.github.io/dermapex/`
   Sin esto, los enlaces de invitación y de recuperación de contraseña apuntan a `localhost` y no funcionan.

## 1 bis. Plantillas de correo (solo con SMTP propio o plan Pro)

> **No aplicable en el plan gratuito actual**: Supabase no permite editar plantillas sin SMTP propio. Mientras tanto se usa el procedimiento del paso 3 (contraseña temporal + cambio obligatorio). Lo siguiente queda preparado para cuando se configure SMTP.

Los filtros antiphishing del correo corporativo (p. ej. `@juntadeandalucia.es`) abren automáticamente los enlaces de los correos y **consumen el enlace de un solo uso** antes que el destinatario (error «Email link is invalid or has expired»). Por eso los correos deben llevar a una página de DERMAPEX con un botón «Continuar», y el token solo se canjea al pulsarlo.

Supabase → **Authentication → Emails → Templates**:

- **Invite user** → sustituir el enlace por:
  ```html
  <h2>Invitación a DERMAPEX</h2>
  <p>Has sido invitado/a al estudio DERMAPEX.</p>
  <p><a href="{{ .SiteURL }}#/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Aceptar invitación y crear contraseña</a></p>
  ```
- **Reset password** → sustituir el enlace por:
  ```html
  <h2>DERMAPEX · Recuperar contraseña</h2>
  <p><a href="{{ .SiteURL }}#/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Establecer una nueva contraseña</a></p>
  ```

`{{ .SiteURL }}` debe ser `https://ramonmorillo.github.io/dermapex/` (paso 1).

## 2. Aplicar las migraciones

Opción A — **SQL Editor** (sin instalar nada):
1. Supabase → **SQL Editor → New query**.
2. Copia el contenido completo de cada fichero de `supabase/migrations/`, **en orden** por nombre de fichero (de `20261005100000_…` a `20261006100300_…`), pulsa **Run** y espera "Success" antes de pasar al siguiente.
3. Si alguno falla, **para** y comunica el mensaje de error: no intentes corregirlo a mano.

Opción B — **Supabase CLI**: `supabase link --project-ref <ref-del-proyecto-DERMAPEX>` y `supabase db push`.

Opción C — pedírselo a Claude en la sesión: puede aplicarlas con el conector de Supabase **tras tu confirmación explícita** del proyecto destino.

## 3. Crear usuarios (contraseña temporal + cambio obligatorio)

En el plan gratuito de Supabase **no se pueden editar las plantillas de correo** (requiere SMTP propio) y el filtro antiphishing del correo corporativo consume los enlaces de un solo uso de las invitaciones. Por eso las cuentas se crean así:

1. Supabase → **Authentication → Users → Add user → Create new user**.
2. Email del profesional y una **contraseña temporal distinta para cada persona** (mínimo 12 caracteres, no reutilizable; p. ej. generada con un gestor de contraseñas). Marcar **Auto Confirm User**.
3. Comunicar la contraseña temporal **por un canal distinto del correo** (teléfono).
4. En el primer acceso la aplicación **obliga a sustituirla** por una personal (pantalla «Cambia tu contraseña temporal»); no se puede usar nada más hasta hacerlo.

Al crearse el usuario se genera su perfil con rol `investigator`, **sin centro** y con `must_change_password = true`.

**Desde la migración `20261007130000` (proyecto compartido con COAMO) hace falta un paso más: autorizar la cuenta en DERMAPEX.** El proyecto Supabase lo comparten DERMAPEX y COAMO con un único Auth: crear la cuenta solo da identidad, no acceso. Sin este paso la persona inicia sesión pero ve el aviso «Cuenta sin acceso a DERMAPEX» y la base de datos no le devuelve nada:

```sql
select app_private.set_app_access('<email>', 'dermapex');
```

Para COAMO se usará el mismo comando con `'coag'`. Una misma cuenta puede tener ambos accesos (caso de la coordinación de los dos estudios); los roles son independientes en cada aplicación. **No asignes `'dermapex'` a cuentas de COAMO.**

Si alguien olvida su contraseña: coordinación le asigna otra temporal desde el panel y ejecuta
`update public.profiles set must_change_password = true where id = (select id from auth.users where email = '<email>');`

## 4. Dar de alta centros, coordinación y pertenencias

En **SQL Editor**, adapta y ejecuta (sustituye los valores entre `<>`; no uses datos de pacientes):

```sql
-- 4.1 Centros participantes (código: mayúsculas/números, 2-20 caracteres).
-- study_arm (cohorte, OBLIGATORIA): 'cmo' = AF CMO-MAPEX · 'standard' = AF estándar (comparador).
-- No se puede cambiar una vez que el centro tenga pacientes.
-- study_number (1-99, único): número del centro en el código de estudio DPX-<n>-NNNN. Sin él no se
-- incluyen pacientes; tampoco se puede cambiar cuando el centro ya tenga pacientes.
insert into public.centers (code, name, study_arm, study_number) values
  ('<COD1>', '<Nombre del centro 1>', '<cmo|standard>', <n1>),
  ('<COD2>', '<Nombre del centro 2>', '<cmo|standard>', <n2>);

-- 4.1 bis Centros creados ANTES de la migración 20261006100000: asignarles la cohorte.
-- update public.centers set study_arm = '<cmo|standard>', study_number = <n> where code = '<COD>';

-- 4.2 Coordinación del estudio (acceso a todos los centros)
update public.profiles set role = 'coordinator'
 where id = (select id from auth.users where email = '<email-coordinacion>');

-- 4.3 Investigadores de centro
insert into public.center_memberships (profile_id, center_id)
select u.id, c.id
  from auth.users u, public.centers c
 where u.email = '<email-investigador>' and c.code = '<COD1>';

-- 4.4 Comprobación
select u.email, a.is_active as acceso_dermapex, p.role, p.is_active, c.code, c.study_arm, c.study_number
  from public.profiles p
  join auth.users u on u.id = p.id
  left join app_private.app_access a on a.user_id = p.id and a.app_code = 'dermapex'
  left join public.center_memberships m on m.profile_id = p.id
  left join public.centers c on c.id = m.center_id
 order by u.email;
```

Para retirar el acceso a DERMAPEX sin perder la trazabilidad (no borres la cuenta de Auth: es común a ambos estudios):
`select app_private.set_app_access('<email>', 'dermapex', false);`
Para desactivar solo el perfil DERMAPEX: `update public.profiles set is_active = false where id = ...;`

Las altas y bajas de acceso quedan en `app_private.admin_log` (registro administrativo privado, solo SQL Editor).

## 5. Búsqueda de medicamentos CIMA (Edge Function)

La búsqueda en CIMA usa la función `supabase/functions/search-cima-medications`. Despliégala con la CLI: `supabase functions deploy search-cima-medications --project-ref <ref>`. Sin ella, la medicación funciona con alta manual, pero no busca en CIMA.

## 6. Comprobación final

1. Entra en `https://ramonmorillo.github.io/dermapex/` con un usuario investigador: debe ver el panel y poder dar de alta un paciente **solo en su centro**.
2. Con otro investigador de otro centro: no debe ver ese paciente.
3. Con coordinación: ve ambos y puede consultar la auditoría (`select * from audit_log order by at desc limit 20;` en el SQL Editor).

## Limitaciones conocidas en este punto

- **Cuestionarios**: no se pueden guardar hasta configurar la batería DERMAPEX en `questionnaire_measurement_map` (decisión deliberada: no se asume que los instrumentos de IRIS formen parte del protocolo).
- **Estratificación CMO**: no hay motor; las pantallas de nivel CMO quedarán vacías.
- **Gestión de centros/usuarios**: por SQL; aún no hay pantalla.
