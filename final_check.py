import sys, os
from datetime import datetime
sys.path.append(os.getcwd())
try:
    from backend.database import get_emergencies_collection, get_drivers_collection
    e_coll = get_emergencies_collection()
    d_coll = get_drivers_collection()
    emergencies = list(e_coll.find().sort("created_at", -1).limit(8))
    total_offers, satisfying, violating = 0, 0, 0
    for em in emergencies:
        offers = em.get("driver_offers", [])
        for offer in offers:
            total_offers += 1
            d_id = offer.get("driver_id")
            driver = d_coll.find_one({"email": d_id})
            if driver:
                status = driver.get("dispatch_status")
                logged_in = driver.get("is_logged_in")
                last_login = driver.get("last_login_at")
                is_valid = status in ["online", "available"] and (logged_in is True or last_login is not None)
                print(f"Driver: {d_id} | Status: {status} | Valid: {is_valid}")
                if is_valid: satisfying += 1
                else: violating += 1
            else:
                violating += 1
    print(f"Total: {total_offers}, Satisfying: {satisfying}, Violating: {violating}")
except Exception as e:
    print(f"EXCEPTION: {e}")
