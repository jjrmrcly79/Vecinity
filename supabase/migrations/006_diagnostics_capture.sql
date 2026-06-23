-- ============================================================
-- VECINITY · Captura para diagnóstico comunitario (Presión vs. Resiliencia)
-- Solo CAPTURA de señales (el índice/tablero se construye post-deploy con datos).
-- Append-only donde la TENDENCIA importa (no reconstruible después).
-- Ref: Mejora_Vecino_Vigilante_Seshat_Local
-- ============================================================

CREATE TYPE vecino.house_condition AS ENUM ('bueno','regular','malo','abandonado','obra_negra');

-- ---- PRESIÓN: backlog / tiempo de resolución de reportes ----
ALTER TABLE vecino.incident_reports  ADD COLUMN resolved_at timestamptz;
ALTER TABLE vecino.incident_reports  ADD COLUMN resolved_by uuid REFERENCES vecino.profiles(id) ON DELETE SET NULL;
ALTER TABLE vecino.security_reports  ADD COLUMN resolved_at timestamptz;

-- ---- PRESIÓN: deterioro físico (estado actual en la casa) ----
ALTER TABLE vecino.houses ADD COLUMN estado_fisico vecino.house_condition NOT NULL DEFAULT 'bueno';
ALTER TABLE vecino.houses ADD COLUMN estado_fisico_at timestamptz;

-- ---- PRESIÓN: salud financiera (reserva actual de la colonia) ----
ALTER TABLE vecino.colonias ADD COLUMN fondo_comun numeric(12,2) NOT NULL DEFAULT 0;

-- ---- PRESIÓN: deterioro físico/áreas comunes — TENDENCIA (append-only) ----
CREATE TABLE vecino.condition_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id     uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  target         text NOT NULL CHECK (target IN ('casa','area_comun','alumbrado','areas_verdes','amenidad','zona')),
  house_id       uuid REFERENCES vecino.houses(id) ON DELETE CASCADE,
  common_area_id uuid REFERENCES vecino.common_areas(id) ON DELETE CASCADE,
  zone_id        uuid REFERENCES vecino.zones(id) ON DELETE SET NULL,
  estado         vecino.house_condition NOT NULL,
  nota           text,
  registrado_por uuid REFERENCES vecino.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---- RESILIENCIA: participación (asambleas) — TENDENCIA ----
CREATE TABLE vecino.assemblies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id  uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  titulo      text NOT NULL,
  descripcion text,
  fecha       date NOT NULL DEFAULT current_date,
  tipo        text NOT NULL DEFAULT 'ordinaria',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE vecino.assembly_attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id  uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  assembly_id uuid NOT NULL REFERENCES vecino.assemblies(id) ON DELETE CASCADE,
  house_id    uuid NOT NULL REFERENCES vecino.houses(id) ON DELETE CASCADE,
  presente    boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assembly_id, house_id)
);

-- ---- RESILIENCIA: salud financiera — TENDENCIA (snapshot mensual) ----
CREATE TABLE vecino.fund_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id  uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  fecha       date NOT NULL DEFAULT current_date,
  fondo       numeric(12,2) NOT NULL DEFAULT 0,
  ingresos    numeric(12,2) NOT NULL DEFAULT 0,
  egresos     numeric(12,2) NOT NULL DEFAULT 0,
  nota        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---- PRESIÓN: rotación (renta↔propia) — TENDENCIA automática por trigger ----
CREATE TABLE vecino.house_tenancy_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id     uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  house_id       uuid NOT NULL REFERENCES vecino.houses(id) ON DELETE CASCADE,
  esta_rentada   boolean,
  tipo_residente vecino.tipo_residente,
  changed_at     timestamptz NOT NULL DEFAULT now()
);

-- trigger: registrar cambios de tenencia (rotación) automáticamente
CREATE OR REPLACE FUNCTION vecino.log_tenancy_change()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  INSERT INTO vecino.house_tenancy_log (colonia_id, house_id, esta_rentada, tipo_residente)
  VALUES (NEW.colonia_id, NEW.id, NEW.esta_rentada, NEW.tipo_residente);
  RETURN NEW;
END $fn$;
CREATE TRIGGER trg_house_tenancy AFTER UPDATE ON vecino.houses
  FOR EACH ROW
  WHEN (OLD.esta_rentada IS DISTINCT FROM NEW.esta_rentada
        OR OLD.tipo_residente IS DISTINCT FROM NEW.tipo_residente)
  EXECUTE FUNCTION vecino.log_tenancy_change();

-- trigger: un condition_log de casa actualiza el estado_fisico denormalizado
CREATE OR REPLACE FUNCTION vecino.apply_condition_to_house()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.house_id IS NOT NULL THEN
    UPDATE vecino.houses
      SET estado_fisico = NEW.estado, estado_fisico_at = NEW.created_at
      WHERE id = NEW.house_id;
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER trg_condition_apply AFTER INSERT ON vecino.condition_logs
  FOR EACH ROW EXECUTE FUNCTION vecino.apply_condition_to_house();

-- ============================================================
-- RLS (colonia-scoped) para las tablas nuevas
-- ============================================================
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'condition_logs','assemblies','assembly_attendance','fund_snapshots','house_tenancy_log'
  ] LOOP
    EXECUTE format('ALTER TABLE vecino.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$CREATE POLICY %1$s_read ON vecino.%1$I FOR SELECT
                      USING (colonia_id = vecino.my_colonia_id());$p$, t);
    EXECUTE format($p$CREATE POLICY %1$s_admin ON vecino.%1$I FOR ALL
                      USING (colonia_id = vecino.my_colonia_id() AND vecino.is_admin())
                      WITH CHECK (colonia_id = vecino.my_colonia_id() AND vecino.is_admin());$p$, t);
  END LOOP;
END $rls$;

CREATE INDEX idx_cond_colonia   ON vecino.condition_logs(colonia_id, created_at);
CREATE INDEX idx_cond_house     ON vecino.condition_logs(house_id);
CREATE INDEX idx_asm_colonia    ON vecino.assemblies(colonia_id, fecha);
CREATE INDEX idx_att_assembly   ON vecino.assembly_attendance(assembly_id);
CREATE INDEX idx_fund_colonia   ON vecino.fund_snapshots(colonia_id, fecha);
CREATE INDEX idx_inc_resolved   ON vecino.incident_reports(colonia_id, resolved_at);

GRANT ALL ON ALL TABLES IN SCHEMA vecino TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA vecino TO anon, authenticated, service_role;
