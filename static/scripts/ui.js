function UI() {
    var this_ui = this;

    if(window.require) {
        this_ui.gui = require('nw.gui'); 
        this_ui.nw = this_ui.gui.Window.get();
        var nativeMenuBar = new this_ui.gui.Menu({ type: "menubar" });
        try {
            nativeMenuBar.createMacBuiltin("tea orbit");
            this_ui.nw.menu = nativeMenuBar;
        } catch (ex) {
        }
        $(document).on('click', 'a', function(e) {
            var url = $(this).attr('href');
            if($(this).get(0).host != window.location.host) {
                e.preventDefault();
                this_ui.gui.Shell.openExternal(url);
            }
        });
    }

    this.last_spiel_date = 0;
    this.first_spiel_date = 2147483648000;
    this.added_spiel_ids = [];
    this.channels_visible = false;

    function toHashtagUrl(hashtag) {
        var full = location.protocol+'//'+location.hostname+(location.port ? ':'+location.port: '');
        return full + '/' + hashtag;
    }

    this.flags = {
        chatCssUpdated: false,
        windowFocused: true,
        newMessages: 0,
    }

    this.global_cookie = function(key, val) {
        try {
            key = "global:" + key;
            if(val === undefined) {
                return window.localStorage.getItem(key);
            } else {
                return window.localStorage.setItem(key, val);
            }
            
        } catch(err) {
            if($.cookie('teaorbit:global')) {
                var cookie = JSON.parse($.cookie('teaorbit:global'));
            } else {
                var cookie = {};
            }

            if(val === undefined) {
                if(key in cookie) {
                    return cookie[key];
                } else {
                    return undefined;
                }
            } else {
                cookie[key] = val;
                return $.cookie('teaorbit:global', JSON.stringify(cookie), { expires: 1000, path: '/' });
            }
        }
    }

    this.channel_cookie = function(key, val) {

        try {
            key = "chatroom:" + window.chatroom + ":" + key;
            if(val === undefined) {
                return window.localStorage.getItem(key);
            } else {
                return window.localStorage.setItem(key, val);
            }
        } catch(err) {

            if($.cookie('teaorbit')) {
                var cookie = JSON.parse($.cookie('teaorbit'));
            } else {
                var cookie = {};
            }

            if(val === undefined) {
                if(window.chatroom in cookie && key in cookie[window.chatroom]) {
                    return cookie[window.chatroom][key];
                } else {
                    return undefined;
                }
            } else {
                if(!(window.chatroom in cookie)) {
                    cookie[window.chatroom] = {}
                }
                cookie[window.chatroom][key] = val;
                return $.cookie('teaorbit', JSON.stringify(cookie), { expires: 1000, path: '/' });
            }
        }
    }

    this.last_message = function(channel) {
        return parseInt(JSON.parse(this.global_cookie('channels'))[channel]);
    }

    this.mute = function() {
        $('#audio').addClass('icon-volume-mute').removeClass('icon-volume-medium');
        this_ui.flags.mute = true;
        this_ui.global_cookie('mute', this_ui.flags.mute);
    }
    this.unmute = function() {
        $('#audio').addClass('icon-volume-medium').removeClass('icon-volume-mute');
        this_ui.flags.mute = false;
        this_ui.global_cookie('mute', this_ui.flags.mute);
        if(window.webkitNotifications !== undefined) {
            window.webkitNotifications.requestPermission();
        }
    }
    
    this.setup_audio = function() {
        $('<audio id="notification"><source src="'+window.static_url+'notification.ogg" type="audio/ogg"><source src="'+window.static_url+'notification.mp3" type="audio/mpeg"><source src="'+window.static_url+'notification.wav" type="audio/wav"></audio>').appendTo('body');

        var mute = this_ui.global_cookie('mute');
        if(mute === true) {
            this_ui.mute();
        } else {
            this_ui.unmute();
        }
        $('#audio').bind('touchend click', function(e){
            e.preventDefault();
            if(this_ui.flags.mute === true) {
                this_ui.unmute()
            } else {
                this_ui.mute()
            }
        });
    }

    this.get_channels = function() {
        if(window.channels_cache == undefined) {
            var channels = this.global_cookie('channels');
            if(!channels){
                channels = {};
            } else {
                channels = JSON.parse(channels);
            }
            window.channels_cache = channels;
        }
        return window.channels_cache;
    }

    this.touch_channel = function(channel) {
        var channels = this.get_channels();
        channels[window.chatroom] = parseInt((new Date().getTime() ));
        this.global_cookie('channels', JSON.stringify(channels));
    }

    this.init = function(client) {
        this.setup_audio();

        if(window.chatroom) {
            var channels = window.ui.get_channels();
            window.networking = Networking(window.chatroom, null, channels);

            window.latitude = 0;
            window.longitude = 0;
            window.gps_accuracy = 0;

            $('#loader').hide();
            this.touch_channel(window.channel);
        } else {
            $('#loader').show();
            navigator.geolocation.getCurrentPosition(function(position){
                window.latitude = position.coords.latitude;
                window.longitude = position.coords.longitude;
                window.gps_accuracy = position.coords.accuracy;

                //window.networking = Networking();
                $('#loader').hide();
            }, function(error){
                $('#loader .inner .title').html('<span class="error">Failed</span> getting location');
                $('#loader .inner .details').html('You probably have location services turned off.');
            });
        }

    
        $('#load-more').on('click', function(e) {
            e.preventDefault();
            window.networking.send('get_spiels', {
                'latitude': window.latitude,
                'longitude': window.longitude,
                'chatroom': window.chatroom,
                'until': this_ui.first_spiel_date,
            });
        });

        var spam = {
            counter: 0,
            antiNeeded: false,
            timers: 0
        };

        var spamFilter = function(){
            spam.counter = spam.counter + 1
            if(spam.counter > 3){
                $("#post .submit").show();
                $("textarea").css("width", "calc(80% - 384px)"); //this isn't exactly responsive... doesn't fit in smaller windows.
                spam.antiNeeded = true;
            }
            spam.timers = spam.timers + 1
            window.setTimeout(function(){
                if(spam.timers <= 1){
                    spam.counter = 0
                    spam.timers = 0
                } else {
                    spam.timers = spam.timers - 1
                };
            }, 3000);
        }

        $('#post form').on('submit', function(e){
            spamFilter();
            e.preventDefault();
            var latitude = window.latitude;
            var longitude = window.longitude;
            var chatroom = window.chatroom
            var accuracy = window.gps_accuracy;
            
            if(chatroom || (latitude && longitude)) {
                var spiel_id = uuid();
                $(this).find('input[name="latitude"]').val(latitude);
                $(this).find('input[name="longitude"]').val(longitude);
                $(this).find('input[name="chatroom"]').val(chatroom);
                $(this).find('input[name="spiel_id"]').val(spiel_id);
                var form = $(this).serializeJSON();
                window.networking.send('post_spiel', form);

                $(this).find('textarea[name="spiel"]').val('').trigger('autosize.resize');
                $('#type-here').focus();
            } else {
                //alert("No location data. Please allow the browser geolocation access.");
            }
        });

        var name = this_ui.channel_cookie("name");
        if(name) {
            $('#name').val(name);
        }
        $('#name').change(function(e){
            var name = $('input[name="name"]').val();
            this_ui.channel_cookie("name", name);
        });

        $('#show-channels').bind('click touchstart', function(e){
            e.preventDefault();
            this_ui.toggle_channels(e);
        });

        var focused = function(e){
            document.title = window.title;
            this_ui.flags.windowFocused = true;
            this_ui.flags.newMessages = 0;
            if(this_ui.nw) {
                this_ui.nw.setBadgeLabel("");
            }
        }

        var blurred = function(e){
            this_ui.flags.windowFocused = false;
        }

        $(window).focus(focused);
        $(window).blur(blurred);

        if(this_ui.nw) {
            this_ui.nw.on('focus', focused);
            this_ui.nw.on('blur', blurred);
        }

        $('<div>').attr('id', 'online-users').addClass('popup').appendTo('body');
        $('#num-online').bind('click touchstart', function(e){
            e.preventDefault();
            var online_elem = $('#num-online');
            var channels_elem = $('#show-channels');
            var offset = online_elem.offset();
            $('#online-users')
                .css({
                    'position': 'absolute',
                    'top': (offset.top + online_elem.height()) + 'px',
                    'left': (offset.left - 100) + 'px',
                    'right': channels_elem.outerWidth() + 'px',
                })
                .toggle();
        });

        $.timeago.settings.allowFuture = true;
        $('textarea').autosize();
        $('textarea').keydown(function (e) {
            // enter key
            if (e.keyCode == 13 && !e.shiftKey && !spam.antiNeeded) {
                $(this.form).submit();
                e.preventDefault();
                e.stopPropagation();
            }

            this_ui.align_chat_window();
            if(!this_ui.manually_scrolled() || e.keyCode == 13) {
                this_ui.scroll();
            }
         });
        $('input, textarea').bind('touchstart', function(e){
            $(this).focus();
        });

        $("#post .submit").on('click', function (e){
            $(this.form).submit();
            e.preventDefault();
            e.stopPropagation();
            $("#post .submit").hide();
            $("textarea").css("width", "calc(80% - 280px)").attr("placeholder", "Please be patient...")
            window.setTimeout(function(){
                spam.antiNeeded = false;
                 $("textarea").attr("placeholder", "Type your message")
            },8000);
        });

        $('.new-channel span').keydown(function (e) {
            // enter key
            if (e.keyCode == 13 && !e.shiftKey) {
                window.location = "/"+$(this).text();
                e.preventDefault();
                e.stopPropagation();
            }
        });

        var channels = this.get_channels();

        for(channel in channels) {
            if(channel != window.chatroom) {
                var channel_elem = $('<div>')
                    .addClass('channel')
                    .attr('title', '#'+channel)
                    .attr('channel', channel)
                    .attr('timestamp', channels[channel])
                    .append(
                        $('<a>').attr("href", "/"+channel).html("#"+channel)
                    )
                    .prepend(
                        $('<div>').addClass('new-count')
                    )
                    .append(
                        $('<div>').addClass('delete').html('&times;')
                    );
                $('#recent-channels').append(channel_elem);
            }
        }
        if(Object.keys(channels).length > 1) {
            $('#recent-channels .none').remove();
        }
        

        $('#channels .new-channel').on('click', function(e) {
            e.stopPropagation();
        });
        $('#recent-channels .channel').sort(function(a, b){
            var result = parseInt($(b).attr('timestamp')) - parseInt($(a).attr('timestamp'));
            return result;
        }).detach().appendTo($('#recent-channels'));

        $('#recent-channels .channel .delete').click(function(e){
            var parent = $(this).parents('.channel');
            var channels = JSON.parse(this_ui.global_cookie('channels'));
            delete channels[parent.attr('channel')];
            this_ui.global_cookie('channels', JSON.stringify(channels));
            parent.remove();
        });

        if(this.global_cookie('show_channels') == 'no') {
            this.hide_channels();
        } else {
            // default behavior
            this.show_channels();
        }
    }

    this.add_nearby_channels = function(channel) {
        $('#nearby-channels').html('');
        var channel_elem = $('<div>')
            .addClass('channel')
            .attr('title', '#'+channel)
            .attr('channel', channel)
            .append(
                $('<a>').attr("href", "/"+channel).html("#"+channel)
            )
            .prepend(
                $('<div>').addClass('new-count')
            )
            .append(
                $('<div>').addClass('delete').html('&times;')
            );
        $('#nearby-channels .none').remove();
        $('#nearby-channels').append(channel_elem);
    }

    this.align_chat_window = function() {
        var right = 0;
        // in case you want to make room for messages
        if ($(window).width() > 600) {
            $('#chat').addClass('truncated');
        } else {
            $('#chat').removeClass('truncated');
        }
        $('#chat').css('margin', $('#header').outerHeight()+'px ' + right + 'px '+$('#post').outerHeight()+'px 0');
    }

    this.init_web_only_features = function() {
        this.align_chat_window();
    }

    this.init_ios_native_features = function() {
        function connectWebViewJavascriptBridge(callback) {
            if (window.WebViewJavascriptBridge) {
                callback(window.WebViewJavascriptBridge)
            } else {
                document.addEventListener('WebViewJavascriptBridgeReady', function() {
                    callback(window.WebViewJavascriptBridge)
                }, false)
            }
        }

        connectWebViewJavascriptBridge(function(bridge) {

            /* Init your app here */
            bridge.init(function(message, responseCallback) {
                alert('Received message: ' + message)   
                if (responseCallback) {
                    responseCallback("Right back atcha")
                }
            })
            console.log('iOS javascript bridge initialized');
            bridge.send('channel:'+window.chatroom);

            //bridge.send('Hello from the javascript')
            //bridge.send('Please respond to this', function responseCallback(responseData) {
            //    console.log("Javascript got its response", responseData)
            //})
        })

    }

    this.add_spiel = function(spiel, is_initial_load) {
        //add length function. "click to expand" Messages that are too long 
        var chat = $('#chat .inner');
        var row = $('<div>').addClass('row');
        var date = new Date(spiel.date);
        var color = spiel.color;
        var datestring = date.toISOString()
        var text;


        if(spiel.id && this.added_spiel_ids.indexOf(spiel.id) != -1) {
            // message already added
            console.log("message already added");
        } else {
            this.added_spiel_ids.push(spiel.id);

            if(is_initial_load === undefined) {
                is_initial_load = false;
            }

            if(is_initial_load === false && this.flags.windowFocused == false && this.flags.mute == false) {
                this.flags.newMessages++;
                document.title = "(" + this.flags.newMessages + ") " + window.title;
                if(this_ui.nw) {
                    this_ui.nw.setBadgeLabel(this.flags.newMessages.toString());
                }

                if(window.webkitNotifications !== undefined) {
                    var havePermission = window.webkitNotifications.checkPermission();
                    if (havePermission == 0) {
                        // 0 is PERMISSION_ALLOWED
                        var message = '';
                        if(spiel.name) {
                            message += '['+escapeHtml(spiel.name)+'] '
                        }
                        message += spiel.spiel;

                        var notification = window.webkitNotifications.createNotification(
                            window.static_url + 'assets/icon-144x144.png',
                            '#'+window.chatroom,
                            message
                        );

                        notification.onclick = function () {
                            window.focus();
                            notification.close();
                        }
                        notification.show();
                        setTimeout(function(){
                            notification.close();
                        }, 3000);
                    } else {
                        $('#notification')[0].play();
                    }
                } else {
                    $('#notification')[0].play();
                }
            }

            var message = $('<div>').addClass('message');
            if(color) {
                var color_elem = $('<span>').addClass('color').css('background', color);
                message.append(color_elem);
            }
            if(spiel.name) {
                message.append($("<span>").addClass('name').text(spiel.name));
            }
            message.append($('<span>').text(spiel.spiel));
            

            var date_elem = $('<time>').addClass('date').attr('datetime', datestring).attr('timestamp', spiel.date).html(datestring);

            row.append(message);
            row.append(date_elem);
            row.data('public_id', spiel.public_id);

            if(this_ui.last_spiel_date < spiel.date) {
                this_ui.last_spiel_date = spiel.date;
                chat.append(row);
            } else if(this_ui.first_spiel_date > spiel.date) {
                this_ui.first_spiel_date = spiel.date;
                chat.prepend(row);
            } else {
                // find where to add the message
                var rows = $($('#chat .row').get().reverse());
                var found = false;
                rows.each(function(index, message_elem){
                    if(rows[index+1]) {
                        var elem = $(rows[index]);
                        var next_elem = $(rows[index+1]);
                        var timestamp = parseInt(elem.find('time').attr('timestamp'));
                        var next_timestamp = parseInt(next_elem.find('time').attr('timestamp'));
                        if(spiel.date < timestamp && spiel.date >= next_timestamp) {
                            console.log("Oddly timed message received", spiel);
                            row.insertBefore($(rows[index]));
                            found = true;
                        }
                    }
                });
                if(found == false) {
                    console.log("Couldn't place message", spiel);
                }
            }

            row.linkify(toHashtagUrl);
            row.find('time').timeago();


            if(this.flags.chatCssUpdated == false && $('#chat').height() >= $(window).height() - $('#post').height()) {
                $('#chat').css('top', '0');
                this.flags.chatCssUpdated = true;
            }
        }
    }

    this.scroll = function() {
        var chat = $('#chat');
        //chat.scrollTop(chat[0].scrollHeight);
        $("#chat").animate({ scrollTop: $('#chat')[0].scrollHeight-1}, 200);
    }

    this.scroll_up = function() {
        $("#chat").animate({ scrollTop: 0}, 200);
    }

    this.manually_scrolled = function() {
        var chat = $('#chat')[0]
        if(chat.scrollTop == 0) {
            return true;
        } else if(chat.scrollHeight == chat.scrollTop + $(chat).height()) {
            return false;
        } else {
            return true;
        }
    }

    this.reset = function() {
        $('#chat .inner').html('');
    }
    this.set_map_url = function(url) {
        $('.map').attr('src', url);
    }
    this.toggle_channels = function(e) {
        if(this.channels_visible) {
            this.hide_channels();
        } else {
            this.show_channels();
        }
    }
    this.show_channels = function() {
        $('#channels').addClass('show');
        $('#show-channels').addClass('show');
        var toggler_elem = $('#show-channels');
        var post_elem = $('#post');
        var offset = toggler_elem.offset();
        $('#channels')
            .css({
                'position': 'absolute',
                'top': (offset.top + toggler_elem.height()) + 'px',
                //'bottom': post_elem.height() + 'px',
                'bottom': '0',
                'right': '0',
            })
        //$('#channels input').focus();
        this.global_cookie('show_channels', 'yes');
        this.channels_visible = true;


        this.align_chat_window();
    }
    this.hide_channels = function() {
        $('#channels').removeClass('show');
        $('#show-channels').removeClass('show');
        this.global_cookie('show_channels', 'no');
        this.channels_visible = false;

        this.align_chat_window();
    }
    this.private_message = function() {
    }

    this.disconnected = function() {
        $('#num-online').html("disconnected");
    }
    this.set_session_info = function(channel, session_id, color) {
        
        $('#my-color').css('background', color);

        var login_url = window.location.protocol + "//" + "login-" + session_id + "." + window.location.host;
        $('a.login-url').html(login_url).attr('href', login_url);

        $('#choose-color').css('bottom', $('#post').height() + "px");
        $('#my-color').click(function(e){
            $('#choose-color').toggle();
        });
    }

    return this;
}
