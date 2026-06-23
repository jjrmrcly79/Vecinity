# Diagnóstico Comunitario — Presión vs. Resiliencia (norte de producto)

> Marco conceptual: evolucionar Vecinity de un sistema que **registra y controla** a uno que
> **diagnostica la salud de la comunidad** y permite actuar antes de la decadencia.
> Inspirado en Seshat / cliodinámica (Turchin), adaptado a micro-escala. Mismo pensamiento
> de sistemas del diagnóstico Lean: un sistema colapsa cuando la presión supera su capacidad
> de amortiguar variabilidad (aquí, social).
> Fuente: `~/Downloads/Mejora_Vecino_Vigilante_Seshat_Local.md.pdf` (2026-06-22).

## Decisión de timing (2026-06-22)
- **Captura de señales** → instrumentada AHORA (BD limpia, antes del deploy). Migración `006`.
- **Índice/tablero de salud** → DIFERIDO a post-deploy + ~2-3 meses de uso real (necesita
  tendencia; al t=0 sería plano/engañoso). El valor está en la TENDENCIA, no en el dato aislado.
- Ventaja: la migración trajo historial con fechas (2,427 transacciones, 218 multas, 150 pagos)
  → la cara de **presión** arranca con trayectoria; **resiliencia** se llena desde el deploy.

## Indicadores y dónde se capturan (estado tras migración 006)

### PRESIÓN (lo que erosiona)
| Indicador | Captura |
|---|---|
| Seguridad por zona + tendencia | `alerts`, `sos_events`, `incident_reports` (zone_id + fechas) |
| Morosidad y evolución | `payments`, `houses.saldo`, `transactions` (con historial) |
| Backlog / tiempo de resolución | `incident_reports.resolved_at/resolved_by`, `security_reports.resolved_at` 🆕 |
| Deterioro físico (casas) | `houses.estado_fisico` + `condition_logs` (tendencia) 🆕 |
| Degradación áreas comunes/alumbrado | `condition_logs` (target=area_comun/alumbrado/areas_verdes) 🆕 |
| Rotación (renta↔propia) | `house_tenancy_log` (trigger automático) 🆕 |

### RESILIENCIA (lo que sostiene)
| Indicador | Captura |
|---|---|
| Participación (asambleas) | `assemblies` + `assembly_attendance` 🆕 |
| Participación (votación) | `votes` / `proposals` |
| Capacidad de respuesta | `resolved_at` en reportes (calcula tiempo) 🆕 |
| Cohesión social | `recognitions`, `neighbor_services` |
| Salud financiera (reservas) | `colonias.fondo_comun` + `fund_snapshots` (tendencia) 🆕 |
| Liderazgo / relevo comité | `committee_members` (periodos) |

## Índice compuesto (a construir post-deploy)
`Salud = f(Resiliencia) − f(Presión)` → semáforo **Verde / Amarillo / Rojo**.
Clave: detectar el **amarillo** (presión subiendo más rápido que resiliencia) ANTES del rojo.
Cada señal en amarillo/rojo dispara un **protocolo de acción** (sección 5 del documento fuente).

## Cautelas (NO opcionales)
- **Privacidad (LFPDPPP)**: minimización, consentimiento, tableros con datos **agregados/anonimizados**;
  datos personales solo donde haya base legal. Indicador de zona ≠ datos de persona.
- **Sesgo del vigilante**: variables objetivas y verificables; auditar que los datos reflejen realidad, no prejuicio.
- **Medir ≠ mejorar**: el éxito se mide por las **acciones disparadas**, no por datos capturados.
