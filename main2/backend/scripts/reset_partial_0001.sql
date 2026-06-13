-- Run in Supabase SQL Editor only if `alembic upgrade head` still fails after
-- fixing migrations. Then: alembic stamp 560a072cb656 && alembic upgrade head

DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS thread_participants CASCADE;
DROP TABLE IF EXISTS message_threads CASCADE;
DROP TABLE IF EXISTS checkup_sessions CASCADE;
DROP TABLE IF EXISTS health_records CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;

DROP TYPE IF EXISTS sender_type;
DROP TYPE IF EXISTS thread_type;
DROP TYPE IF EXISTS session_status;

DELETE FROM alembic_version WHERE version_num = '0001_add_core_tables';
