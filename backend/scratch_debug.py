from database import get_drivers_collection, get_emergencies_collection

drivers = list(get_drivers_collection().find({}, {"email":1, "name":1, "dispatch_status":1, "location":1, "_id":0}).limit(5))
print(f"DRIVERS IN DB: {len(drivers)}")
for d in drivers:
    loc = d.get("location", "NONE")
    coords = loc.get("coordinates", "N/A") if isinstance(loc, dict) else "N/A"
    print(f"  email={d.get('email','?')} | status={d.get('dispatch_status','N/A')} | coords={coords}")

emgs = list(get_emergencies_collection().find(
    {"status": {"$nin": ["COMPLETED","CANCELLED"]}},
    {"status":1, "assigned_driver_id":1, "driver_offers":1, "phone_number":1}
).sort("created_at", -1).limit(3))

print(f"\nACTIVE EMERGENCIES: {len(emgs)}")
for e in emgs:
    offers = e.get("driver_offers", [])
    print(f"  id={str(e['_id'])[:12]} | status={e.get('status')} | assigned_driver={e.get('assigned_driver_id','none')} | offers={len(offers)}")
    for o in offers[:3]:
        print(f"    offer: driver={o.get('driver_id')} status={o.get('status')} expires={o.get('expires_at','?')}")
