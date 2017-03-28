#!/usr/bin/python

# gtfsrdb.py: load gtfs-realtime data to a database
# recommended to have the (static) GTFS data for the agency you are connecting
# to already loaded.

# Copyright 2011, 2013 Matt Conway

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
# Jorge Adorno

from optparse import OptionParser
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from urllib2 import urlopen
from model import *
import gtfs_realtime_pb2
import datetime
import time
import sys

p = OptionParser()

p.add_option('-t', '--trip-updates', dest='tripUpdates', default=None, 
             help='The trip updates URL', metavar='URL')

p.add_option('-a', '--alerts', default=None, dest='alerts', 
             help='The alerts URL', metavar='URL')

p.add_option('-p', '--vehicle-positions', dest='vehiclePositions', default=None, 
             help='The vehicle positions URL', metavar='URL')

p.add_option('-d', '--database', default=None, dest='dsn',
             help='Database connection string', metavar='DSN')

p.add_option('-o', '--discard-old', default=False, dest='deleteOld', 
             action='store_true', 
             help='Dicard old updates, so the database is always current')

p.add_option('-c', '--create-tables', default=False, dest='create',
             action='store_true', help="Create tables if they aren't found")

p.add_option('-w', '--wait', default=30, type='int', metavar='SECS',
             dest='timeout', help='Time to wait between requests (in seconds)')

p.add_option('-v', '--verbose', default=False, dest='verbose', 
             action='store_true', help='Print generated SQL')

p.add_option('-l', '--language', default='en', dest='lang', metavar='LANG',
             help='When multiple translations are available, prefer this language')

p.add_option('-1', '--once',  default=False, dest='once', action='store_true',
             help='only run the loader one time')

opts, args = p.parse_args()

if opts.dsn == None:
    print 'No database specified!'
    exit(1)

if opts.alerts == None and opts.tripUpdates == None and opts.vehiclePositions == None:
    print 'No trip updates, alerts, or vehicle positions URLs were specified!'
    exit(1)

if opts.alerts == None:
    print 'Warning: no alert URL specified, proceeding without alerts'

if opts.tripUpdates == None:
    print 'Warning: no trip update URL specified, proceeding without trip updates'

if opts.vehiclePositions == None:
    print 'Warning: no vehicle positions URL specified, proceeding without vehicle positions'
    
# Connect to the database
engine = create_engine(opts.dsn, echo=opts.verbose)
# sessionmaker returns a class
session = sessionmaker(bind=engine)()

# Check if it has the tables
# Base from model.py
for table in Base.metadata.tables.keys():
    if not engine.has_table(table):
        if opts.create:
            print 'Creating table %s' % table
            Base.metadata.tables[table].create(engine)
        else:
            print 'Missing table %s! Use -c to create it.' % table
            exit(1)

# Get a specific translation from a TranslatedString
def getTrans(string, lang):
    # If we don't find the requested language, return this
    untranslated = None

    # single translation, return it
    if len(string.translation) == 1:
        return string.translation[0].text

    for t in string.translation:
        if t.language == lang:
            return t.text
        if t.language == None:
            untranslated = t.text
    return untranslated

try:
    keep_running = True
    while keep_running:
        try:
        #if True:
            if opts.deleteOld:
                # Go through all of the tables that we create, clear them
                # Don't mess with other tables (i.e., tables from static GTFS)
                for theClass in AllClasses:
                    for obj in session.query(theClass):
                        session.delete(obj)

            if opts.tripUpdates:
                fm = gtfs_realtime_pb2.FeedMessage()
                fm.ParseFromString(
                    urlopen(opts.tripUpdates).read()
                    )

                # Convert this a Python object, and save it to be placed into each
                # trip_update
                timestamp = datetime.datetime.utcfromtimestamp(fm.header.timestamp)

                # Check the feed version
                if fm.header.gtfs_realtime_version != u'1.0':
                    print 'Warning: feed version has changed: found %s, expected 1.0' % fm.header.gtfs_realtime_version

                print 'Adding %s trip updates' % len(fm.entity)
                for entity in fm.entity:

                    tu = entity.trip_update

                    dbtu = TripUpdate(
                        trip_id = tu.trip.trip_id,
                        route_id = tu.trip.route_id,
                        trip_start_time = tu.trip.start_time,
                        trip_start_date = tu.trip.start_date,

                        # get the schedule relationship
                        # This is somewhat undocumented, but by referencing the 
                        # DESCRIPTOR.enum_types_by_name, you get a dict of enum types
                        # as described at http://code.google.com/apis/protocolbuffers/docs/reference/python/google.protobuf.descriptor.EnumDescriptor-class.html
                        schedule_relationship = tu.trip.DESCRIPTOR.enum_types_by_name['ScheduleRelationship'].values_by_number[tu.trip.schedule_relationship].name,

                        vehicle_id = tu.vehicle.id,
                        vehicle_label = tu.vehicle.label,
                        vehicle_license_plate = tu.vehicle.license_plate,
                        timestamp = timestamp)

                    for stu in tu.stop_time_update:
                        dbstu = StopTimeUpdate(
                            stop_sequence = stu.stop_sequence,
                            stop_id = stu.stop_id,
                            arrival_delay = stu.arrival.delay,
                            arrival_time = stu.arrival.time,
                            arrival_uncertainty = stu.arrival.uncertainty,
                            departure_delay = stu.departure.delay,
                            departure_time = stu.departure.time,
                            departure_uncertainty = stu.departure.uncertainty,
                            schedule_relationship = tu.trip.DESCRIPTOR.enum_types_by_name['ScheduleRelationship'].values_by_number[tu.trip.schedule_relationship].name
                            )
                        session.add(dbstu)
                        dbtu.StopTimeUpdates.append(dbstu)

                    session.add(dbtu)

            if opts.alerts:
                fm = gtfs_realtime_pb2.FeedMessage()
                fm.ParseFromString(
                    urlopen(opts.alerts).read()
                    )

                # Convert this a Python object, and save it to be placed into each
                # trip_update
                timestamp = datetime.datetime.utcfromtimestamp(fm.header.timestamp)

                # Check the feed version
                if fm.header.gtfs_realtime_version != u'1.0':
                    print 'Warning: feed version has changed: found %s, expected 1.0' % fm.header.gtfs_realtime_version

                    print 'Adding %s alerts' % len(fm.entity)
                    for entity in fm.entity:
                        alert = entity.alert
                        dbalert = Alert(
                            start = alert.active_period[0].start,
                            end = alert.active_period[0].end,
                            cause = alert.DESCRIPTOR.enum_types_by_name['Cause'].values_by_number[alert.cause].name,
                            effect = alert.DESCRIPTOR.enum_types_by_name['Effect'].values_by_number[alert.effect].name,
                            url = getTrans(alert.url, opts.lang),
                            header_text = getTrans(alert.header_text, opts.lang),
                            description_text = getTrans(alert.description_text,
                                                        opts.lang)
                            )

                        session.add(dbalert)
                        for ie in alert.informed_entity:
                            dbie = EntitySelector(
                                agency_id = ie.agency_id,
                                route_id = ie.route_id,
                                route_type = ie.route_type,
                                stop_id = ie.stop_id,

                                trip_id = ie.trip.trip_id,
                                trip_route_id = ie.trip.route_id,
                                trip_start_time = ie.trip.start_time,
                                trip_start_date = ie.trip.start_date)
                            session.add(dbie)
                            dbalert.InformedEntities.append(dbie)
            if opts.vehiclePositions:
                fm = gtfs_realtime_pb2.FeedMessage()
                fm.ParseFromString(
                    urlopen(opts.vehiclePositions).read()
                    )

                # Convert this a Python object, and save it to be placed into each
                # vehicle_position
                timestamp = datetime.datetime.utcfromtimestamp(fm.header.timestamp)

                # Check the feed version
                if fm.header.gtfs_realtime_version != u'1.0':
                    print 'Warning: feed version has changed: found %s, expected 1.0' % fm.header.gtfs_realtime_version

                print 'Adding %s vehicle_positions' % len(fm.entity)
                for entity in fm.entity:

                    vp = entity.vehicle

                    dbvp = VehiclePosition(
                        trip_id = vp.trip.trip_id,
                        route_id = vp.trip.route_id,
                        trip_start_time = vp.trip.start_time,
                        trip_start_date = vp.trip.start_date,                      
                        vehicle_id = vp.vehicle.id,
                        vehicle_label = vp.vehicle.label,
                        vehicle_license_plate = vp.vehicle.license_plate,
                        position_latitude = vp.position.latitude,
                        position_longitude = vp.position.longitude,
                        position_bearing = vp.position.bearing,
                        position_speed = vp.position.speed,
                        occupancy_status = gtfs_realtime_pb2.VehicleDescriptor.OccupancyStatus.DESCRIPTOR.values_by_number[vp.occupancy_status].name,
                        timestamp = timestamp)
                    
                    session.add(dbvp)

            # This does deletes and adds, since it's atomic it never leaves us
            # without data
            session.commit()
        except:
        #else:
            print 'Exception occurred in iteration'
            print sys.exc_info()


        # put this outside the try...except so it won't be skipped when something 
        # fails
        # also, makes it easier to end the process with ctrl-c, b/c a 
        # KeyboardInterrupt here will end the program (cleanly)
        if opts.once:
            print "Executed the load ONCE ... going to stop now..."
            keep_running = False
        else:
            time.sleep(opts.timeout)

finally:
    print "Closing session . . ."
    session.close()
