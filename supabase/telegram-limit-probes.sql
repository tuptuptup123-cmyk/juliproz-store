-- Run against the installed limiter before production cutover.
-- All synthetic rows and counter changes roll back. No real bot updates are sent.
BEGIN;
DELETE FROM store_private.telegram_limit_updates;
DELETE FROM store_private.telegram_limit_chats;
UPDATE store_private.telegram_limit_global SET minute_start='-infinity',minute_count=0,day_start='-infinity',day_count=0;
DO $$
DECLARE i integer; allowed integer:=0;
BEGIN
  IF has_function_privilege('anon','store_private.consume_telegram_update(text,bigint,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.consume_telegram_update(text,bigint,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Public limiter access';
  END IF;
  UPDATE store_private.telegram_limit_secret SET secret_hash=pg_catalog.sha256(pg_catalog.convert_to(repeat('f',64),'UTF8'));
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.consume_telegram_update(repeat('a',64),999,'message',repeat('0',64));
    RAISE EXCEPTION 'Wrong capability accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF NOT public.consume_telegram_update(repeat('d',64),1000,'message',repeat('f',64)) THEN RAISE EXCEPTION 'Valid capability rejected'; END IF;
  RESET ROLE;
  SET LOCAL ROLE service_role;
  FOR i IN 1..100 LOOP
    IF store_private.consume_telegram_update(repeat('a',64),i,'message') THEN allowed:=allowed+1; END IF;
  END LOOP;
  IF allowed<>5 THEN RAISE EXCEPTION 'Per chat cap failed: %',allowed; END IF;
  IF store_private.consume_telegram_update(repeat('a',64),1,'callback') THEN RAISE EXCEPTION 'Duplicate crossed route'; END IF;
  allowed:=0;
  FOR i IN 101..140 LOOP
    IF store_private.consume_telegram_update(repeat('a',64),i,'callback') THEN allowed:=allowed+1; END IF;
  END LOOP;
  IF allowed<>30 THEN RAISE EXCEPTION 'Callback cap failed'; END IF;
  BEGIN
    PERFORM store_private.consume_telegram_update('invalid',141,'message');
    RAISE EXCEPTION 'Invalid hash accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  RESET ROLE;
  UPDATE store_private.telegram_limit_global SET minute_count=599;
  SET LOCAL ROLE service_role;
  IF NOT store_private.consume_telegram_update(repeat('b',64),142,'message') THEN RAISE EXCEPTION 'Global last slot denied'; END IF;
  IF store_private.consume_telegram_update(repeat('c',64),143,'message') THEN RAISE EXCEPTION 'Global cap failed'; END IF;
  RESET ROLE;
  UPDATE store_private.telegram_limit_global SET minute_start='-infinity',day_count=20000;
  SET LOCAL ROLE service_role;
  IF store_private.consume_telegram_update(repeat('c',64),144,'message') THEN RAISE EXCEPTION 'Day cap failed'; END IF;
  RESET ROLE;
  UPDATE store_private.telegram_limit_global SET minute_start='-infinity',day_start='-infinity';
  UPDATE store_private.telegram_limit_chats SET window_start='-infinity';
  SET LOCAL ROLE service_role;
  IF NOT store_private.consume_telegram_update(repeat('a',64),145,'message') THEN RAISE EXCEPTION 'Window did not reset'; END IF;
  IF store_private.consume_telegram_update(repeat('a',64),1,'message') THEN RAISE EXCEPTION 'Window reset lost dedup'; END IF;
  RESET ROLE;
END $$;
SELECT 'PASS: chat/callback/global/day limits, duplicate isolation, ACLs, validation, window rollover' AS verification;
ROLLBACK;
