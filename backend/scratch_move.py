from database import get_database

db = get_database()
db.drivers.update_one(
    {'email': 'testdriver3@gmail.com'},
    {'$set': {'location': {'type': 'Point', 'coordinates': [72.855, 19.243]}}}
)
print('Updated testdriver3 to coordinate 19.243, 72.855')
