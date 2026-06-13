"""Check what tables exist in the database."""
from sqlalchemy import create_engine, text, inspect
from app.config import get_settings

settings = get_settings()
engine = create_engine(settings.database_url)

print(f"Connecting to: {settings.database_url[:50]}...\n")

with engine.connect() as conn:
    # List all tables
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    print(f"Found {len(tables)} tables:")
    for table in tables:
        print(f"  - {table}")

    if not tables:
        print("\n⚠️  Database is empty! No tables found.")
        print("Migrations need to be run first.")
