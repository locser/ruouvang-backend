-- Khởi tạo PostgreSQL cho C.W. Wines beta.
-- Chạy bằng tài khoản quản trị PostgreSQL:
--   psql -v ON_ERROR_STOP=1 -v app_password='MAT_KHAU_MANH' \
--     -f scripts/postgres-beta-bootstrap.sql postgres
-- Script có thể chạy lại; mật khẩu không được ghi cứng trong repository.

\set ON_ERROR_STOP on

\if :{?app_password}
\else
  \echo 'THIEU app_password. Chay voi: -v app_password=...'
  \quit 2
\endif

SELECT format(
  'CREATE ROLE ansana_cwwine_user_beta LOGIN INHERIT PASSWORD %L',
  :'app_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'ansana_cwwine_user_beta'
) \gexec

SELECT format(
  'ALTER ROLE ansana_cwwine_user_beta LOGIN INHERIT PASSWORD %L',
  :'app_password'
) \gexec

SELECT 'CREATE ROLE ansana_cwwine_medusa_beta NOLOGIN'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'ansana_cwwine_medusa_beta'
) \gexec

SELECT 'CREATE ROLE ansana_cwwine_chatbot_beta NOLOGIN'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'ansana_cwwine_chatbot_beta'
) \gexec

GRANT ansana_cwwine_medusa_beta, ansana_cwwine_chatbot_beta
  TO ansana_cwwine_user_beta;

-- OWNER được gắn trực tiếp trong CREATE DATABASE.
SELECT 'CREATE DATABASE ansana_cwwine_medusa_beta OWNER ansana_cwwine_medusa_beta'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = 'ansana_cwwine_medusa_beta'
) \gexec

SELECT 'CREATE DATABASE ansana_cwwine_chatbot_beta OWNER ansana_cwwine_chatbot_beta'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = 'ansana_cwwine_chatbot_beta'
) \gexec

ALTER DATABASE ansana_cwwine_medusa_beta OWNER TO ansana_cwwine_medusa_beta;
ALTER DATABASE ansana_cwwine_chatbot_beta OWNER TO ansana_cwwine_chatbot_beta;

GRANT CONNECT ON DATABASE ansana_cwwine_medusa_beta TO ansana_cwwine_user_beta;
GRANT CONNECT ON DATABASE ansana_cwwine_chatbot_beta TO ansana_cwwine_user_beta;

\connect ansana_cwwine_chatbot_beta
CREATE EXTENSION IF NOT EXISTS vector;

\echo 'Da tao/cap nhat 2 database beta va extension vector.'
