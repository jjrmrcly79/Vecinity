# 🚀 Deploy de Vecinity en EasyPanel — Guía para Daniel

> **Para:** Daniel (CTO, acceso a EasyPanel/VPS)
> **De parte de:** Juan
> **Qué es:** Vecinity = app de administración de fraccionamiento + vigilancia vecinal (Villa Catania).
> Next.js 16 (SSR, standalone) + Supabase self-hosted (schema `vecino`) + Telegram (bot Caty) + n8n.
> **Estado:** todo el código y la BD están listos y probados. Solo falta crear la app en EasyPanel.

---

## ✅ Lo que ya está hecho (no tienes que tocar)
- **Código** en GitHub: `https://github.com/jjrmrcly79/Vecinity` (rama `main`).
- **Build de producción verificado** (`npm run build` limpio) + `Dockerfile` multi-stage standalone.
- **BD**: schema `vecino` creado, con RLS, **datos reales migrados** (119 casas, 285 vehículos, 2,427 transacciones, etc.) y expuesto en PostgREST. **No requiere nada de BD.**
- **Telegram**: bot `@Caty_VCatania_bot`, webhook ya apuntando a n8n (`…/webhook/vecino-telegram`).
- **n8n**: workflows activos `Vecinity - Telegram (Caty)` y `Vecinity - Cobros vencidos (diario)`.

👉 **Tu única tarea: crear la app web en EasyPanel.** El resto es independiente y ya corre.

---

## 1. Crear la App en EasyPanel
1. Proyecto Nexia → **+ Create** → **App**.
2. Nombre sugerido: `vecinity`.
3. **Source:** GitHub → repo `jjrmrcly79/Vecinity` → rama `main`.
   - Si EasyPanel no ve el repo (es privado), conecta la cuenta de GitHub o usa Deploy Key.
4. **Build:** método **Dockerfile** (el `Dockerfile` está en la raíz del repo).
5. **Puerto interno (container port):** `3000`.

## 2. Variables de entorno — ⚠️ OJO: doble lugar

Las `NEXT_PUBLIC_*` se **inlinean en tiempo de build** → hay que ponerlas **como Build Args Y como Environment**. Las secretas van **solo** en Environment.

### A) Build Args **y** Environment (públicas, copiar tal cual)
```
NEXT_PUBLIC_SUPABASE_URL=https://supabase.nexiasoluciones.com.mx
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE3NDE3Mzc2MDAsICJleHAiOiAxOTAwMDAwMDAwfQ.HO6RpFisxtA-AUyfCUruNgqPVcxNwj0ydGxTkRiqxq8
NEXT_PUBLIC_TELEGRAM_BOT=Caty_VCatania_bot
NEXT_PUBLIC_APP_URL=https://vecinity.nexiasoluciones.com.mx
```

### B) Solo Environment (SECRETAS — Juan te las pasa por canal seguro)
```
SUPABASE_SERVICE_ROLE_KEY=<la SERVICE_ROLE_KEY estándar del Supabase Nexia>
TELEGRAM_BOT_TOKEN=<token del bot @Caty_VCatania_bot — te lo pasa Juan>
```
> `SUPABASE_SERVICE_ROLE_KEY` es la misma de siempre del Supabase self-hosted (la que ya usas en los otros proyectos).
> `TELEGRAM_BOT_TOKEN` es específico de este bot; Juan lo tiene en su `.env.local`.

> 🔴 **El error #1 de deploy:** olvidar las `NEXT_PUBLIC_*` en **Build Args**. Si solo las pones en Environment,
> el bundle del cliente sale con valores vacíos y el login/onboarding **no conecta**. Tienen que estar en **ambos**.

## 3. Dominio
- **Domains** en la app → agregar `vecinity.nexiasoluciones.com.mx` (EasyPanel emite el TLS por Traefik).
- En **Namecheap**, si falta: A-record `vecinity` → `72.62.128.108`.

## 4. Deploy
- **Deploy / Build**. La primera build tarda un par de minutos (multi-stage).
- Si truena, mándale a Juan el **log de build** completo.

---

## 5. Verificación post-deploy
1. Abre `https://vecinity.nexiasoluciones.com.mx` → debe cargar el **onboarding** (logo Vecinity, "Powered by NexIA" morado).
2. Onboarding con código de invitación **`CAT-128`** → pide nombre/correo/contraseña.
3. Login de comité: **`comite@cantera.test`** / **`Comite2026`** → dashboard con datos reales (casa 128, saldo, panel de aprobaciones).
4. (Opcional) En el dashboard, botón **🆘 SOS** → si el comité conectó su Telegram, llega la alerta.

---

## Notas técnicas (contexto Nexia)
- **No usa API Routes para POST** (usa Server Actions) → compatible con el bloqueo de Traefik a `/api/`.
- `output: 'standalone'` + Dockerfile de 3 stages (deps → build → runner, `node:22-alpine`, usuario no-root, puerto 3000).
- **Rollback:** si algo sale mal, EasyPanel permite volver al deploy anterior; como es el primero, basta con detener la app.
- **Sin migraciones que correr:** la BD ya está poblada; el deploy es solo la capa web.

---

*Cualquier duda durante el deploy, Juan está en línea con el asistente para resolver logs al instante.*
