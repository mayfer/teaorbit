from django.core.management.base import BaseCommand, CommandError
from optparse import make_option
import os
import sys

def test():
    print "fired"

class Command(BaseCommand):
    option_list = BaseCommand.option_list + (
        make_option('--reload', action='store_true',
            dest='use_reloader', default=False,
            help="Tells Tornado to use auto-reloader."),
        make_option('--admin', action='store_true',
            dest='admin_media', default=False,
            help="Serve admin media."),
        make_option('--adminmedia', dest='admin_media_path', default='',
            help="Specifies the directory from which to serve admin media."),
        make_option('--noxheaders', action='store_false',
            dest='xheaders', default=True,
            help="Tells Tornado to NOT override remote IP with X-Real-IP."),
        make_option('--nokeepalive', action='store_true',
            dest='no_keep_alive', default=False,
            help="Tells Tornado to NOT keep alive http connections."),
    )
    help = "Starts a Tornado Web."
    args = '[optional port number, or ipaddr:port]'

    # Validation is called explicitly each time the server is reloaded.
    requires_model_validation = False

    def handle(self, addrport='', *args, **options):
        import django
        from django.core.handlers.wsgi import WSGIHandler
        from tornado import httpserver, wsgi, ioloop, web
        from sockjs.tornado import SockJSRouter, SockJSConnection
        from teaorbit.updates import Connection

        # reopen stdout/stderr file descriptor with write mode
        # and 0 as the buffer size (unbuffered).
        # XXX: why?
        sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', 0)
        sys.stderr = os.fdopen(sys.stderr.fileno(), 'w', 0)

        if args:
            raise CommandError('Usage is runserver %s' % self.args)
        if not addrport:
            addr = ''
            port = '8000'
        else:
            try:
                addr, port = addrport.split(':')
            except ValueError:
                addr, port = '', addrport
        if not addr:
            addr = '127.0.0.1'

        if not port.isdigit():
            raise CommandError("%r is not a valid port number." % port)

        use_reloader = options.get('use_reloader', False)

        serve_admin_media = options.get('admin_media', False)
        admin_media_path = options.get('admin_media_path', '')

        xheaders = options.get('xheaders', True)
        no_keep_alive = options.get('no_keep_alive', False)

        shutdown_message = options.get('shutdown_message', '')
        quit_command = (sys.platform == 'win32') and 'CTRL-BREAK' or 'CONTROL-C'

        def inner_run():
            from django.conf import settings
            from django.utils import translation
            print "Validating models..."
            self.validate(display_num_errors=True)
            print "\nDjango version %s, using settings %r" % (django.get_version(), settings.SETTINGS_MODULE)
            print "Server is running at http://%s:%s/" % (addr, port)
            print "Quit the server with %s." % quit_command

            # django.core.management.base forces the locate to en-us. We
            # should set it up correctly for the first request
            # (particularly important in the not "--reload" case).
            translation.activate(settings.LANGUAGE_CODE)

            try:
                # Instance Django's wsgi handler.
                if serve_admin_media:
                    # Enable admin media wsgi middleware.
                    # Only use it in development mode!.
                    from django.core.servers.basehttp import AdminMediaHandler
                    application = AdminMediaHandler(WSGIHandler(),
                                                    admin_media_path)
                else:
                    application = WSGIHandler()

                # Wrap Django's wsgi application on Tornado's wsgi
                # container.
                container = wsgi.WSGIContainer(application)
                UpdateHandler = SockJSRouter(Connection, '/updates')

                tornado_app = web.Application( UpdateHandler.urls + [
                    ('.*', web.FallbackHandler, dict(fallback=container)),
                ])

                # start tornado web server in single-threaded mode
                # instead auto pre-fork mode with bind/start.
                http_server = httpserver.HTTPServer(tornado_app, xheaders=xheaders, no_keep_alive=no_keep_alive)
                http_server.listen(int(port), address=addr)

                main_loop = ioloop.IOLoop.instance()
                main_loop.start()

            except KeyboardInterrupt:
                if shutdown_message:
                    print shutdown_message
                sys.exit(0)

        if use_reloader:
            # Use tornado reload to handle IOLoop restarting.
            from tornado import autoreload
            autoreload.start()

        inner_run()
