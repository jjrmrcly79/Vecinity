-- ============================================================
-- VECINITY · Módulos H (Operación) · I (Comunidad) · J (Notificaciones)
-- ============================================================

CREATE TYPE vecino.notif_channel AS ENUM ('telegram','email','sms','push');
CREATE TYPE vecino.notif_status  AS ENUM ('pendiente','enviado','error');

-- ============================================================
-- MÓDULO H — OPERACIÓN / VIGILANCIA
-- ============================================================
CREATE TABLE vecino.packages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  house_id      uuid NOT NULL REFERENCES vecino.houses(id) ON DELETE CASCADE,
  remitente     text NOT NULL,
  numero_guia   text,
  codigo_recogida text,
  estado        text NOT NULL DEFAULT 'en_vigilancia' CHECK (estado IN ('en_vigilancia','entregado','esperando_llegada')),
  registrado_por uuid REFERENCES vecino.profiles(id) ON DELETE SET NULL,
  fecha_llegada timestamptz NOT NULL DEFAULT now(),
  entregado_por uuid REFERENCES vecino.profiles(id) ON DELETE SET NULL,
  fecha_entrega timestamptz
);

CREATE TABLE vecino.common_areas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  descripcion   text,
  capacidad_personas int NOT NULL DEFAULT 1,
  cantidad_espacios  int NOT NULL DEFAULT 1,
  UNIQUE (colonia_id, nombre)
);

CREATE TABLE vecino.reservations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  area_id       uuid NOT NULL REFERENCES vecino.common_areas(id) ON DELETE CASCADE,
  house_id      uuid NOT NULL REFERENCES vecino.houses(id) ON DELETE CASCADE,
  fecha_hora_inicio timestamptz NOT NULL,
  fecha_hora_fin    timestamptz NOT NULL,
  estado        text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada','en_uso','completada')),
  cantidad_personas int,
  guardia_entrega_id uuid REFERENCES vecino.profiles(id) ON DELETE SET NULL,
  fecha_hora_entrega timestamptz,
  guardia_devolucion_id uuid REFERENCES vecino.profiles(id) ON DELETE SET NULL,
  fecha_hora_devolucion timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vecino.parking_spots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  house_id      uuid REFERENCES vecino.houses(id) ON DELETE SET NULL,
  identificador text NOT NULL,
  es_publico    boolean NOT NULL DEFAULT false,
  ocupado_por_house_id uuid REFERENCES vecino.houses(id) ON DELETE SET NULL
);

CREATE TABLE vecino.parking_reservations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  house_id      uuid NOT NULL REFERENCES vecino.houses(id) ON DELETE CASCADE,
  spot_id       uuid NOT NULL REFERENCES vecino.parking_spots(id) ON DELETE CASCADE,
  fecha_inicio  timestamptz NOT NULL,
  fecha_fin     timestamptz NOT NULL,
  placa_vehiculo text,
  modelo_vehiculo text,
  estado        text NOT NULL DEFAULT 'confirmada' CHECK (estado IN ('pendiente','confirmada','activa','finalizada','rechazada','en_revision_evento')),
  requiere_aprobacion boolean NOT NULL DEFAULT false,
  motivo_rechazo text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vecino.parking_availability (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  spot_id       uuid NOT NULL REFERENCES vecino.parking_spots(id) ON DELETE CASCADE,
  fecha_inicio  timestamptz NOT NULL,
  fecha_fin     timestamptz NOT NULL,
  publicado_por_house_id uuid REFERENCES vecino.houses(id) ON DELETE SET NULL
);

CREATE TABLE vecino.guard_shifts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  guardia_id    uuid NOT NULL REFERENCES vecino.profiles(id) ON DELETE CASCADE,
  entrada       timestamptz NOT NULL DEFAULT now(),
  salida        timestamptz
);

CREATE TABLE vecino.general_services (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  tipo          text NOT NULL,
  registrado_por uuid REFERENCES vecino.profiles(id) ON DELETE SET NULL,
  entrada       timestamptz NOT NULL DEFAULT now(),
  salida        timestamptz
);

CREATE TABLE vecino.external_services (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  house_id      uuid NOT NULL REFERENCES vecino.houses(id) ON DELETE CASCADE,
  tipo_servicio text NOT NULL,
  fecha_entrada timestamptz NOT NULL DEFAULT now(),
  fecha_salida  timestamptz,
  guardia_id    uuid REFERENCES vecino.profiles(id) ON DELETE SET NULL
);

CREATE TABLE vecino.scheduled_services (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  house_id      uuid NOT NULL REFERENCES vecino.houses(id) ON DELETE CASCADE,
  nombre_servicio text NOT NULL,
  comentarios   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (house_id, nombre_servicio)
);

-- ============================================================
-- MÓDULO I — COMUNIDAD
-- ============================================================
CREATE TABLE vecino.neighbor_services (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  house_id      uuid NOT NULL REFERENCES vecino.houses(id) ON DELETE CASCADE,
  titulo        text NOT NULL,
  categoria     text NOT NULL,
  descripcion   text,
  telefono      text,
  imagen_url    text,
  activo        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (house_id)
);

CREATE TABLE vecino.recognitions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  otorgado_por_house_id uuid NOT NULL REFERENCES vecino.houses(id) ON DELETE CASCADE,
  recibido_por_house_id uuid NOT NULL REFERENCES vecino.houses(id) ON DELETE CASCADE,
  tipo          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (otorgado_por_house_id, recibido_por_house_id)
);

CREATE TABLE vecino.marketplace_listings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  house_id      uuid NOT NULL REFERENCES vecino.houses(id) ON DELETE CASCADE,
  titulo        text NOT NULL,
  descripcion   text,
  precio        numeric(10,2) NOT NULL DEFAULT 0,
  categoria     text NOT NULL,
  imagen_url    text,
  activo        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- MÓDULO J — NOTIFICACIONES (log central)
-- ============================================================
CREATE TABLE vecino.notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colonia_id    uuid NOT NULL REFERENCES vecino.colonias(id) ON DELETE CASCADE,
  profile_id    uuid REFERENCES vecino.profiles(id) ON DELETE SET NULL,
  house_id      uuid REFERENCES vecino.houses(id) ON DELETE SET NULL,
  tipo          text NOT NULL,
  mensaje       text NOT NULL,
  canal         vecino.notif_channel NOT NULL DEFAULT 'telegram',
  estado_envio  vecino.notif_status NOT NULL DEFAULT 'pendiente',
  ref_tabla     text,
  ref_id        uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  enviado_at    timestamptz
);

-- ============================================================
-- RLS
-- ============================================================
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'packages','common_areas','reservations','parking_spots','parking_reservations',
    'parking_availability','guard_shifts','general_services','external_services',
    'scheduled_services','neighbor_services','recognitions','marketplace_listings','notifications'
  ] LOOP
    EXECUTE format('ALTER TABLE vecino.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$CREATE POLICY %1$s_read ON vecino.%1$I FOR SELECT
                      USING (colonia_id = vecino.my_colonia_id());$p$, t);
    EXECUTE format($p$CREATE POLICY %1$s_admin ON vecino.%1$I FOR ALL
                      USING (colonia_id = vecino.my_colonia_id() AND vecino.is_admin())
                      WITH CHECK (colonia_id = vecino.my_colonia_id() AND vecino.is_admin());$p$, t);
  END LOOP;
END $rls$;

-- residentes pueden publicar en comunidad/marketplace
CREATE POLICY neighbor_insert ON vecino.neighbor_services FOR INSERT
  WITH CHECK (colonia_id = vecino.my_colonia_id());
CREATE POLICY market_insert ON vecino.marketplace_listings FOR INSERT
  WITH CHECK (colonia_id = vecino.my_colonia_id());
CREATE POLICY recognition_insert ON vecino.recognitions FOR INSERT
  WITH CHECK (colonia_id = vecino.my_colonia_id());

-- ÍNDICES
CREATE INDEX idx_pkg_house    ON vecino.packages(house_id, estado);
CREATE INDEX idx_resv_area    ON vecino.reservations(area_id);
CREATE INDEX idx_park_spot    ON vecino.parking_reservations(spot_id);
CREATE INDEX idx_market_col   ON vecino.marketplace_listings(colonia_id, activo);
CREATE INDEX idx_notif_pend   ON vecino.notifications(estado_envio, created_at);

GRANT ALL ON ALL TABLES IN SCHEMA vecino TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA vecino TO anon, authenticated, service_role;
