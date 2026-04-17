from services.auth_service import signup_driver, get_preset_drivers
from schemas.auth import DriverSignupRequest
from database import get_database

db = get_database()
db.drivers.delete_many({'email': 'testdriver3@gmail.com'})

req = DriverSignupRequest(driverName='Live Driver', email='testdriver3@gmail.com', password='Password@123', phone='9876543210')
res = signup_driver(req)

db.drivers.update_one({'email': 'testdriver3@gmail.com'}, {
    '$set': {
        'location': {
            'type': 'Point',
            'coordinates': [72.877, 19.076]
        },
        'status': 'available',
        'occupied': False
    }
})

# Let's also verify preset drivers
presets = get_preset_drivers()
print("Preset drivers extracted successfully. Current test driver updated.")
print("Email:", "testdriver3@gmail.com")
print("Password:", "Password@123")
