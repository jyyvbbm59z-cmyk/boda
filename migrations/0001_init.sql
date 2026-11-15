-- Grupos de invitados (una familia, una pareja...). Cada grupo tiene su código.
CREATE TABLE groups (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  max_seats INTEGER NOT NULL DEFAULT 2,
  children_allowed INTEGER NOT NULL DEFAULT 0,
  contact_name TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'yes', 'no')),
  bus_type TEXT NOT NULL DEFAULT 'none' CHECK (bus_type IN ('none', 'out', 'back', 'both')),
  bus_stop_id TEXT,
  bus_seats INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  responded_at TEXT,
  updated_at TEXT
);

-- Personas de cada grupo. Al crear el grupo se cargan los nombres previstos;
-- al confirmar se sustituyen por los que vienen de verdad.
CREATE TABLE guests (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_child INTEGER NOT NULL DEFAULT 0,
  menu TEXT,
  allergies TEXT
);
CREATE INDEX idx_guests_group ON guests(group_id);

CREATE TABLE songs (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_songs_group ON songs(group_id);

-- Historial de cada envío (qué marcó y cuándo)
CREATE TABLE response_log (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
