import asyncio
from database import get_hospitals_collection
from pymongo import GEOSPHERE

collection = get_hospitals_collection()

# Print total
print('Total hospitals:', collection.count_documents({}))
print('Active hospitals:', collection.count_documents({'status': 'active'}))
print('Hospitals with beds:', collection.count_documents({'available_beds': {'$gt': 0}}))

# Just fetch one to see its format
docs = list(collection.find({}).limit(1))
for doc in docs:
    print('Sample:', {k: doc[k] for k in doc if k != '_id'})
