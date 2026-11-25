CREATE TABLE sevenlas.profiles (
  id text PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  avatar_seed integer NOT NULL DEFAULT 0 CHECK (avatar_seed >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_username_format CHECK (username ~ '^[a-z0-9_]{3,20}$')
);

CREATE TABLE sevenlas.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10)),
  owner_id text NOT NULL REFERENCES sevenlas.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  password_hash text,
  media_invite text,
  media_host_id text REFERENCES sevenlas.profiles(id) ON DELETE SET NULL,
  media_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rooms_name_length CHECK (char_length(name) BETWEEN 1 AND 50),
  CONSTRAINT rooms_code_format CHECK (code ~ '^[A-F0-9]{10}$')
);

CREATE TABLE sevenlas.room_members (
  room_id uuid NOT NULL REFERENCES sevenlas.rooms(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES sevenlas.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX room_members_user_idx ON sevenlas.room_members(user_id);

CREATE TABLE sevenlas.friendships (
  user_id text NOT NULL REFERENCES sevenlas.profiles(id) ON DELETE CASCADE,
  friend_id text NOT NULL REFERENCES sevenlas.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id),
  CONSTRAINT friendships_distinct_users CHECK (user_id <> friend_id),
  CONSTRAINT friendships_canonical_order CHECK (user_id < friend_id)
);

CREATE INDEX friendships_friend_idx ON sevenlas.friendships(friend_id);

CREATE TABLE sevenlas.room_presence (
  room_id uuid NOT NULL REFERENCES sevenlas.rooms(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES sevenlas.profiles(id) ON DELETE CASCADE,
  sharing boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX room_presence_activity_idx ON sevenlas.room_presence(room_id, updated_at DESC);
