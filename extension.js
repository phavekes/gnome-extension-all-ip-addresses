'use strict';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// Start with WAN address as default
var type=4;

function _get_tun0() {
    // Run ifconfig and pull the ip address for tun0 or vpn0
    var command_output_bytes = GLib.spawn_command_line_sync('/bin/bash -c "ifconfig vpn0 || ifconfig tun0"')[1];
    var command_output_string = '';

    for (var i = 0; i < command_output_bytes.length; ++i){
        var current_character = String.fromCharCode(command_output_bytes[i]);
        command_output_string += current_character;
    }

    var Re = new RegExp(/inet [^ ]+/g);
    var matches = command_output_string.match(Re);
    var tun0IpAddress;
    if (matches) {
        tun0IpAddress = matches[0].split(' ')[1];
    } else {
        tun0IpAddress = '';
    }
    return tun0IpAddress;
}

function _get_lan_ip4() {
    // Ask the IP stack what route would be used to reach 1.1.1.1 (Cloudflare DNS)
    // Specifically, what src would be used for the 1st hop?
    var command_output_bytes = GLib.spawn_command_line_sync('ip route get 1.1.1.1')[1];
    var command_output_string = '';

    for (var current_character_index = 0;
        current_character_index < command_output_bytes.length;
        ++current_character_index)
    {
        var current_character = String.fromCharCode(command_output_bytes[current_character_index]);
        command_output_string += current_character;
    }

    // Output of the "ip route" command will be a string
    // " ... src 1.2.3.4 ..."
    // So basically we want the next token (word) immediately after the "src"
    // word, and nothing else. This is considerd our LAN IP address.
    var Re = new RegExp(/src [^ ]+/g);
    var matches = command_output_string.match(Re);
    var lanIpAddress;
    if (matches) {
        lanIpAddress = matches[0].split(' ')[1];
    } else {
        lanIpAddress = '';
    }

    return lanIpAddress;
}

function _get_lan_ip6() {
    // Ask the IP stack what route would be used to reach 2001:: (random ipv6 address)
    // Specifically, what src would be used for the 1st hop?
    var command_output_bytes = GLib.spawn_command_line_sync('ip route get 2001::')[1];
    var command_output_string = '';

    for (var current_character_index = 0;
        current_character_index < command_output_bytes.length;
        ++current_character_index)
    {
        var current_character = String.fromCharCode(command_output_bytes[current_character_index]);
        command_output_string += current_character;
    }

    // Output of the "ip route" command will be a string
    // " ... src 2001:xxx:yyy:..."
    // So basically we want the next token (word) immediately after the "src"
    // word, and nothing else. This is considerd our LAN IP address.
    var Re = new RegExp(/src [^ ]+/g);
    var matches = command_output_string.match(Re);
    var lanIpAddress;
    if (matches) {
        lanIpAddress = matches[0].split(' ')[1];
    } else {
        lanIpAddress = '';
    }
    return lanIpAddress;
}

function _get_wan_ip4() {
    // Use the google dns servers to find the publip ip address used for requests
    // Force a ipv4 conection, because ipv6 won't be NAT'ed
    var command_output_bytes = GLib.spawn_command_line_sync('dig TXT +short o-o.myaddr.l.google.com @ns1.google.com -4')[1];
    var command_output_string = '';

    for (var current_character_index = 0;
        current_character_index < command_output_bytes.length;
        ++current_character_index)
    {
        var current_character = String.fromCharCode(command_output_bytes[current_character_index]);
        command_output_string += current_character;
    }
    command_output_string=command_output_string.replace('"','').replace('"','').replace('\n','');
    // Validate the result looks like an ipv4 address
    var Re = new RegExp(/.*\..*\..*\..*/g);
    var matches = command_output_string.match(Re);
    var wanIpAddress;
    if (matches) {
        wanIpAddress = command_output_string;
    } else {
        wanIpAddress = '';
    }
    return wanIpAddress;
}

class AllIPAddressIndicator extends PanelMenu.Button{
  
    static {
        GObject.registerClass(this);
    }

    _init() {
        // Chaining up to the super-class
        super._init(0.0, "All IP Addresses Indicator", false);

        this.buttonText = new St.Label({
            text: 'Loading...',
            y_align: Clutter.ActorAlign.CENTER
        });
        this.add_child(this.buttonText);
        this._updateLabel();
    }

    _toggleView(){
      console.log("Updating label for all-ip extension")
      if (type===4) {
        type=6;
      } else if (type===6) {
        type=0;
      } else if (type===0){
        type=1;
      } else if (type===1){
        type=4
      }
      this._updateLabel();
    }

    _updateLabel(){
        const refreshTime = 20 // in seconds

        if (this._timeout) {
                GLib.source_remove(this._timeout);
                this._timeout = null;
        }
        this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, refreshTime, () => {this._updateLabel();});
        // Show the right format. 0 = WAN, 4 = IPv4, 6=IPv6
        if (type===4) {
            this.buttonText.set_text("LAN: "+_get_lan_ip4());
        } else if (type===0) {
            this.buttonText.set_text("WAN: "+_get_wan_ip4());
        } else if (type===6){
            this.buttonText.set_text("IP6: "+_get_lan_ip6());
        } else {
            this.buttonText.set_text("VPN: "+_get_tun0());
        }
    }

    _removeTimeout() {
        if (this._timeout) {
            this._timeout = null;
        }
    }

    stop() {
        if (this._timeout) {
            GLib.source_remove(this._timeout);
        }
        this._timeout = undefined;

        this.menu.removeAll();
    }
}

export default class AllIPAddressExtension extends Extension {

    enable() {
        this._indicator = new AllIPAddressIndicator();
        Main.panel.addToStatusArea('all-ip-addresses-indicator', this._indicator);
        this._indicator.connect('button-press-event', () => this._indicator._toggleView());
    }

    disable() {
        this._indicator.stop();
        this._indicator.destroy();
        this._indicator = null;
    }
}
