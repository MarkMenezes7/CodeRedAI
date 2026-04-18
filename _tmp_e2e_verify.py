import sys
import os
import re
import json
from bson import ObjectId

sys.path.append(os.path.abspath('backend'))
from database import get_database, get_drivers_collection, get_emergencies_collection

def json_serial(obj):
    if isinstance(obj, ObjectId):
        return str(obj)
    if hasattr(obj, 'isoformat'):
        return obj.isoformat()
    return str(obj)

db = get_database()
print(f"DB_NAME: {db.name}")

drivers_col = get_drivers_collection()
emerg_col = get_emergencies_collection()

sim_regex = re.compile(r'^sim\.mumbai\.driver\d+@codered\.ai$')

# Eligible drivers
q_eligible = {
    'dispatch_status': {'': ['online', 'available']},
    '': [
        {'is_logged_in': True},
        {'last_login_at': {'': None}}
    ]
}
all_eligible = [d for d in drivers_col.find(q_eligible) if not sim_regex.match(d.get('email', ''))]

print(f"ELIGIBLE_COUNT: {len(all_eligible)}")
print("ELIGIBLE_DRIVERS:")
print(json.dumps([{
    'email': d.get('email'),
    'dispatch_status': d.get('dispatch_status'),
    'is_logged_in': d.get('is_logged_in'),
    'last_login_at': json_serial(d.get('last_login_at')),
    'location': d.get('location')
} for d in all_eligible[:10]], indent=2))

# Non-sim online/available (diagnosis)
q_diag = {'dispatch_status': {'': ['online', 'available']}}
diag_drivers = [d for d in drivers_col.find(q_diag) if not sim_regex.match(d.get('email', ''))]
print("DIAGNOSIS_DRIVERS:")
print(json.dumps([{
    'email': d.get('email'),
    'dispatch_status': d.get('dispatch_status'),
    'is_logged_in': d.get('is_logged_in')
} for d in diag_drivers[:10]], indent=2))

# Emergencies
emergencies = list(emerg_col.find().sort('created_at', -1).limit(3))
print("LATEST_EMERGENCIES:")
print(json.dumps([{
    'id': json_serial(e.get('_id')),
    'status': e.get('status'),
    'created_at': json_serial(e.get('created_at')),
    'offers_count': len(e.get('driver_offers', []))
} for e in emergencies], indent=2))
