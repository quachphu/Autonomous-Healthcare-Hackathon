"""Quick admin check without migrations."""
import sys
from sqlalchemy import create_engine, text
from app.config import get_settings

settings = get_settings()
engine = create_engine(settings.database_url)

# If user provides their ID, check and grant admin
if len(sys.argv) > 1:
    user_id = sys.argv[1]
    print(f"Granting admin to user: {user_id}")

    with engine.connect() as conn:
        try:
            result = conn.execute(
                text("UPDATE user_profiles SET is_admin = true WHERE id::text LIKE :pattern RETURNING id, first_name, last_name, is_admin"),
                {"pattern": f"%{user_id}%"}
            )
            user = result.fetchone()
            conn.commit()

            if user:
                print(f"✓ Admin granted! User: {user[1] or ''} {user[2] or ''}")
                print(f"  ID: {user[0]}")
                print(f"  is_admin: {user[3]}")
            else:
                print(f"✗ No user found matching: {user_id}")
        except Exception as e:
            print(f"Error: {e}")
else:
    # Just list users
    print("Listing all users:\n")
    with engine.connect() as conn:
        try:
            result = conn.execute(
                text("""
                    SELECT id, first_name, last_name, is_admin, role
                    FROM user_profiles
                    ORDER BY created_at DESC
                    LIMIT 10
                """)
            )
            users = result.fetchall()

            for user in users:
                admin = "✓ ADMIN" if user[3] else "  user "
                name = f"{user[1] or 'N/A'} {user[2] or ''}"
                print(f"{admin} | {user[0]} | {name:20s} | {user[4] or 'N/A'}")

            print(f"\n{len(users)} users found")
            print("\nTo grant admin: python quick_check.py <user-id-prefix>")
        except Exception as e:
            print(f"Error: {e}")
