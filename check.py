import sys, os
from datetime import datetime
sys.path.append(os.getcwd())
from backend.database import get_emergencies_collection, get_drivers_collection

try:
    e_coll = get_emergencies_collection()
    d_coll = get_drivers_collection()

    emergencies = list(e_coll.find().sort("created_at", -1).limit(8))

    total_offers = 0
    satisfying = 0
    violating = 0

    for em in emergencies:
        offers = em.get("driver_offers", [])
        print(f"Emergency ID: {em.get('_id')}")
        for offer in offers:
            total_offers += 1
            d_id = offer.get("driver_id")
            driver = d_coll.find_one({"email": d_id})
            
            if driver:
                status = driver.get("dispatch_status")
                logged_in = driver.get("is_logged_in")
                last_login = driver.get("last_login_at")
                
                is_valid = status in ["online", "available"] and (logged_in is True or last_login is not None)
                print(f"  Driver: {d_id} | Status: {status} | Valid: {is_valid}")
                if is_valid: satisfying += 1
                else: violating += 1
            else:
                print(f"  Driver: {d_id} | NOT FOUND")
                violating += 1

    print("\n--- Summary ---")
    print(f"Total offers inspected: {total_offers}")
    print(f"Satisfying: {satisfying}")
    print(f"Violating: {violating}")
except Exception as e:
    print(f"Error: {e}")
