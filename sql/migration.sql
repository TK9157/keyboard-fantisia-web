-- ============================================================
-- KEYBOARD FANTASIA — Supabase Database Migration
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. TABLES
-- ──────────────────────────────────────────────────────────────

-- Cassettes table
CREATE TABLE IF NOT EXISTS cassettes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  full_label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#888888',
  photo_set TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tracks table
CREATE TABLE IF NOT EXISTS tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cassette_id TEXT NOT NULL REFERENCES cassettes(id) ON DELETE CASCADE,
  track_number INT NOT NULL,
  title TEXT NOT NULL,
  movie TEXT,
  music_director TEXT,
  audio_url TEXT,
  video_url TEXT,
  video_src TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cassette_id, track_number)
);

-- Add video_src column for databases created before the music-video feature
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS video_src TEXT;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Visitors table
CREATE TABLE IF NOT EXISTS visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_uid UUID UNIQUE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  ip_address TEXT,
  user_agent TEXT,
  city TEXT,
  country TEXT,
  first_visit TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_visit TIMESTAMPTZ NOT NULL DEFAULT now(),
  visit_count INT NOT NULL DEFAULT 1
);

-- Play logs table
CREATE TABLE IF NOT EXISTS play_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID REFERENCES visitors(id) ON DELETE SET NULL,
  track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
  cassette_id TEXT REFERENCES cassettes(id) ON DELETE SET NULL,
  track_title TEXT,
  played_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tracks_cassette ON tracks(cassette_id);
CREATE INDEX IF NOT EXISTS idx_play_logs_visitor ON play_logs(visitor_id);
CREATE INDEX IF NOT EXISTS idx_play_logs_track ON play_logs(track_id);
CREATE INDEX IF NOT EXISTS idx_visitors_email ON visitors(email);
CREATE INDEX IF NOT EXISTS idx_visitors_auth_uid ON visitors(auth_uid);

-- ──────────────────────────────────────────────────────────────
-- 2. ROW LEVEL SECURITY (RLS)
-- ──────────────────────────────────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE cassettes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE play_logs ENABLE ROW LEVEL SECURITY;

-- Cassettes: anyone can read
CREATE POLICY "cassettes_public_read" ON cassettes
  FOR SELECT USING (true);

-- Tracks: anyone can read
CREATE POLICY "tracks_public_read" ON tracks
  FOR SELECT USING (true);
-- Tracks: anonymous writes so the admin panel can save/update/delete songs
CREATE POLICY "tracks_public_insert" ON tracks
  FOR INSERT WITH CHECK (true);

CREATE POLICY "tracks_public_update" ON tracks
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "tracks_public_delete" ON tracks
  FOR DELETE USING (true);

-- Visitors: authenticated users can insert/update their own record
CREATE POLICY "visitors_insert" ON visitors
  FOR INSERT WITH CHECK (true);

CREATE POLICY "visitors_update_own" ON visitors
  FOR UPDATE USING (auth_uid = auth.uid());

CREATE POLICY "visitors_read_own" ON visitors
  FOR SELECT USING (auth_uid = auth.uid());

-- Play logs: anyone can insert (we track guests too), auth users can read own
CREATE POLICY "play_logs_insert" ON play_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "play_logs_read_own" ON play_logs
  FOR SELECT USING (
    visitor_id IN (SELECT id FROM visitors WHERE auth_uid = auth.uid())
  );

-- ──────────────────────────────────────────────────────────────
-- 3. SEED DATA — All 60 tracks from 6 cassettes
-- ──────────────────────────────────────────────────────────────

-- Cassettes
INSERT INTO cassettes (id, label, full_label, color, photo_set, sort_order) VALUES
  ('C1', 'Vol 1', 'Keyboard Fantasia Vol 1', '#E63946', 'S1', 1),
  ('C2', 'Vol 2', 'Keyboard Fantasia Vol 2', '#457B9D', 'S2', 2),
  ('C3', 'Vol 3', 'Keyboard Fantasia Vol 3', '#2A9D8F', 'S3', 3),
  ('C4', 'Vol 4', 'Keyboard Fantasia Vol 4', '#E9C46A', 'S4', 4),
  ('C5', 'Vol 5', 'Keyboard Fantasia Vol 5', '#F4A261', 'S5', 5),
  ('C6', 'Vol 6', 'Keyboard Fantasia Vol 6', '#6A4C93', 'S6', 6)
ON CONFLICT (id) DO NOTHING;

-- C1 Tracks
INSERT INTO tracks (cassette_id, track_number, title, movie, music_director, audio_url, video_url) VALUES
  ('C1', 1, 'Test Video Track', 'Roja (1992)', 'Keyboard Fantasia', 'media/audio/c1_track01.mp3', 'media/video/Test001.mp4'),
  ('C1', 2, 'Ilayanila Pozhigirathe', 'Payanangal Mudivathillai (1982)', 'Ilaiyaraaja', 'media/audio/c1_track02.mp3', 'media/video/c1_track02.mp4'),
  ('C1', 3, 'Poomalai Vaazhum', 'Mann Vasanai (1983)', 'Ilaiyaraaja', 'media/audio/c1_track03.mp3', 'media/video/c1_track03.mp4'),
  ('C1', 4, 'Thendral Vandhu Ennai Thodum', 'Avatharam (1995)', 'Ilaiyaraaja', 'media/audio/c1_track04.mp3', 'media/video/c1_track04.mp4'),
  ('C1', 5, 'Mandram Vandha', 'Mouna Raagam (1986)', 'Ilaiyaraaja', 'media/audio/c1_track05.mp3', 'media/video/c1_track05.mp4'),
  ('C1', 6, 'Ennai Thalatta Varuvala', 'Kadhalukku Mariyadhai (1997)', 'Ilaiyaraaja', 'media/audio/c1_track06.mp3', 'media/video/c1_track06.mp4'),
  ('C1', 7, 'Putham Puthu Kaalai', 'Alaigal Oivathillai (1981)', 'Ilaiyaraaja', 'media/audio/c1_track07.mp3', 'media/video/c1_track07.mp4'),
  ('C1', 8, 'Sundari Kannal', 'Thalapathi (1991)', 'Ilaiyaraaja', 'media/audio/c1_track08.mp3', 'media/video/c1_track08.mp4'),
  ('C1', 9, 'Poove Sempoove', 'Solla Thudikkudhu Manasu (1988)', 'Ilaiyaraaja', 'media/audio/c1_track09.mp3', 'media/video/c1_track09.mp4'),
  ('C1', 10, 'Malargale Malargale', 'Love Birds (1996)', 'A.R. Rahman', 'media/audio/c1_track10.mp3', 'media/video/c1_track10.mp4')
ON CONFLICT (cassette_id, track_number) DO NOTHING;

-- C-1 Track 01 plays the music video (Test001.mp4)
-- Updates all fields so re-running the migration fixes existing databases too
UPDATE tracks
SET
  title = 'Test Video Track',
  music_director = 'Keyboard Fantasia',
  video_url = 'media/video/Test001.mp4',
  video_src = 'media/video/Test001.mp4'
WHERE cassette_id = 'C1' AND track_number = 1;

-- C2 Tracks
INSERT INTO tracks (cassette_id, track_number, title, movie, music_director, audio_url, video_url) VALUES
  ('C2', 1, 'Vennilavae Vennilavae', 'Minsara Kanavu (1997)', 'A.R. Rahman', 'media/audio/c2_track01.mp3', 'media/video/c2_track01.mp4'),
  ('C2', 2, 'Kannalanae', 'Bombay (1995)', 'A.R. Rahman', 'media/audio/c2_track02.mp3', 'media/video/c2_track02.mp4'),
  ('C2', 3, 'Oru Deivam Thantha Poove', 'Kannathil Muthamittal (2002)', 'A.R. Rahman', 'media/audio/c2_track03.mp3', 'media/video/c2_track03.mp4'),
  ('C2', 4, 'Nila Kaaigiradhu', 'Indira (1995)', 'A.R. Rahman', 'media/audio/c2_track04.mp3', 'media/video/c2_track04.mp4'),
  ('C2', 5, 'Kadhal Sadugudu', 'Alaipayuthey (2000)', 'A.R. Rahman', 'media/audio/c2_track05.mp3', 'media/video/c2_track05.mp4'),
  ('C2', 6, 'Pachai Niramae', 'Alaipayuthey (2000)', 'A.R. Rahman', 'media/audio/c2_track06.mp3', 'media/video/c2_track06.mp4'),
  ('C2', 7, 'Snehithane Snehithane', 'Alaipayuthey (2000)', 'A.R. Rahman', 'media/audio/c2_track07.mp3', 'media/video/c2_track07.mp4'),
  ('C2', 8, 'Vellai Pookal', 'Kannathil Muthamittal (2002)', 'A.R. Rahman', 'media/audio/c2_track08.mp3', 'media/video/c2_track08.mp4'),
  ('C2', 9, 'New York Nagaram', 'Sillunu Oru Kaadhal (2006)', 'A.R. Rahman', 'media/audio/c2_track09.mp3', 'media/video/c2_track09.mp4'),
  ('C2', 10, 'Munbe Vaa', 'Sillunu Oru Kaadhal (2006)', 'A.R. Rahman', 'media/audio/c2_track10.mp3', 'media/video/c2_track10.mp4')
ON CONFLICT (cassette_id, track_number) DO NOTHING;

-- C3 Tracks
INSERT INTO tracks (cassette_id, track_number, title, movie, music_director, audio_url, video_url) VALUES
  ('C3', 1, 'Uyire Uyire', 'Bombay (1995)', 'A.R. Rahman', 'media/audio/c3_track01.mp3', 'media/video/c3_track01.mp4'),
  ('C3', 2, 'Pudhu Vellai Mazhai', 'Roja (1992)', 'A.R. Rahman', 'media/audio/c3_track02.mp3', 'media/video/c3_track02.mp4'),
  ('C3', 3, 'Chinna Chinna Aasai', 'Roja (1992)', 'A.R. Rahman', 'media/audio/c3_track03.mp3', 'media/video/c3_track03.mp4'),
  ('C3', 4, 'Konjum Mainakkale', 'Kandukondain Kandukondain (2000)', 'A.R. Rahman', 'media/audio/c3_track04.mp3', 'media/video/c3_track04.mp4'),
  ('C3', 5, 'Narumugaye', 'Iruvar (1997)', 'A.R. Rahman', 'media/audio/c3_track05.mp3', 'media/video/c3_track05.mp4'),
  ('C3', 6, 'Enna Solla Pogirai', 'Kandukondain Kandukondain (2000)', 'A.R. Rahman', 'media/audio/c3_track06.mp3', 'media/video/c3_track06.mp4'),
  ('C3', 7, 'Nenjukkul Peidhidum', 'Vaaranam Aayiram (2008)', 'Harris Jayaraj', 'media/audio/c3_track07.mp3', 'media/video/c3_track07.mp4'),
  ('C3', 8, 'Vaseegara', 'Minnale (2001)', 'Harris Jayaraj', 'media/audio/c3_track08.mp3', 'media/video/c3_track08.mp4'),
  ('C3', 9, 'Anjali Anjali', 'Duet (1994)', 'A.R. Rahman', 'media/audio/c3_track09.mp3', 'media/video/c3_track09.mp4'),
  ('C3', 10, 'Ennulle Ennulle', 'Valli (1993)', 'Deva', 'media/audio/c3_track10.mp3', 'media/video/c3_track10.mp4')
ON CONFLICT (cassette_id, track_number) DO NOTHING;

-- C4 Tracks
INSERT INTO tracks (cassette_id, track_number, title, movie, music_director, audio_url, video_url) VALUES
  ('C4', 1, 'Minsara Poove', 'Padayappa (1999)', 'A.R. Rahman', 'media/audio/c4_track01.mp3', 'media/video/c4_track01.mp4'),
  ('C4', 2, 'O Priya Priya', 'Geetanjali (1989)', 'Ilaiyaraaja', 'media/audio/c4_track02.mp3', 'media/video/c4_track02.mp4'),
  ('C4', 3, 'Kannodu Kanbathellam', 'Jeans (1998)', 'A.R. Rahman', 'media/audio/c4_track03.mp3', 'media/video/c4_track03.mp4'),
  ('C4', 4, 'Thanga Thamarai', 'Minsara Kanavu (1997)', 'A.R. Rahman', 'media/audio/c4_track04.mp3', 'media/video/c4_track04.mp4'),
  ('C4', 5, 'Megham Karukuthu', 'Thotta Chinungi (1995)', 'Deva', 'media/audio/c4_track05.mp3', 'media/video/c4_track05.mp4'),
  ('C4', 6, 'Kadhalar Dhinam', 'Kadhalar Dhinam (1999)', 'A.R. Rahman', 'media/audio/c4_track06.mp3', 'media/video/c4_track06.mp4'),
  ('C4', 7, 'Kadhal Kavithai', 'Prashanth Hit Songs', 'Various', 'media/audio/c4_track07.mp3', 'media/video/c4_track07.mp4'),
  ('C4', 8, 'Maanguyile Poonguyile', 'Karakattakkaran (1989)', 'Ilaiyaraaja', 'media/audio/c4_track08.mp3', 'media/video/c4_track08.mp4'),
  ('C4', 9, 'En Jeevan Paduthu', 'Anbulla Rajinikanth (1988)', 'Ilaiyaraaja', 'media/audio/c4_track09.mp3', 'media/video/c4_track09.mp4'),
  ('C4', 10, 'Innisai Paadivarum', 'Thullatha Manamum Thullum (1999)', 'S.A. Rajkumar', 'media/audio/c4_track10.mp3', 'media/video/c4_track10.mp4')
ON CONFLICT (cassette_id, track_number) DO NOTHING;

-- C5 Tracks
INSERT INTO tracks (cassette_id, track_number, title, movie, music_director, audio_url, video_url) VALUES
  ('C5', 1, 'Pettai Rap', 'Kadhalan (1994)', 'A.R. Rahman', 'media/audio/c5_track01.mp3', 'media/video/c5_track01.mp4'),
  ('C5', 2, 'Telephone Manipol', 'En Swasa Kaatre (1999)', 'A.R. Rahman', 'media/audio/c5_track02.mp3', 'media/video/c5_track02.mp4'),
  ('C5', 3, 'Kaadhal Rojave', 'Roja (1992)', 'A.R. Rahman', 'media/audio/c5_track03.mp3', 'media/video/c5_track03.mp4'),
  ('C5', 4, 'Enna Satham Indha Neram', 'Salangai Oli (1983)', 'Ilaiyaraaja', 'media/audio/c5_track04.mp3', 'media/video/c5_track04.mp4'),
  ('C5', 5, 'Rasathi Unna', 'Once More (1997)', 'S.A. Rajkumar', 'media/audio/c5_track05.mp3', 'media/video/c5_track05.mp4'),
  ('C5', 6, 'Oru Naalum', 'Ejamaan (1993)', 'Ilaiyaraaja', 'media/audio/c5_track06.mp3', 'media/video/c5_track06.mp4'),
  ('C5', 7, 'Raasaave Unnai', 'Mella Pesungal (1990)', 'Ilaiyaraaja', 'media/audio/c5_track07.mp3', 'media/video/c5_track07.mp4'),
  ('C5', 8, 'Ottagathai Kattikko', 'Gentleman (1993)', 'A.R. Rahman', 'media/audio/c5_track08.mp3', 'media/video/c5_track08.mp4'),
  ('C5', 9, 'Antha Arabic Kadaloram', 'Bombay (1995)', 'A.R. Rahman', 'media/audio/c5_track09.mp3', 'media/video/c5_track09.mp4'),
  ('C5', 10, 'Kummi Adi', 'Thiruda Thiruda (1993)', 'A.R. Rahman', 'media/audio/c5_track10.mp3', 'media/video/c5_track10.mp4')
ON CONFLICT (cassette_id, track_number) DO NOTHING;

-- C6 Tracks
INSERT INTO tracks (cassette_id, track_number, title, movie, music_director, audio_url, video_url) VALUES
  ('C6', 1, 'Haiyya Ho', 'Gentleman (1993)', 'A.R. Rahman', 'media/audio/c6_track01.mp3', 'media/video/c6_track01.mp4'),
  ('C6', 2, 'Poongatru Thirumbuma', 'Keladi Kanmani (1990)', 'Ilaiyaraaja', 'media/audio/c6_track02.mp3', 'media/video/c6_track02.mp4'),
  ('C6', 3, 'Nee Partha Parvai', 'Hey Ram (2000)', 'Ilaiyaraaja', 'media/audio/c6_track03.mp3', 'media/video/c6_track03.mp4'),
  ('C6', 4, 'Suttum Vizhi Sudare', 'Ghajini (2005)', 'Harris Jayaraj', 'media/audio/c6_track04.mp3', 'media/video/c6_track04.mp4'),
  ('C6', 5, 'Thenpaandi Cheemayile', 'Nayakan (1987)', 'Ilaiyaraaja', 'media/audio/c6_track05.mp3', 'media/video/c6_track05.mp4'),
  ('C6', 6, 'Kalaivaniye', 'Sindhu Bhairavi (1985)', 'Ilaiyaraaja', 'media/audio/c6_track06.mp3', 'media/video/c6_track06.mp4'),
  ('C6', 7, 'Thendral Vanthu Theendum Bodhu', 'Avatharam (1995)', 'Ilaiyaraaja', 'media/audio/c6_track07.mp3', 'media/video/c6_track07.mp4'),
  ('C6', 8, 'Sundari Neeyum', 'Michael Madana Kama Rajan (1990)', 'Ilaiyaraaja', 'media/audio/c6_track08.mp3', 'media/video/c6_track08.mp4'),
  ('C6', 9, 'En Iniya Pon Nilave', 'Moodu Pani (1980)', 'Ilaiyaraaja', 'media/audio/c6_track09.mp3', 'media/video/c6_track09.mp4'),
  ('C6', 10, 'Ilamai Enum Poongatru', 'Pagalil Oru Iravu (1978)', 'M.S. Viswanathan', 'media/audio/c6_track10.mp3', 'media/video/c6_track10.mp4')
ON CONFLICT (cassette_id, track_number) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 4. STORAGE BUCKETS (run these separately if they error)
-- ──────────────────────────────────────────────────────────────
-- Note: Storage bucket is created via the Supabase Dashboard:
-- Go to Storage -> New Bucket -> Name: "PradeepN_songs_tracks", Public: ON

-- Storage RLS: public read/upload/update/delete on PradeepN_songs_tracks
-- (Safe to re-run - policies are dropped before being recreated)
UPDATE storage.buckets
SET public = true
WHERE id = 'PradeepN_songs_tracks';

DROP POLICY IF EXISTS "Public Read Access for PradeepN_songs_tracks" ON storage.objects;
CREATE POLICY "Public Read Access for PradeepN_songs_tracks"
ON storage.objects
FOR SELECT
USING (bucket_id = 'PradeepN_songs_tracks');

DROP POLICY IF EXISTS "Public Upload Access for PradeepN_songs_tracks" ON storage.objects;
CREATE POLICY "Public Upload Access for PradeepN_songs_tracks"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'PradeepN_songs_tracks');

DROP POLICY IF EXISTS "Public Update Access for PradeepN_songs_tracks" ON storage.objects;
CREATE POLICY "Public Update Access for PradeepN_songs_tracks"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'PradeepN_songs_tracks')
WITH CHECK (bucket_id = 'PradeepN_songs_tracks');

DROP POLICY IF EXISTS "Public Delete Access for PradeepN_songs_tracks" ON storage.objects;
CREATE POLICY "Public Delete Access for PradeepN_songs_tracks"
ON storage.objects
FOR DELETE
USING (bucket_id = 'PradeepN_songs_tracks');

-- ──────────────────────────────────────────────────────────────
-- 5. HELPER FUNCTION — Upsert visitor (handles guest + auth)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_visitor(
  p_auth_uid UUID DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_auth_uid IS NOT NULL THEN
    -- Try to find existing visitor by auth_uid
    SELECT id INTO v_id FROM visitors WHERE auth_uid = p_auth_uid;
    
    IF v_id IS NOT NULL THEN
      -- Update existing visitor
      UPDATE visitors SET
        email = COALESCE(p_email, email),
        name = COALESCE(p_name, name),
        avatar_url = COALESCE(p_avatar_url, avatar_url),
        ip_address = COALESCE(p_ip_address, ip_address),
        user_agent = COALESCE(p_user_agent, user_agent),
        city = COALESCE(p_city, city),
        country = COALESCE(p_country, country),
        last_visit = now(),
        visit_count = visit_count + 1
      WHERE id = v_id;
      RETURN v_id;
    END IF;
  END IF;

  -- Insert new visitor
  INSERT INTO visitors (auth_uid, email, name, avatar_url, ip_address, user_agent, city, country)
  VALUES (p_auth_uid, p_email, p_name, p_avatar_url, p_ip_address, p_user_agent, p_city, p_country)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;
 