"""Set GeoJSON location for hardik@gmail.com"""
from datetime import datetime, timezone
from database import get_drivers_collection

driver_email = "hardik@gmail.com"
lat, lng = 19.1178, 72.8781

result = get_drivers_collection().update_one(
    {"email": driver_email},
    {
        "$set": {
            "location": {
                "type": "Point",
                "coordinates": [lng, lat],
            },
            "dispatch_status": "online",
            "last_ping_at": datetime.now(tz=timezone.utc),
            "updated_at": datetime.now(tz=timezone.utc),
        }
    },
)

if result.modified_count > 0:
    print(f"OK Updated {driver_email} location=[{lng}, {lat}] status=online")
else:
    print(f"WARN No changes (driver may not exist or already set)")

doc = get_drivers_collection().find_one({"email": driver_email}, {"location": 1, "dispatch_status": 1, "_id": 0})
print(f"Verified: {doc}")
