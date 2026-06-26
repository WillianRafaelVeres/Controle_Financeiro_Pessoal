"""
Copy the V1 SQLite data into the Supabase PostgreSQL database configured by DATABASE_URL.

Use:
  1. Put DATABASE_URL in backend/.env or in %APPDATA%\\CentralFinanceira\\.env.
  2. Install backend dependencies.
  3. Run from the repository root:
       .\\.venv\\Scripts\\python scripts\\migrate_sqlite_to_supabase.py
"""

from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path


TABLES_IN_ORDER = [
    "categorias",
    "subcategorias",
    "metodos_pagamento",
    "contas",
    "conta_saldos",
    "cartoes",
    "caixinhas",
    "ativos",
    "lancamentos",
    "compromissos_cartao",
    "contas_futuras",
    "orcamento_itens",
    "orcamento_itens_padrao",
    "orcamentos_mensais",
    "orcamento_padrao",
    "movimentos_investimento",
    "dividendos",
    "extrato_dolar",
    "cotacoes",
    "compras_dolar",
    "historico_investimentos_mensal",
    "metas",
    "pagamentos_fatura",
    "configuracoes",
]


def load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return

    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / "backend" / ".env")

    appdata = os.getenv("APPDATA")
    if appdata:
        load_dotenv(Path(appdata) / "CentralFinanceira" / ".env")


def find_sqlite_db() -> Path:
    root = Path(__file__).resolve().parents[1]
    candidates = []

    appdata = os.getenv("APPDATA")
    if appdata:
        candidates.append(Path(appdata) / "CentralFinanceira" / "central_financeira.db")
    candidates.append(root / "backend" / "data" / "central_financeira.db")

    for candidate in candidates:
        if candidate.exists():
            return candidate

    print("SQLite database was not found. Checked:")
    for candidate in candidates:
        print(f"  - {candidate}")
    sys.exit(1)


def main() -> int:
    load_env()
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url.startswith(("postgres://", "postgresql://")):
        print("DATABASE_URL must point to Supabase/PostgreSQL.")
        return 1

    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        print("Install dependencies first: pip install -r backend/requirements.txt")
        return 1

    sqlite_path = find_sqlite_db()
    print(f"Reading SQLite data from: {sqlite_path}")

    sqlite_conn = sqlite3.connect(str(sqlite_path))
    sqlite_conn.row_factory = sqlite3.Row

    pg_conn = psycopg2.connect(database_url)
    pg_conn.autocommit = False
    pg_cursor = pg_conn.cursor()

    migrated = 0
    try:
        for table in TABLES_IN_ORDER:
            sqlite_cursor = sqlite_conn.cursor()
            exists = sqlite_cursor.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
                (table,),
            ).fetchone()
            if not exists:
                continue

            rows = sqlite_cursor.execute(f'SELECT * FROM "{table}"').fetchall()
            if not rows:
                continue

            columns = [description[0] for description in sqlite_cursor.description]
            boolean_columns = get_boolean_columns(pg_cursor, table)
            column_sql = ", ".join(f'"{column}"' for column in columns)
            placeholders = ", ".join(["%s"] * len(columns))
            insert_sql = f'INSERT INTO "{table}" ({column_sql}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'
            rows_data = [convert_row(row, columns, boolean_columns) for row in rows]

            psycopg2.extras.execute_batch(pg_cursor, insert_sql, rows_data, page_size=200)
            pg_conn.commit()
            migrated += len(rows)
            print(f"{table}: {len(rows)} rows copied")
    except Exception:
        pg_conn.rollback()
        raise
    finally:
        sqlite_conn.close()
        pg_conn.close()

    print(f"Done. Copied {migrated} rows.")
    return 0


def get_boolean_columns(pg_cursor, table: str) -> set[str]:
    pg_cursor.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = %s
          AND data_type = 'boolean'
        """,
        (table,),
    )
    return {row[0] for row in pg_cursor.fetchall()}


def convert_row(row: sqlite3.Row, columns: list[str], boolean_columns: set[str]) -> tuple:
    values = []
    for column in columns:
        value = row[column]
        if column in boolean_columns and value is not None:
            value = bool(value)
        values.append(value)
    return tuple(values)


if __name__ == "__main__":
    raise SystemExit(main())
