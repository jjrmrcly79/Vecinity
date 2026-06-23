-- ============================================================
-- VECINITY · Módulos B (Finanzas) · C (Multas) · D (Vehículos/Visitantes+OCR) · K (Acceso RFID)
-- ============================================================

-- ---------- ENUMS ----------
CREATE TYPE vecino.transaction_type   AS ENUM ('cargo','abono','ajuste');
CREATE TYPE vecino.approval_state     AS ENUM ('pendiente','aprobado','rechazado');
CREATE TYPE vecino.payment_state      AS ENUM ('pendiente','pagado','atrasado','en_verificacion');
CREATE TYPE vecino.incident_status    AS ENUM ('pendiente','rechazado','multa');
CREATE TYPE vecino.vehicle_status     AS ENUM ('pendiente','aprobado','rechazado');
CREATE TYPE vecino.visit_status       AS ENUM ('esperando','adentro','completada');
CREATE TYPE vecino.tag_type           AS ENUM ('persona','vehiculo');
CREATE TYPE vecino.tag_status         AS ENUM ('activo','suspendido','vencido');
CREATE TYPE vecino.access_dir         AS ENUM ('entra','sale');
CREATE TYPE vecino.access_result      AS ENUM ('permitido','denegado');
CREATE TYPE vecino.suspension_status  AS ENUM ('pendiente','aprobada','ejecutada','levantada');

-- ============================================================
-- MÓDULO B — FINANZAS
-- ============================================================
CREATE TABLE vecino.transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  house_id      uuid NOT NULL REFERENCES vecino.houses(id) ON DELETE CASCADE,
  tipo          vecino.transaction_type NOT NULL,
  monto         numeric(10,2) NOT NULL,
  concepto      text NOT NULL,
  comprobante_url text,
  estado        vecino.approval_state NOT NULL DEFAULT 'aprobado',
  recibo_pdf_url text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vecino.payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id      uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  house_id        uuid NOT NULL REFERENCES vecino.houses(id) ON DELETE CASCADE,
  concepto        text NOT NULL DEFAULT 'Mantenimiento Mensual',
  monto           numeric(10,2) NOT NULL,
  fecha_generacion date NOT NULL DEFAULT current_date,
  fecha_vencimiento date NOT NULL,
  estado          vecino.payment_state NOT NULL DEFAULT 'pendiente',
  comprobante_url text,
  folio           int,
  recibo_pdf_url  text,
  es_deuda_anterior boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (colonia_id, folio)
);

CREATE TABLE vecino.improvement_projects (   -- adelantada (FK desde expenses)
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id   uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  proposal_id  uuid,
  titulo       text NOT NULL,
  descripcion  text,
  presupuesto  numeric(12,2) NOT NULL DEFAULT 0,
  estado       text NOT NULL DEFAULT 'planeado' CHECK (estado IN ('planeado','en_curso','terminado','cancelado')),
  responsable_id uuid REFERENCES vecino.profiles(id) ON DELETE SET NULL,
  fecha_inicio date,
  fecha_fin    date,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vecino.colonia_expenses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  concepto      text NOT NULL,
  monto         numeric(12,2) NOT NULL,
  fecha_pago    date NOT NULL DEFAULT current_date,
  categoria     text NOT NULL,
  archivo_principal_url text,
  archivo_secundario_url text,
  descripcion   text,
  registrado_por uuid REFERENCES vecino.profiles(id) ON DELETE SET NULL,
  improvement_id uuid REFERENCES vecino.improvement_projects(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vecino.folio_counters (
  colonia_id    uuid PRIMARY KEY REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  ultimo_folio  int NOT NULL DEFAULT 1999
);

-- ============================================================
-- MÓDULO C — MULTAS / INCIDENCIAS
-- ============================================================
CREATE TABLE vecino.fine_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id  uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  monto_base  numeric(10,2) NOT NULL DEFAULT 200
);

CREATE TABLE vecino.incident_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id      uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  reportante_house_id uuid REFERENCES vecino.houses(id) ON DELETE SET NULL,
  infractor_house_id  uuid NOT NULL REFERENCES vecino.houses(id) ON DELETE CASCADE,
  categoria_id    uuid REFERENCES vecino.fine_categories(id) ON DELETE SET NULL,
  descripcion     text,
  evidencia_url   text,
  estado          vecino.incident_status NOT NULL DEFAULT 'pendiente',
  resolucion_admin text,
  monto_multa     numeric(10,2) NOT NULL DEFAULT 0,
  transaction_id  uuid REFERENCES vecino.transactions(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vecino.report_evidence (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid NOT NULL REFERENCES vecino.incident_reports(id) ON DELETE CASCADE,
  archivo_url text NOT NULL,
  subido_por_house_id uuid REFERENCES vecino.houses(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- MÓDULO D — VEHÍCULOS / VISITANTES (+ OCR placas)
-- ============================================================
CREATE TABLE vecino.vehicle_brands (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text UNIQUE NOT NULL
);
CREATE TABLE vecino.vehicle_models (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id  uuid NOT NULL REFERENCES vecino.vehicle_brands(id) ON DELETE CASCADE,
  nombre    text NOT NULL
);

CREATE TABLE vecino.vehicles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  house_id      uuid NOT NULL REFERENCES vecino.houses(id) ON DELETE CASCADE,
  brand_id      uuid REFERENCES vecino.vehicle_brands(id) ON DELETE SET NULL,
  model_id      uuid REFERENCES vecino.vehicle_models(id) ON DELETE SET NULL,
  placa         text NOT NULL,
  color         text,
  tarjeta_rfid  text,
  estado        vecino.vehicle_status NOT NULL DEFAULT 'pendiente',
  plate_ocr_confidence numeric(5,2),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (colonia_id, placa)
);

CREATE TABLE vecino.visitors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  house_id      uuid NOT NULL REFERENCES vecino.houses(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  token_acceso  text UNIQUE,
  foto_identificacion_url text,
  foto_placas_url text,
  plate_detected text,                       -- resultado OCR (Tesseract)
  fecha_programada timestamptz,
  estado        vecino.visit_status NOT NULL DEFAULT 'esperando',
  guardia_entrada_id uuid REFERENCES vecino.profiles(id) ON DELETE SET NULL,
  fecha_hora_entrada timestamptz,
  guardia_salida_id  uuid REFERENCES vecino.profiles(id) ON DELETE SET NULL,
  fecha_hora_salida  timestamptz,
  origen_registro text NOT NULL DEFAULT 'vecino' CHECK (origen_registro IN ('vecino','vigilante')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- MÓDULO K — CONTROL DE ACCESO RFID (gobernado)
-- ============================================================
CREATE TABLE vecino.rfid_tags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  house_id      uuid REFERENCES vecino.houses(id) ON DELETE CASCADE,
  profile_id    uuid REFERENCES vecino.profiles(id) ON DELETE SET NULL,
  vehicle_id    uuid REFERENCES vecino.vehicles(id) ON DELETE SET NULL,
  codigo_tag    text NOT NULL,
  tipo          vecino.tag_type NOT NULL DEFAULT 'persona',
  status        vecino.tag_status NOT NULL DEFAULT 'activo',
  motivo        text,
  suspended_at  timestamptz,
  reactivated_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (colonia_id, codigo_tag)
);

CREATE TABLE vecino.access_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  tag_id        uuid REFERENCES vecino.rfid_tags(id) ON DELETE SET NULL,
  lector        text,
  sentido       vecino.access_dir,
  resultado     vecino.access_result NOT NULL,
  motivo_denegado text,
  ts            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vecino.access_suspensions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  house_id      uuid NOT NULL REFERENCES vecino.houses(id) ON DELETE CASCADE,
  tag_id        uuid REFERENCES vecino.rfid_tags(id) ON DELETE SET NULL,
  motivo        text NOT NULL DEFAULT 'adeudo',
  saldo_al_momento numeric(10,2),
  approved_by   uuid REFERENCES vecino.profiles(id) ON DELETE SET NULL,
  proposal_id   uuid,
  status        vecino.suspension_status NOT NULL DEFAULT 'pendiente',
  created_at    timestamptz NOT NULL DEFAULT now(),
  executed_at   timestamptz,
  lifted_at     timestamptz
);

-- ============================================================
-- RLS (colonia-scoped: lectura misma colonia, escritura admin/comité)
-- vehicle_brands / vehicle_models = catálogo global (lectura para todos)
-- ============================================================
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transactions','payments','improvement_projects','colonia_expenses','folio_counters',
    'fine_categories','incident_reports',
    'vehicles','visitors','rfid_tags','access_events','access_suspensions'
  ] LOOP
    EXECUTE format('ALTER TABLE vecino.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$CREATE POLICY %1$s_read ON vecino.%1$I FOR SELECT
                      USING (colonia_id = vecino.my_colonia_id());$p$, t);
    EXECUTE format($p$CREATE POLICY %1$s_admin ON vecino.%1$I FOR ALL
                      USING (colonia_id = vecino.my_colonia_id() AND vecino.is_admin())
                      WITH CHECK (colonia_id = vecino.my_colonia_id() AND vecino.is_admin());$p$, t);
  END LOOP;

  -- report_evidence no tiene colonia_id directo → política por join
  EXECUTE 'ALTER TABLE vecino.report_evidence ENABLE ROW LEVEL SECURITY';
  EXECUTE $p$CREATE POLICY report_evidence_read ON vecino.report_evidence FOR SELECT
            USING (EXISTS (SELECT 1 FROM vecino.incident_reports r
                           WHERE r.id = report_id AND r.colonia_id = vecino.my_colonia_id()));$p$;
  EXECUTE $p$CREATE POLICY report_evidence_write ON vecino.report_evidence FOR ALL
            USING (EXISTS (SELECT 1 FROM vecino.incident_reports r
                           WHERE r.id = report_id AND r.colonia_id = vecino.my_colonia_id()))
            WITH CHECK (EXISTS (SELECT 1 FROM vecino.incident_reports r
                           WHERE r.id = report_id AND r.colonia_id = vecino.my_colonia_id()));$p$;
END $rls$;

-- catálogo global de vehículos
ALTER TABLE vecino.vehicle_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE vecino.vehicle_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY brands_read ON vecino.vehicle_brands FOR SELECT USING (true);
CREATE POLICY models_read ON vecino.vehicle_models FOR SELECT USING (true);

-- ÍNDICES
CREATE INDEX idx_tx_house        ON vecino.transactions(house_id);
CREATE INDEX idx_tx_colonia      ON vecino.transactions(colonia_id);
CREATE INDEX idx_pay_house       ON vecino.payments(house_id);
CREATE INDEX idx_pay_venc        ON vecino.payments(fecha_vencimiento);
CREATE INDEX idx_exp_colonia     ON vecino.colonia_expenses(colonia_id);
CREATE INDEX idx_inc_infractor   ON vecino.incident_reports(infractor_house_id);
CREATE INDEX idx_veh_house       ON vecino.vehicles(house_id);
CREATE INDEX idx_veh_placa       ON vecino.vehicles(colonia_id, placa);
CREATE INDEX idx_vis_house       ON vecino.visitors(house_id);
CREATE INDEX idx_rfid_house      ON vecino.rfid_tags(house_id);
CREATE INDEX idx_rfid_status     ON vecino.rfid_tags(colonia_id, status);
CREATE INDEX idx_access_tag      ON vecino.access_events(tag_id);

-- GRANTS (refuerzo)
GRANT ALL ON ALL TABLES IN SCHEMA vecino TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA vecino TO anon, authenticated, service_role;
