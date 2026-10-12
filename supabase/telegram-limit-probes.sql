-- Run against isolated probe schemas created from telegram-distributed-limit.sql.
-- All synthetic rows and counter changes roll back. No real bot updates are sent.
BEGIN;
DELETE FROM telegram_probe_private.telegram_limit_updates;
DELETE FROM telegram_probe_private.telegram_limit_chats;
UPDATE telegram_probe_private.telegram_limit_global SET minute_start='-infinity',minute_count=0,day_start='-infinity',day_count=0;
DO $$
DECLARE i integer; allowed integer:=0;
BEGIN
  IF has_function_privilege('anon','telegram_probe_api.consume_telegram_update(text,bigint,text)','EXECUTE')
    OR has_function_privilege('authenticated','telegram_probe_api.consume_telegram_update(text,bigint,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Public limiter access';
  END IF;
  SET LOCAL ROLE service_role;
  FOR i IN 1..100 LOOP
    IF telegram_probe_api.consume_telegram_update(repeat('a',64),i,'message') THEN allowed:=allowed+1; END IF;
  END LOOP;
  IF allowed<>5 THEN RAISE EXCEPTION 'Per chat cap failed: %',allowed; END IF;
  IF telegram_probe_api.consume_telegram_update(repeat('a',64),1,'callback') THEN RAISE EXCEPTION 'Duplicate crossed route'; END IF;
  allowed:=0;
  FOR i IN 101..140 LOOP
    IF telegram_probe_api.consume_telegram_update(repeat('a',64),i,'callback') THEN allowed:=allowed+1; END IF;
  END LOOP;
  IF allowed<>30 THEN RAISE EXCEPTION 'Callback cap failed'; END IF;
  BEGIN
    PERFORM telegram_probe_api.consume_telegram_update('invalid',141,'message');
    RAISE EXCEPTION 'Invalid hash accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  RESET ROLE;
  UPDATE telegram_probe_private.telegram_limit_global SET minute_count=599;
  SET LOCAL ROLE service_role;
  IF NOT telegram_probe_api.consume_telegram_update(repeat('b',64),142,'message') THEN RAISE EXCEPTION 'Global last slot denied'; END IF;
  IF telegram_probe_api.consume_telegram_update(repeat('c',64),143,'message') THEN RAISE EXCEPTION 'Global cap failed'; END IF;
  RESET ROLE;
  UPDATE telegram_probe_private.telegram_limit_global SET minute_start='-infinity',day_count=20000;
  SET LOCAL ROLE service_role;
  IF telegram_probe_api.consume_telegram_update(repeat('c',64),144,'message') THEN RAISE EXCEPTION 'Day cap failed'; END IF;
  RESET ROLE;
  UPDATE telegram_probe_private.telegram_limit_global SET minute_start='-infinity',day_start='-infinity';
  UPDATE telegram_probe_private.telegram_limit_chats SET window_start='-infinity';
  SET LOCAL ROLE service_role;
  IF NOT telegram_probe_api.consume_telegram_update(repeat('a',64),145,'message') THEN RAISE EXCEPTION 'Window did not reset'; END IF;
  IF telegram_probe_api.consume_telegram_update(repeat('a',64),1,'message') THEN RAISE EXCEPTION 'Window reset lost dedup'; END IF;
  RESET ROLE;
END $$;
SELECT 'PASS: chat/callback/global/day limits, duplicate isolation, ACLs, validation, window rollover' AS verification;
ROLLBACK;
