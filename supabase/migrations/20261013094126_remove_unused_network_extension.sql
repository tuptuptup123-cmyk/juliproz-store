-- No application routines reference pg_net; its request/response queues are empty.
-- RESTRICT is intentional: never cascade-delete unexpected dependents.
DROP EXTENSION IF EXISTS pg_net;
