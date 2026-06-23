-- ============================================================
-- VECINITY · Módulo A — Núcleo multi-colonia
-- schema: vecino · Supabase self-hosted Nexia
-- ============================================================

-- ---------- ENUMS ----------
CREATE TYPE vecino.user_role AS ENUM ('admin','guardia','residente','capitan','comite');
CREATE TYPE vecino.approval_status AS ENUM ('pendiente','aprobado','rechazado');
CREATE TYPE vecino.tipo_residente AS ENUM ('propietario','arrendatario');
CREATE TYPE vecino.estatus_casa AS ENUM ('al_corriente','con_adeudo','en_convenio');

-- ---------- COLONIAS (tenant raíz) ----------
CREATE TABLE vecino.colonias (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                  text NOT NULL,
  slug                    text UNIQUE NOT NULL,
  direccion               text,
  logo_url                text,
  google_maps_link        text,
  -- parámetros financieros
  cuota_mensual           numeric(10,2) NOT NULL DEFAULT 0,
  dia_limite_pago         int  NOT NULL DEFAULT 10,
  recargo                 numeric(10,2) NOT NULL DEFAULT 100,
  umbral_saldo_alerta     numeric(10,2) NOT NULL DEFAULT 0,
  -- parámetros acceso RFID
  umbral_suspension_rfid  numeric(10,2),
  rfid_requiere_aprobacion boolean NOT NULL DEFAULT true,
  -- parámetros monitoreo
  aforo_default_alberca   int,
  -- notificaciones
  telegram_bot_token      text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- ---------- ZONES (zona / calle) ----------
CREATE TABLE vecino.zones (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id           uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  nombre               text NOT NULL,
  codigo               text,
  color                text DEFAULT '#3b82f6',
  captain_id           uuid,            -- FK a profiles (se agrega luego, evita ciclo)
  member_count         int NOT NULL DEFAULT 0,
  -- monitoreo / reglas de zona
  max_occupancy        int,
  prohibited_activities text[] DEFAULT '{}',
  lat                  double precision,
  lng                  double precision,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ---------- HOUSES (casas) ----------
CREATE TABLE vecino.houses (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id           uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  zone_id              uuid REFERENCES vecino.zones(id) ON DELETE SET NULL,
  numero               text NOT NULL,
  street               text,
  propietario          text,
  tel_1                text,
  tel_2                text,
  tel_3                text,
  tipo_residente       vecino.tipo_residente NOT NULL DEFAULT 'propietario',
  esta_rentada         boolean NOT NULL DEFAULT false,
  nombre_arrendatario  text,
  num_habitantes       int NOT NULL DEFAULT 1,
  saldo                numeric(10,2) NOT NULL DEFAULT 0,
  estatus              vecino.estatus_casa NOT NULL DEFAULT 'al_corriente',
  comprobante_ine_url  text,
  comprobante_predial_url text,
  es_verificado        boolean NOT NULL DEFAULT false,
  pin_finanzas         text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (colonia_id, numero)
);

-- ---------- PROFILES (usuario = auth.users) ----------
CREATE TABLE vecino.profiles (
  id                uuid PRIMARY KEY,   -- = auth.users.id
  colonia_id        uuid REFERENCES vecino.colonias(id) ON DELETE SET NULL,
  house_id          uuid REFERENCES vecino.houses(id) ON DELETE SET NULL,
  nombre            text NOT NULL,
  email             text NOT NULL,
  role              vecino.user_role NOT NULL DEFAULT 'residente',
  telegram_chat_id  text,
  telefono          text,
  avatar            text,
  is_active         boolean NOT NULL DEFAULT true,
  approval_status   vecino.approval_status NOT NULL DEFAULT 'pendiente',
  rules_accepted_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- FK diferida zones.captain_id -> profiles
ALTER TABLE vecino.zones
  ADD CONSTRAINT zones_captain_fk FOREIGN KEY (captain_id)
  REFERENCES vecino.profiles(id) ON DELETE SET NULL;

-- ---------- INVITATIONS (onboarding sin fricción) ----------
CREATE TABLE vecino.invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id   uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  house_id     uuid REFERENCES vecino.houses(id) ON DELETE SET NULL,
  email        text,
  role         vecino.user_role NOT NULL DEFAULT 'residente',
  token        text UNIQUE NOT NULL,
  invited_by   uuid REFERENCES vecino.profiles(id) ON DELETE SET NULL,
  accepted_at  timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- FUNCIONES HELPER (SECURITY DEFINER — evitan recursión RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION vecino.my_colonia_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = vecino, auth AS $$
  SELECT colonia_id FROM vecino.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION vecino.my_role()
RETURNS vecino.user_role LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = vecino, auth AS $$
  SELECT role FROM vecino.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION vecino.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = vecino, auth AS $$
  SELECT EXISTS (SELECT 1 FROM vecino.profiles
                 WHERE id = auth.uid() AND role IN ('admin','comite'))
$$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION vecino.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON vecino.profiles
  FOR EACH ROW EXECUTE FUNCTION vecino.touch_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE vecino.colonias    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vecino.zones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vecino.houses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE vecino.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vecino.invitations ENABLE ROW LEVEL SECURITY;

-- colonias: ves la tuya
CREATE POLICY colonias_read ON vecino.colonias FOR SELECT
  USING (id = vecino.my_colonia_id());
CREATE POLICY colonias_admin ON vecino.colonias FOR ALL
  USING (id = vecino.my_colonia_id() AND vecino.is_admin())
  WITH CHECK (id = vecino.my_colonia_id() AND vecino.is_admin());

-- zones / houses: lectura misma colonia, escritura admin/comité
CREATE POLICY zones_read ON vecino.zones FOR SELECT
  USING (colonia_id = vecino.my_colonia_id());
CREATE POLICY zones_admin ON vecino.zones FOR ALL
  USING (colonia_id = vecino.my_colonia_id() AND vecino.is_admin())
  WITH CHECK (colonia_id = vecino.my_colonia_id() AND vecino.is_admin());

CREATE POLICY houses_read ON vecino.houses FOR SELECT
  USING (colonia_id = vecino.my_colonia_id());
CREATE POLICY houses_admin ON vecino.houses FOR ALL
  USING (colonia_id = vecino.my_colonia_id() AND vecino.is_admin())
  WITH CHECK (colonia_id = vecino.my_colonia_id() AND vecino.is_admin());

-- profiles: ves tu propio perfil y los de tu colonia; editas el tuyo
CREATE POLICY profiles_self_read ON vecino.profiles FOR SELECT
  USING (id = auth.uid() OR colonia_id = vecino.my_colonia_id());
CREATE POLICY profiles_self_write ON vecino.profiles FOR UPDATE
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_admin ON vecino.profiles FOR ALL
  USING (colonia_id = vecino.my_colonia_id() AND vecino.is_admin())
  WITH CHECK (colonia_id = vecino.my_colonia_id() AND vecino.is_admin());

-- invitations: admin de la colonia
CREATE POLICY invitations_admin ON vecino.invitations FOR ALL
  USING (colonia_id = vecino.my_colonia_id() AND vecino.is_admin())
  WITH CHECK (colonia_id = vecino.my_colonia_id() AND vecino.is_admin());

-- índices
CREATE INDEX idx_zones_colonia   ON vecino.zones(colonia_id);
CREATE INDEX idx_houses_colonia  ON vecino.houses(colonia_id);
CREATE INDEX idx_houses_zone     ON vecino.houses(zone_id);
CREATE INDEX idx_profiles_colonia ON vecino.profiles(colonia_id);
CREATE INDEX idx_profiles_house  ON vecino.profiles(house_id);

-- ============================================================
-- GRANTS (estándar Nexia para schema nuevo)
-- ============================================================
GRANT USAGE ON SCHEMA vecino TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA vecino TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA vecino TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA vecino GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA vecino GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
