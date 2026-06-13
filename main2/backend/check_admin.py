"""Check admin status and list users."""
from sqlalchemy import create_engine, text
from app.config import get_settings

settings = get_settings()
engine = create_engine(settings.database_url)

print("Checking user admin status...\n")

with engine.connect() as conn:
    result = conn.execute(
        text("""
            SELECT
                id,
                COALESCE(first_name, 'N/A') as first_name,
                COALESCE(last_name, 'N/A') as last_name,
                is_admin,
                COALESCE(role::text, 'N/A') as role,
                created_at
            FROM user_profile
            ORDER BY created_at DESC
            LIMIT 10
        """)
    )

    users = result.fetchall()

    if not users:
        print("No users found in database.")
    else:
        print(f"Found {len(users)} users:\n")
        print("-" * 100)
        for user in users:
            admin_status = "✓ ADMIN" if user[3] else "  user"
            print(f"{admin_status}  | {user[0]} | {user[1]} {user[2]} | Role: {user[4]}")
        print("-" * 100)

        admin_count = sum(1 for u in users if u[3])
        if admin_count == 0:
            print("\n⚠️  No admin users found!")
            print("\nTo grant admin access to a user, run:")
            print("  python grant_admin.py <user-id>")
        else:
            print(f"\n✓ Found {admin_count} admin user(s)")
