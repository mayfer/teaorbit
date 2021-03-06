import MySQLdb
import MySQLdb.cursors as cursors
import math
import geoip2.database
from geoip2.errors import AddressNotFoundError
import config
import os

class Geo(object):
    connection = MySQLdb.connect(
        host='localhost',
        user='root',
        passwd='',
        db='teaorbit',
        cursorclass=cursors.SSCursor,
    )
    cursor = connection.cursor(cursors.DictCursor)
    geoip = geoip2.database.Reader(os.path.join(os.path.dirname(__file__), config.geoip_data_path))

    def __init__(self):
        pass

    @classmethod
    def get_channels_within_bounds(cls, location1, location2):
        top = max(location1.latitude, location2.latitude)
        bottom = min(location1.latitude, location2.latitude)
        left = min(location1.longitude, location2.longitude)
        right = max(location1.longitude, location2.longitude)

        query = "SELECT * FROM geo WHERE latitude < :right AND latitude > :left AND longitude < :top AND longitude > :bottom"
        cls.cursor.execute(query, {'top': top, 'right': right, 'bottom': bottom, 'left': left})
        results = []
        for row in cls.cursor:
            results.append(row)
        return results

    @classmethod
    def get_location_from_ip(cls, ip_address):
        try:
            location = cls.geoip.city(ip_address)
        except AddressNotFoundError:
            location = None
        return location

