from database import get_database
from services.driver_service import create_driver_offers

db = get_database()

# Find the most recently requests emergency
em_doc = db.emergencies.find_one({}, sort=[("created_at", -1)])
if not em_doc:
    print('No emergency found')
    exit(1)

em_id_str = str(em_doc["_id"])
print('Emergency ID:', em_id_str)

d = db.drivers.find_one({'email': 'testdriver3@gmail.com'})

# Create a VERY long-lived offer for async testing
offers = create_driver_offers(em_id_str, [{'driver_id': d['email'], 'name': d['name']}], ttl_seconds=604800)
print('Assigned long-lived offers:', offers)
