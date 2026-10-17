import argparse
import sqlite3
from pathlib import Path


def sql_value(value):
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser(description="Export QR rows for import into Cloudflare D1.")
    parser.add_argument("--database", type=Path, default=Path("data/codes.sqlite3"))
    parser.add_argument("--output", type=Path, default=Path("data/codes-import.sql"))
    args = parser.parse_args()

    source = sqlite3.connect(f"file:{args.database.resolve()}?mode=ro", uri=True)
    try:
        rows = source.execute(
            "SELECT token, label, created_at, used_at FROM codes ORDER BY id"
        ).fetchall()
    finally:
        source.close()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    statements = ["-- Private QR data export. Do not commit this file."]
    for row in rows:
        values = ", ".join(sql_value(value) for value in row)
        statements.append(
            "INSERT INTO codes (token, label, created_at, used_at) "
            f"VALUES ({values}) ON CONFLICT(token) DO UPDATE SET "
            "label = excluded.label, created_at = excluded.created_at, used_at = excluded.used_at;"
        )
    args.output.write_text("\n".join(statements) + "\n", encoding="utf-8")
    print(f"Exported {len(rows)} QR records to {args.output}; keep this file private.")


if __name__ == "__main__":
    main()