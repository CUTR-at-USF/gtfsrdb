#!/usr/bin/python

# delays.py: return JSON of the current average delays
# Copyright 2011 Matt Conway

# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at

#   http://www.apache.org/licenses/LICENSE-2.0

# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Authors:
# Matt Conway: main code

# This is hardcoded for trimet right now
# Yes, I realize I published my database username and password on the 
# Internet
DB_URL = 'postgres://gtfs:generaltransit@localhost/trimet'

import sqlalchemy
import sqlalchemy.orm
import json
import cgi
import cgitb; cgitb.enable()

# sessionmaker returns a class, we must instantiate it
sess = sqlalchemy.orm.sessionmaker(bind=sqlalchemy.create_engine(DB_URL))()

# specify it in order here, so we can zip it with the data later, to create
# a dict
columnNames = ('stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'avg')

# All the fancy SQL is done in views, this lets the DBA worry about
# agency-specific details (e.g. use of trip_id/stop_sequence or stop_id)
q = sess.query(*columnNames).\
    from_statement('SELECT * FROM delays')

result = []
for updateRaw in q.all():
    # Get the column names in there and make it a dict
    update = dict(zip(columnNames, updateRaw))

    # Fix the float columns, convert them to Python floats
    for col in ('stop_lat', 'stop_lon', 'avg'):
        update[col] = float(update[col])

    result.append(update)

print 'Content-Type: application/json'
print

print json.dumps(result)
