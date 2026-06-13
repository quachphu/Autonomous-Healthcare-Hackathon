"""Quick script to grant admin access to a user."""
import sys
from sqlalchemy import create_engine, text
from app.config import get_settings

if len(sys.argv) < 2:
    print("Usage: python grant_admin.py <user_email_or_id>")
    sys.exit(1)

user_identifier = sys.argv[1]
settings = get_settings()
engine = create_engine(settings.database_url)

with engine.connect() as conn:
    # Try to find user by email (would need auth.users access) or by ID
    result = conn.execute(
        text("UPDATE user_profile SET is_admin = true WHERE id::text LIKE :pattern RETURNING id, first_name, last_name"),
        {"pattern": f"{user_identifier}%"}
    )
    user = result.fetchone()

    if user:
        conn.commit()
        print(f"✓ Admin access granted to user {user[0]}")
        if user[1] or user[2]:
            print(f"  Name: {user[1] or ''} {user[2] or ''}")
    else:
        print(f"✗ No user found matching: {user_identifier}")
        print("\nTo find your user ID:")
        print("1. Log into the app")
        print("2. Go to Settings > My Care Team")
        print("3. Copy your User ID")
        print("4. Run: python grant_admin.py <your-user-id>")
