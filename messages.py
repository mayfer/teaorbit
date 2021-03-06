import simplejson as json
from common import json_encode, json_decode
from decimal import Decimal
from geo import Geo
import config
import hashlib
import config

def recursive_json(obj):
    def serialize(obj):
        # recursively walk object's hierarchy
        if isinstance(obj, (bool, int, long, float, basestring)) or obj is None:
            return obj
        elif isinstance(obj, Decimal):
            return str(obj)
        elif isinstance(obj, dict):
            obj = obj.copy()
            for key in obj:
                obj[key] = serialize(obj[key])
            return obj
        elif isinstance(obj, list):
            return [serialize(item) for item in obj]
        elif isinstance(obj, tuple):
            return tuple(serialize([item for item in obj]))
        elif hasattr(obj, '__dict__'):
            # filter private attrs
            return serialize(dict([(key, val) for key, val in obj.__dict__.items() if not key.startswith('_')]))
        else:
            return repr(obj) # convert to string
    return json_encode(serialize(obj))


# data transfer object. defines attributes and serializes to json.
class DTO(object):
    def json(self):
        return recursive_json(self)

    @classmethod
    def from_json(cls, json_text):
        kwargs = json_decode(json_text)
        return cls(**kwargs)

class PingView(DTO):
    _action = 'ping'

    def __init__(self):
        pass

class ResponseView(DTO):
    def __init__(self, action=None, channel=None, body=None, errors=None):
        self.action = action
        self.body = body
        self.channel = channel
        self.errors = errors

class SessionView(DTO):
    _action = 'session'

    def __init__(self, session_id, color, public_id):
        self.session_id = session_id
        self.color = color
        self.public_id = public_id
        self.spiels_per_request = config.spiels_per_request

    @classmethod
    def from_model(cls, model, channel=''):
        return SessionView(
            session_id = model.session_id,
            color = model.color,
        )

class VersionView(DTO):
    _action = 'version'

    def __init__(self):
        self.version = config.version

class SpielView(DTO):
    _action = 'new_spiel'

    def __init__(self, id='', name='', spiel='', date=None, color=None, public_id=None):
        self.name = name
        self.spiel = spiel
        self.date = date
        self.color = color
        self.public_id = public_id

        self.id = self.json().__hash__()

class SpielsView(DTO):
    _action = 'spiels'

    def __init__(self, spiels=[]):
        self.spiels = spiels

class BlockView(DTO):
    _action = 'block'

    def __init__(self, block_id):
        self.block_id = block_id

class UserView(DTO):
    _action = 'user'

    def __init__(self, color, name):
        self.color = color
        self.name = name

class OnlineUsersView(DTO):
    _action = 'online'

    def __init__(self, num_online, users):
        self.num_online = num_online
        self.users = users

class KeepAliveView(DTO):
    _action = 'keep_alive'

    def __init__(self):
        self.version = config.version

class NumSpielsView(DTO):
    _action = 'num_spiels'

    def __init__(self, channel, num_spiels):
        self.channel = channel
        self.num_spiels = num_spiels

class LocationView(DTO):
    _action = 'location'

    def __init__(self, city, latitude, longitude):
        self.city = city
        self.latitude = latitude
        self.longitude = longitude

    def __repr__(self):
        return "[{city}] Lat: {latitude}, Lng: {longitude}".format(city=self.city, latitude=self.latitude, longitude=self.longitude)

# ++++++++++++++++++++++++++++

class ClientMessage(DTO):
    def __init__(self, body):
        self.chatroom = body.get('chatroom', '')
        self.latitude = body.get('latitude', 0)
        self.longitude = body.get('longitude', 0)
        self.room_id = self.chatroom

class HelloCM(ClientMessage):
    _action = 'hello'

    def __init__(self, body):
        super(HelloCM, self).__init__(body)
        self.name = body.get('name', '')
        self.channels = body.get('channels', '')

class StillOnlineCM(ClientMessage):
    _action = 'still_online'

    def __init__(self, body):
        super(StillOnlineCM, self).__init__(body)
        self.name = body.get('name', '')

class GetSpielsCM(ClientMessage):
    _action = 'get_spiels'

    def __init__(self, body):
        super(GetSpielsCM, self).__init__(body)
        self.since = body.get('since', None)
        self.until = body.get('until', None)

class PostSpielCM(ClientMessage):
    _action = 'post_spiel'

    def __init__(self, body):
        super(PostSpielCM, self).__init__(body)
        self.name = body.get('name', '')
        self.spiel = body.get('spiel', '')

class PostPrivateSpielCM(ClientMessage):
    _action = 'post_private_spiel'

    def __init__(self, body):
        super(PostSpielCM, self).__init__(body)
        self.name = body.get('name', '')
        self.spiel = body.get('spiel', '')
        self.to = body.get('to', '')

class SubscribeCM(ClientMessage):
    _action = 'subscribe'

    def __init__(self, body):
        super(SubscribeCM, self).__init__(body)
        self.channels = body.get('channels', '')
        self.since = body.get('since', '')
