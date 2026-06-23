# Deploy de Vecinity en EasyPanel

> Next.js 16 (standalone) + Docker. El deploy lo ejecuta el Director.
> Los **valores** de las variables están en `vecinity-app/.env.local` (NO se commitean).

## 1. Subir el código a GitHub (lo corres tú)
```bash
cd ~/dev/Vecinity/vecinity-app
gh repo create nexia-vecinity --private --source=. --remote=origin --push
# o manual:  git remote add origin git@github.com:<tu-usuario>/nexia-vecinity.git && git push -u origin main
```

## 2. Crear la app en EasyPanel
- **Tipo:** App → Source: GitHub repo `nexia-vecinity` (rama `main`).
- **Build:** Dockerfile (raíz del repo). El `Dockerfile` ya está listo (multi-stage, standalone).
- **Puerto interno:** `3000`.
- **Dominio:** `vecinity.nexiasoluciones.com.mx` (Namecheap → A record al VPS si falta).

## 3. Variables — ⚠️ doble lugar
`NEXT_PUBLIC_*` se **inlinean en build** → van como **Build Args** Y como **Variables de entorno**.
Las secretas van **solo** como Variables de entorno (runtime).

### Build Args + Env (públicas)
| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | (ver `.env.local`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (ver `.env.local`) |
| `NEXT_PUBLIC_TELEGRAM_BOT` | `Caty_VCatania_bot` |
| `NEXT_PUBLIC_APP_URL` | `https://vecinity.nexiasoluciones.com.mx` |

### Solo Env (secretas — NUNCA como Build Arg ni en el cliente)
| Variable | Valor |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | (ver `.env.local`) |
| `TELEGRAM_BOT_TOKEN` | (ver `.env.local`) |

## 4. Post-deploy (checklist)
- [ ] Abrir `https://vecinity.nexiasoluciones.com.mx` → carga el onboarding.
- [ ] Probar onboarding con código **`CAT-128`** (o cualquier `CAT-<numero>`).
- [ ] Login comité **comite@cantera.test / Comite2026** → dashboard con datos reales.
- [ ] `Conectar Telegram` abre **@Caty_VCatania_bot** y engancha el chat.
- [ ] SOS desde el dashboard → llega a Telegram (si el comité conectó su chat).

## Notas
- **No requiere cambios de BD**: el schema `vecino` ya está expuesto en PostgREST y poblado.
- El **webhook de Telegram** ya apunta a n8n (`…/webhook/vecino-telegram`) — el deploy de la web no lo afecta.
- El job diario de cobros vencidos vive en n8n (`Vecinity - Cobros vencidos (diario)`), independiente del deploy.
- **Auth/billing**: hoy el acceso se controla con Supabase Auth + RLS + aprobación del comité.
  El gate `nexia_billing` (app_slug `vecino`) queda como follow-up cuando se defina el modelo de cobro a colonias.
