from tornado import web, ioloop
from sockjs.tornado import SockJSRouter, SockJSConnection
from db import History
from common import json_encode, json_decode, unix_now, unix_now_ms
from errors import InvalidMessageError
from messages import DTO, ResponseView, SpielView, SessionView, BlockView, OnlineUsersView, SpielsView, PingView, UserView, KeepAliveView, VersionView
from messages import HelloCM, StillOnlineCM, GetSpielsCM, PostSpielCM, PostPrivateSpielCM
from models import Session, RoomSession
import actions

class Connection(SockJSConnection):
    participants = set()
    connections = {}
    room_sessions = {}
    db = History()

    message_actions = {
        HelloCM: actions.hello,
        StillOnlineCM: actions.still_online,
        GetSpielsCM: actions.get_spiels,
        PostSpielCM: actions.post_spiel,
    }

    def __init__(self, *args, **kwargs):
        self.client_messages = {}
        for msg_class, action in self.message_actions.items():
            self.client_messages[msg_class._action] = msg_class

        super(Connection, self).__init__(*args, **kwargs)

    def on_open(self, info):
        if 'session' in info.cookies:
            self.session_id = info.cookies['session'].value
        else:
            self.session_id = self.session.session_id

        # update online count every minute
        periodic = ioloop.PeriodicCallback(self.update_online, 60000)
        periodic.start()

    def on_message(self, text):
        message_dict = json_decode(text)
        if 'action' not in message_dict.keys():
            raise InvalidMessageError

        action = message_dict['action']
        message = self.client_messages[action](message_dict['body'])
        action = self.message_actions[message.__class__]
        return action(self, message)

    def _update_name(self, name):
        prev_name = self.room_sessions[self.room_id][self.session_id].name
        if name != prev_name:
            self.room_sessions[self.room_id][self.session_id].name = name
            # and then notify everyone of new name
            self.broadcast_online_users(self.room_id)

    def add_online(self, connection, room_id, session_id, name=''):
        self.room_id = room_id
        self.participants.add(self)

        player = self.db.get_player(self.session_id)
        if player is None:
            player = self.db.add_player(self.session_id)

        self.send_obj(SessionView(self.session_id, color=player.color))

        if room_id not in self.connections.keys():
            self.connections[room_id] = {}
        if room_id not in self.room_sessions.keys():
            self.room_sessions[room_id] = {}

        self.connections[room_id][session_id] = self

        last_active = unix_now_ms()

        session = Session(session_id=session_id, color=player.color, last_active=last_active, public_id=player.public_id)
        self.current_session = session

        self.room_sessions[room_id][session_id] = RoomSession(name=name, session=session)

        self.send_obj(BlockView(room_id))

        self.broadcast_online_users(room_id)

    def remove_online(self, room_id, session_id, connection):
        try:
            self.participants.remove(connection)
            self.connections[room_id].pop(session_id, None)
            self.room_sessions[room_id].pop(session_id, None)
        except:
            pass

        self.broadcast_online_users(room_id)

    def update_online(self):
        # ping = PingView()
        # self.send_obj(ping)
        allowed_inactive = 10000 # 120000
        now = unix_now_ms()
        if hasattr(self, 'current_session'):
            session = self.current_session
            if session.last_active < now - allowed_inactive:
                self.remove_online(self.room_id, session.session_id, self.connections[self.room_id].get(session.session_id, None))

    def broadcast_online_users(self, room_id):
        users = [ UserView(color=roomsession.session.color, name=roomsession.name) for roomsession in self.room_sessions[room_id].values() ]
        online = OnlineUsersView(len(users), users)
        self.broadcast_obj(online, self.connections.get(room_id, {} ).values())

    def on_close(self):
        session_id = self.session_id
        room_id = self.room_id
        self.remove_online(room_id=room_id, session_id=session_id, connection=self)
        self.broadcast_online_users(room_id)

    def debug(self, log):
        print log

    def response(self, dto):
        return ResponseView(action=dto._action, body=dto).json()

    def send_obj(self, dto):
        self.send(self.response(dto))

    def notify_recipients(self, room_id, spiel):
        recipients = self.connections[room_id].values()
        self.broadcast(recipients, self.response(spiel))

    def broadcast_text(self, text):
        json_message = json_encode({'action': 'log', 'body': {'message': text}})
        self.broadcast(self.participants, json_message)

    def broadcast_obj(self, dto, recipients):
        self.broadcast(recipients, self.response(dto))

