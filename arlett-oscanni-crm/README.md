# CRM — Centro de belleza

CRM para gestión de **clientes**, **presupuestos**, **facturación** y **ajustes** (datos de empresa), con Next.js, Tailwind, shadcn/ui y **Supabase** (auth y base de datos).

## Desarrollo local

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Inicia sesión en `/login` con un usuario creado en Supabase Auth.

### Variables de entorno (local)

Crea un archivo `.env.local` en la raíz del proyecto (no se sube a Git). Cuando conectes Supabase, añade:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
```

- **URL:** en el dashboard de Supabase → Project Settings → API → Project URL.
- **Anon key:** en la misma página, en API → Project API keys → `anon` public.

---

## Despliegue en Vercel (deploy en cada push a GitHub)

### 1. Subir el proyecto a GitHub

Si aún no tienes repositorio:

```bash
git init
git add .
git commit -m "Initial commit: CRM UI"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

### 2. Conectar el repo con Vercel

1. Entra en [vercel.com](https://vercel.com) e inicia sesión (con tu cuenta de GitHub si quieres).
2. **Add New…** → **Project**.
3. **Import Git Repository**: elige el repo del CRM (si no sale, autoriza a Vercel en GitHub).
4. Vercel detecta Next.js automáticamente. Revisa:
   - **Framework Preset:** Next.js
   - **Build Command:** `npm run build` (o dejarlo por defecto)
   - **Output Directory:** por defecto (no cambiar)
   - **Install Command:** `npm install`
5. Añade las variables de entorno si usas Supabase (ver sección siguiente).
6. Pulsa **Deploy**.

### 3. Deploys automáticos en cada push

- Por defecto, cada **push a la rama principal** (p. ej. `main`) genera un nuevo deploy en Vercel.
- Las **pull requests** generan una URL de preview.
- No hace falta configurar nada más: con tener el proyecto conectado a GitHub desde Vercel, los pushes ya disparan el deploy.

### 4. Dominio y rama de producción

- En **Project Settings → Git** puedes elegir qué rama es **Production** (por defecto `main`).
- La URL de producción será `https://tu-proyecto.vercel.app` (o tu dominio propio si lo añades).

---

## Variables de entorno en Vercel

Cuando integres Supabase (auth, base de datos), configura en Vercel las mismas variables que en local:

1. En el proyecto: **Settings** → **Environment Variables**.
2. Añade cada variable:
   - **Name:** `NEXT_PUBLIC_SUPABASE_URL`  
     **Value:** `https://tu-proyecto.supabase.co`  
     (En Supabase: Project Settings → API → Project URL.)
   - **Name:** `NEXT_PUBLIC_SUPABASE_ANON_KEY`  
     **Value:** tu clave pública `anon`  
     (En Supabase: Project Settings → API → Project API keys → `anon` public.)
3. Marca los entornos donde aplican: **Production**, **Preview** (y **Development** si usas Vercel para dev).
4. Guarda. Los próximos deploys usarán estas variables.

Otras variables que puedas necesitar más adelante (por ejemplo para server-side):

- No uses el prefijo `NEXT_PUBLIC_` salvo que deban estar disponibles en el navegador.
- Las variables sin `NEXT_PUBLIC_` solo existen en el servidor (API routes, Server Components, middleware).

---

## Base de datos (Supabase)

La primera vez que uses el proyecto, aplica las migraciones en orden sobre una base vacía:

1. En el dashboard de Supabase: **SQL Editor** → **New query**.
2. Ejecuta cada archivo de `supabase/migrations/` **por orden de nombre** (fecha prefijada), o usa la CLI de Supabase si la tienes configurada.

### Control de migraciones (importante)

- `20250101000000_initial_schema.sql` es la **migración base** (esquema principal).
- El resto son incrementales (IVA/IRPF, RLS, clientes, direcciones, rectificativas, empresa, etc.).
- **No** re-ejecutar la base en un entorno ya creado; ejecuta solo los ficheros nuevos que falten.
- `20260428140000_drop_propiedades.sql` elimina la tabla `propiedades` si existía (proyectos antiguos con módulo inmuebles). En instalaciones nuevas no hace nada dañino.

Eso incluye:

- **profiles:** id (auth.users), email, role (`admin` | `agente`). Trigger que crea el perfil al registrarse.
- **clientes:** pertenecen a un `user_id`; agentes solo ven los suyos, admin ve todos (RLS).
- **facturas** y **factura_lineas:** mismo criterio. Trigger que recalcula total desde las líneas.
- **presupuestos** y **presupuesto_lineas:** mismo modelo que facturas.
- **pagos:** pagos contra facturas.
- **empresa_facturación:** datos de emisor en facturas (admin).
- Vistas y funciones auxiliares para métricas financieras.

Para dar rol **admin** a un usuario: en SQL Editor ejecuta por ejemplo:

```sql
update public.profiles set role = 'admin' where email = 'tu@email.com';
```

## Estructura

- **App Router:** `app/` (login, inicio, clientes, presupuestos, facturas, ajustes).
- **Componentes:** `components/layout`, `components/ui`, `components/clientes`, `components/facturas`, `components/presupuestos`.
- **Lib:** `lib/auth`, `lib/validations`, `lib/supabase` (cliente Supabase, tipos).

## Stack

- Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn-style UI, React Hook Form, Zod, **Supabase** (auth + Postgres con RLS).
