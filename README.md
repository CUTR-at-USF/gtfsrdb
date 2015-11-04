GTFSrDB - GTFS-realtime to Database
===================================

GTFSrDB loads GTFS-realtime data to a database.  

GTFSrDB supports all 3 types of GTFS-realtime feeds:

1. [TripUpdates](https://developers.google.com/transit/gtfs-realtime/trip-updates) - specify url with `-t` option
2. [Service Alerts](https://developers.google.com/transit/gtfs-realtime/service-alerts) - specify url with `-a` option
3. [VehiclePositions](https://developers.google.com/transit/gtfs-realtime/vehicle-positions) - specify url with `-p` option

You can process multiple types of GTFS-realtime feeds in the same execution by using multiple command line options.

GTFSrDB will run and keep a database up-to-date with the latest GTFSr data. It can also be used to
archive this data for historical or statistical purposes. GTFSrDB is designed to work in tandem 
with [gtfsdb](http://code.google.com/p/gtfsdb/).  GTFSrDB uses SQLAlchemy, so it should work with 
most any database system; So far its been used with SQLite, Postgres, and Microsoft SQL Server. 
Just specify a database url on the command line with `-d`.

### Example Use

1. Bay Area Rapid Transit with GTFS-realtime TripUpdates:

  a. Using SQLite:

    `gtfsrdb.py -t http://www.bart.gov/dev/gtrtfs/tripupdate.aspx -d sqlite:///test.db -c`

  b. Using Microsoft SQL Server (note you'll need [pyodbc](https://code.google.com/p/pyodbc/downloads/detail?name=pyodbc-3.0.6.win-amd64-py2.7.exe&can=2&q=)):

    `gtfsrdb.py -t http://www.bart.gov/dev/gtrtfs/tripupdate.aspx -d 
      mssql+pyodbc://<username>:<password>@<public_database_server_name>/<database_name> -c`

   So, if the `username=jdoe`, `password=pswd`, `public_database_server_name=my.public.database.org`, `database_name=gtfsrdb`, the command is:

    `gtfsrdb.py -t http://www.bart.gov/dev/gtrtfs/tripupdate.aspx -d 
      mssql+pyodbc://jdoe:pswd@my.public.database.org/gtfsrdb -c`

2. Massachusetts Bay Transportation Authority with GTFS-realtime VehiclePositions:

  a. Using SQLite:
  
    `gtfsrdb.py -p http://developer.mbta.com/lib/gtrtfs/Vehicles.pb -d sqlite:///test.db -c`

The model for the data is in `model.py`; you should be able to use this 
standalone with SQLAlchemy to process the data in Python.

The `-o` command line option instructs GTFSrDB to keep the database up-to-date by
deleting outdated trip updates, vehicle positions, and alerts. Omitting this option will cause
each update to be saved forever (useful for historical purposes). Note
that using this option will *ERASE ALL TRIP UPDATES, ALL ALERTS, and ALL VEHICLE POSITIONS* from
the database on each iteration - even those that were in the database
before the session was started.

This is GTFSrDB's biggest strength - if you pass the `-o` option, your
database will be perpetually up-to-date with the GTFS-realtime feed,
so you can write scripts &c that refer to it without worrying about
the plumbing to get the data in place.

Other command line parameters:

* `-w` = Time to wait between requests (in seconds) (default=30s)
* `-v` = Print generated SQL (verbose mode)
* `-l` = When multiple translations are available, prefer this language

It is recommended that you run VACUUM ANALYZE frequently, as GTFSrDB
generates quite a few creations and deletions.

KNOWN LIMITATIONS
=================
The following fields that are separate messages in GTFSr are collapsed
into columns in the parent in the SQL database (to avoid creating many
joined tables):

* TripUpdate.trip becomes trip_id, route_id, trip_start_time, trip_start_date
* TripUpdate.vehicle becomes vehicle_id, vehicle_label and
  vehicle_license_plate
* StopTimeUpdate.arrival becomes arrival_time, arrival_delay & 
  arrival_uncertainty
* StopTimeUpdate.departure becomes departure_time &c.
* Alert.active_period is condensed to Alert.start and Alert.end; if
  there are multiple active periods, only the first one is stored.
* All TranslatedStrings are converted to plain strings, using a) the
  language specified with the -l option, b) any untranslated string if
  a string for the language is not found, or c) the only string in the 
  case of a single string in the file.
* Position.latitude becomes position_latitude
* Position.longitude becomes position_longitude
* Position.bearing becomes position_bearing
* Position.speed becomes position_speed
* VehicleDescriptor.id becomes vehicle_id
* VehicleDescriptor.label becomes vehicle_label
* VehicleDescriptor.license_plate becomes vehicle_license_plate 

USING IT WITH GTFSDB
====================

It's not hard to use GTFSrDB in conjunction with GTFSDB. Simply point
GTFSrDB at a GTFSDB database, and it will add its data into the
database alongside the static GTFS data. Use the -c option to create
tables. You can then use SQL's relational features to mash up the data
any way you want. (Keep in mind that GTFS uses strings for IDs, and
SQL generally uses numbers. trip_updates and stop_time_updates, as
well as alerts and entity_selectors, are related on the oid column,
which is a sequential integer primary key. All of the GTFS ID fields
are left intact, for joining with the static data. You can't just cast
the strings to numbers; take a look at BART's stop IDs in the examples
below).

Here are some example queries (both designed to work with the -o option). Note 
that the first two are for BART, which embeds stop_ids in GTFSr; other agencies 
(e.g., TriMet) specify stops as trip_updates.trip_id and 
stop_time_updates.stop_sequence; you'll need to use slightly more complex
queries for those.

This query shows all of the stop time updates that relate cleanly to the stops table. 
Keep in mind that trips.trip_id = trip_updates.trip_id only works for trips that are not
frequency-expanded (i.e. multiple trips with the same trip_id)

    SELECT trips.route_id, trips.trip_id, trips.trip_headsign, trip_updates.schedule_relationship, stop_time_updates.stop_id, stop_time_updates.arrival_delay
    FROM trip_updates, stop_time_updates, trips
    WHERE trips.trip_id::text = trip_updates.trip_id::text AND trip_updates.oid = stop_time_updates.trip_update_id
    ORDER BY stop_time_updates.stop_id;

    route_id | trip_id |     trip_headsign     | schedule_relationship | stop_id | arrival_delay 
    ----------+---------+-----------------------+-----------------------+---------+---------------
    04       | 66F1    | FREMONT               | SCHEDULED             | 19TH    |             0
    12       | 67ED1   | EAST DUBLIN           | SCHEDULED             | 24TH    |             0
    11       | 66DCM2  | DALY CITY             | SCHEDULED             | BAYF    |             0
    12       | 65ED1   | EAST DUBLIN           | SCHEDULED             | CAST    |             0
    02       | 83PB1   | PITTSBURG / BAY POINT | SCHEDULED             | COLM    |             0
    03       | 67R1    | RICHMOND              | SCHEDULED             | COLS    |             0
    02       | 80PB1   | PITTSBURG / BAY POINT | SCHEDULED             | CONC    |             0
    12       | 69ED1   | EAST DUBLIN           | SCHEDULED             | DALY    |             0
    12       | 68ED1   | EAST DUBLIN           | SCHEDULED             | DALY    |             0
    04       | 67F1    | FREMONT               | SCHEDULED             | DELN    |             0
    11       | 69DCM2  | DALY CITY             | SCHEDULED             | DUBL    |             0
    11       | 67DCM2  | DALY CITY             | SCHEDULED             | DUBL    |             0
    11       | 68DCM2  | DALY CITY             | SCHEDULED             | DUBL    |             0
    03       | 69R1    | RICHMOND              | SCHEDULED             | FRMT    |             0
    03       | 70R1    | RICHMOND              | SCHEDULED             | FRMT    |             0
    11       | 64DCM2  | DALY CITY             | SCHEDULED             | GLEN    |             0
    12       | 66ED1   | EAST DUBLIN           | SCHEDULED             | LAKE    |             0
    03       | 66R1    | RICHMOND              | SCHEDULED             | MCAR    |             0
    02       | 81PB1   | PITTSBURG / BAY POINT | SCHEDULED             | MCAR    |             0
    02       | 85PB1   | PITTSBURG / BAY POINT | SCHEDULED             | MLBR    |             0
    02       | 82PB1   | PITTSBURG / BAY POINT | SCHEDULED             | POWL    |             0
    04       | 69F1    | FREMONT               | SCHEDULED             | RICH    |             0
    04       | 68F1    | FREMONT               | SCHEDULED             | RICH    |             0
    04       | 65F1    | FREMONT               | SCHEDULED             | SANL    |             0
    02       | 84PB1   | PITTSBURG / BAY POINT | SCHEDULED             | SFIA    |             0
    03       | 68R1    | RICHMOND              | SCHEDULED             | UCTY    |             0
    11       | 65DCM2  | DALY CITY             | SCHEDULED             | WOAK    |             0
    (27 rows)

This query gives you an overview of the entire BART system, with average delays for each stop 
where trains are predicted.  I may spatially enable this database and make a heatmap of where
delays are in a given transit system by interpolating between points.
    
    SELECT stops.stop_id, stops.stop_name, stops.stop_lat, stops.stop_lon, avg(stop_time_updates.arrival_delay) AS avg
    FROM stop_time_updates, stops
    WHERE stops.stop_id::text = stop_time_updates.stop_id::text
    GROUP BY stops.stop_id, stops.stop_name, stops.stop_lat, stops.stop_lon
    ORDER BY stops.stop_name;

    stop_id |           stop_name           |   stop_lat   |    stop_lon    |          avg           
    ---------+-------------------------------+--------------+----------------+------------------------
    BALB    | Balboa Park BART              | 37.721980868 | -122.447414196 | 0.00000000000000000000
    CIVC    | Civic Center/UN Plaza BART    | 37.779605587 | -122.413851084 | 0.00000000000000000000
    COLS    | Coliseum/Oakland Airport BART | 37.754281380 | -122.197788821 | 0.00000000000000000000
    DALY    | Daly City BART                | 37.706120549 | -122.469080674 | 0.00000000000000000000
    DUBL    | Dublin/Pleasanton BART        | 37.701673617 | -121.900352519 | 0.00000000000000000000
    EMBR    | Embarcadero BART              | 37.793022441 | -122.396813153 | 0.00000000000000000000
    FRMT    | Fremont BART                  | 37.557334282 | -121.976395442 | 0.00000000000000000000
    FTVL    | Fruitvale BART                | 37.774623806 | -122.224327698 | 0.00000000000000000000
    GLEN    | Glen Park BART                | 37.732941544 | -122.434114331 | 0.00000000000000000000
    HAYW    | Hayward Station BART          | 37.670386894 | -122.088002125 | 0.00000000000000000000
    LAKE    | Lake Merritt BART             | 37.797602372 | -122.265498391 | 0.00000000000000000000
    MLBR    | Millbrae BART                 | 37.600006000 | -122.386534000 | 0.00000000000000000000
    NBRK    | North Berkeley BART           | 37.874026140 | -122.283881911 | 0.00000000000000000000
    NCON    | North Concord/Martinez BART   | 38.002576647 | -122.025106029 | 0.00000000000000000000
    ORIN    | Orinda BART                   | 37.878360870 | -122.183791135 | 0.00000000000000000000
    PITT    | Pittsburg/Bay Point BART      | 38.018934339 | -121.941904488 | 0.00000000000000000000
    RICH    | Richmond BART                 | 37.937169908 | -122.353400100 | 0.00000000000000000000
    SFIA    | San Francisco Int BART        | 37.615900000 | -122.392534000 | 0.00000000000000000000
    SHAY    | South Hayward BART            | 37.634799539 | -122.057550587 | 0.00000000000000000000
    UCTY    | Union City BART               | 37.591202687 | -122.017857962 | 0.00000000000000000000
    WDUB    | West Dublin/Pleasanton BART   | 37.699800000 | -121.928100000 | 0.00000000000000000000
    WOAK    | West Oakland BART             | 37.804674760 | -122.294582214 | 0.00000000000000000000

A demo for TriMet
=================

GTFSrDB allows you to connect GTFS-realtime with an SQL database, allowing app developers to use realtime data through SQL, just as easily as they use static data. Rather than worry about plumbing to connect GTFS and GTFS-realtime, they can focus on writing apps.

It accomplishes two primary tasks:

* Keeping a database up-to-date with the latest realtime data, and
* Archiving historic real-time data.

It’s designed to work with GTFSdb; it will coexist with static GTFS data in a database, so you can easily relate them. Keep in mind that if you update the GTFS data, you’ll lose archived GTFSr data.
Here is an example query to find what stops have the largest delays (in seconds, for the TriMet system in Portland, OR:

    SELECT stops.stop_id, stops.stop_name, stops.stop_lat, stops.stop_lon, stop_delays.avg
    FROM stops, stop_delays
    WHERE stops.stop_id = stop_delays.stop_id
    ORDER BY avg DESC;

The stop_delays view looks like this:


    SELECT stop_times.stop_id, avg(stop_time_updates.arrival_delay) AS avg
    FROM stop_time_updates, stop_times, trip_updates
    WHERE stop_times.trip_id::text = trip_updates.trip_id::text AND stop_times.stop_sequence = stop_time_updates.stop_sequence AND stop_time_updates.trip_update_id = trip_updates.oid
    GROUP BY stop_times.stop_id
    ORDER BY avg(stop_time_updates.arrival_delay) DESC;

(I had to pull in the trip_updates table for TriMet because they don’t have a stop_id in their stop_time_updates; they instead specify trip_id and stop_sequence.)

(I’ve removed the lat and lon columns from the following table for readability)

    stop_id |            stop_name            |         avg
    ---------+---------------------------------+----------------------
    10853   | Parkrose/ Sumner Transit Center | 473.8260869565217391
    7999    | NE 82nd & MAX Overpass          | 350.3050847457627119
    9610    | Willow Creek Transit Center     | 310.2352941176470588
    5846    | Tigard Transit Center           | 260.2093023255813953
    12849   | 16200 Block SW Langer           | 244.6111111111111111
. . .
