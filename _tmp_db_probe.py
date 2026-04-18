import sys
import os
import re
from datetime import datetime

sys.path.append(os.path.abspath('backend'))
try:
    from database import get_database, get_drivers_collection, get_emergencies_collection
    db = get_database()
    drivers_col = get_drivers_collection()
    emergencies_col = get_emergencies_collection()
    
    print(f"DB_NAME: {db.name}")
    
    # Eligible: online/available AND (is_logged_in is True OR last_login_at exists) AND not sim email
    q_eligible = {
        'dispatch_status': {'$in': ['online', 'available']},
        '$or': [{'is_logged_in': True}, {'last_login_at': {'$ne': None}}],
        'email': {'$not': re.compile(r'^sim\.mumbai\.driver\d+@codered\.ai$')}
    }
    eligible_drivers = list(drivers_col.find(q_eligible))
    print(f"ELIGIBLE_COUNT: {len(eligible_drivers)}")
    print(f"ELIGIBLE_EMAILS: {[d['email'] for d in eligible_drivers[:10]]}")

    # Online/Available non-sim
    q_all_online = {
        'dispatch_status': {'$in': ['online', 'available']},
        'email': {'$not': re.compile(r'^sim\.mumbai\.driver\d+@codered\.ai$')}
    }
    all_online = list(drivers_col.find(q_all_online))
    print(f"ONLINE_OR_AVAILABLE_NON_SIM_COUNT: {len(all_online)}")
    print(f"ONLINE_EMAILS: {[d['email'] for d in all_online[:10]]}")

    # Latest Emergency
    latest_em = list(emergencies_col.find().sort('created_at', -1).limit(1))
    if latest_em:
        em = latest_em[0]
        offers = em.get('driver_offers', [])
        offer_summary = [f"{o.get('driver_id')}:{o.get('status')}:{o.get('expires_at')}" for o in offers]
        print(f"LATEST_EM: ID={em.get('_id')} STATUS={em.get('status')} CREATED_AT={em.get('created_at')}")
        print(f"DRIVER_OFFERS: {offer_summary}")
    else:
        print("LATEST_EM: None")

except Exception as e:
    print(f"ERROR: {e}")
