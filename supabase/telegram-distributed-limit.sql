-- Additive server-only limiter. No changes to products, admin access, or bot routing.
BEGIN;
CREATE TABLE store_private.telegram_limit_secret (
  id boolean PRIMARY KEY DEFAULT true CHECK(id), secret_hash bytea NOT NULL
);
ALTER TABLE store_private.telegram_limit_secret ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON store_private.telegram_limit_secret FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE store_private.telegram_limit_global (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  minute_start timestamptz NOT NULL DEFAULT '-infinity', minute_count integer NOT NULL DEFAULT 0,
  day_start timestamptz NOT NULL DEFAULT '-infinity', day_count integer NOT NULL DEFAULT 0
);
INSERT INTO store_private.telegram_limit_global(id) VALUES(true);
CREATE TABLE store_private.telegram_limit_chats (
  chat_hash text NOT NULL, kind text NOT NULL,
  window_start timestamptz NOT NULL, count integer NOT NULL,
  PRIMARY KEY(chat_hash,kind)
);
CREATE INDEX telegram_limit_chats_expiry ON store_private.telegram_limit_chats(window_start);
CREATE TABLE store_private.telegram_limit_updates (
  update_id bigint PRIMARY KEY, expires_at timestamptz NOT NULL
);
CREATE INDEX telegram_limit_updates_expiry ON store_private.telegram_limit_updates(expires_at);
ALTER TABLE store_private.telegram_limit_global ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_private.telegram_limit_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_private.telegram_limit_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON store_private.telegram_limit_global, store_private.telegram_limit_chats,
  store_private.telegram_limit_updates FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION store_private.consume_telegram_update(p_chat_hash text, p_update_id bigint, p_kind text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE
  t timestamptz; m timestamptz; d timestamptz;
  g store_private.telegram_limit_global%ROWTYPE;
  c integer; cap integer;
BEGIN
  IF p_chat_hash IS NULL OR p_chat_hash !~ '^[a-f0-9]{64}$' OR p_update_id IS NULL
    OR p_update_id < 0 OR p_update_id > 9007199254740991
    OR p_kind IS NULL OR p_kind NOT IN ('message','callback') THEN
    RAISE EXCEPTION 'Invalid limiter input' USING ERRCODE='22023';
  END IF;
  -- One row serializes all replicas and prevents overshoot under concurrent requests.
  SELECT * INTO STRICT g FROM store_private.telegram_limit_global WHERE id=true FOR UPDATE;
  t := clock_timestamp();
  m := date_trunc('minute',t); d := date_trunc('day',t AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  DELETE FROM store_private.telegram_limit_updates WHERE expires_at <= t;
  DELETE FROM store_private.telegram_limit_chats WHERE window_start < m;
  IF EXISTS(SELECT 1 FROM store_private.telegram_limit_updates WHERE update_id=p_update_id) THEN RETURN false; END IF;
  IF g.minute_start <> m THEN g.minute_start:=m; g.minute_count:=0; END IF;
  IF g.day_start <> d THEN g.day_start:=d; g.day_count:=0; END IF;
  IF g.minute_count >= 600 OR g.day_count >= 20000 THEN RETURN false; END IF;
  SELECT count INTO c FROM store_private.telegram_limit_chats WHERE chat_hash=p_chat_hash AND kind=p_kind;
  cap := CASE WHEN p_kind='message' THEN 5 ELSE 30 END;
  IF coalesce(c,0) >= cap THEN RETURN false; END IF;
  INSERT INTO store_private.telegram_limit_updates VALUES(p_update_id,t+interval '24 hours');
  INSERT INTO store_private.telegram_limit_chats VALUES(p_chat_hash,p_kind,m,1)
    ON CONFLICT(chat_hash,kind) DO UPDATE SET count=telegram_limit_chats.count+1;
  UPDATE store_private.telegram_limit_global SET minute_start=m, minute_count=g.minute_count+1,
    day_start=d, day_count=g.day_count+1 WHERE id=true;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION store_private.consume_telegram_update(text,bigint,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store_private.consume_telegram_update(text,bigint,text) TO service_role;
-- Narrow capability: the dedicated secret authorizes only this limiter, never data access.
CREATE FUNCTION public.consume_telegram_update(p_chat_hash text, p_update_id bigint, p_kind text, p_secret text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_secret IS NULL OR length(p_secret) <> 64 OR NOT EXISTS(
    SELECT 1 FROM store_private.telegram_limit_secret
    WHERE id=true AND secret_hash=pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8'))
  ) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';
  END IF;
  RETURN store_private.consume_telegram_update(p_chat_hash,p_update_id,p_kind);
END $$;
REVOKE ALL ON FUNCTION public.consume_telegram_update(text,bigint,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_telegram_update(text,bigint,text,text) TO anon, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
