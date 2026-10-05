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

## 2. Aplicar las migraciones

Opción A — **SQL Editor** (sin instalar nada):
1. Supabase → **SQL Editor → New query**.
2. Copia el contenido completo de cada fichero de `supabase/migrations/`, **en orden** (100000 → 100400), pulsa **Run** y espera "Success" antes de pasar al siguiente.
3. Si alguno falla, **para** y comunica el mensaje de error: no intentes corregirlo a mano.

Opción B — **Supabase CLI**: `supabase link --project-ref <ref-del-proyecto-DERMAPEX>` y `supabase db push`.

Opción C — pedírselo a Claude en la sesión: puede aplicarlas con el conector de Supabase **tras tu confirmación explícita** del proyecto destino.

## 3. Crear usuarios

Supabase → **Authentication → Users → Add user → Send invitation** con el email de cada profesional. Cada persona recibe un correo, pulsa el enlace y **crea su propia contraseña** en la pantalla «Crea tu contraseña» de la aplicación (nadie más la conoce). Si alguien la olvida, usa «¿Has olvidado tu contraseña?» en la página de acceso.

Al crearse el usuario se genera su perfil automáticamente con rol `investigator` y **sin centro** (no ve nada hasta el paso 4).

## 4. Dar de alta centros, coordinación y pertenencias

En **SQL Editor**, adapta y ejecuta (sustituye los valores entre `<>`; no uses datos de pacientes):

```sql
-- 4.1 Centros participantes (código: mayúsculas/números, 2-20 caracteres)
insert into public.centers (code, name) values
  ('<COD1>', '<Nombre del centro 1>'),
  ('<COD2>', '<Nombre del centro 2>');

-- 4.2 Coordinación del estudio (acceso a todos los centros)
update public.profiles set role = 'coordinator'
 where id = (select id from auth.users where email = '<email-coordinacion>');

-- 4.3 Investigadores de centro
insert into public.center_memberships (profile_id, center_id)
select u.id, c.id
  from auth.users u, public.centers c
 where u.email = '<email-investigador>' and c.code = '<COD1>';

-- 4.4 Comprobación
select u.email, p.role, p.is_active, c.code
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.center_memberships m on m.profile_id = p.id
  left join public.centers c on c.id = m.center_id
 order by u.email;
```

Para retirar el acceso a una persona sin perder la trazabilidad: `update public.profiles set is_active = false where id = ...;`

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
