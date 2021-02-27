# homebridge-platform-deconz

[DeCONZ REST API](http://dresden-elektronik.github.io/deconz-rest-doc/) Platform plugin for the [Homebridge](https://github.com/nfarina/homebridge) project.

Tested on Raspberry Pi 2/3 with [RaspBee](http://www.dresden-elektronik.de/funktechnik/solutions/wireless-light-control/raspbee?L=1)

## Currently supports
- Accessory discovery
- Switches On/Off
- Light Brightness
- Light Hue and Saturation
- Contact Sensors
- Temperature Sensors
- Motion Sensors

# Installation

1. Install [DeCONZ](https://www.dresden-elektronik.de/funktechnik/products/software/pc/deconz/?L=1)
2. Install [REST Plugin](https://github.com/dresden-elektronik/deconz-rest-plugin)
3. Generate [API Key](http://dresden-elektronik.github.io/deconz-rest-doc/configuration/#aquireapikey)
4. Install homebridge using: `npm install -g homebridge`
5. This plugin needs to be installed manually using `git clone`
6. Update your configuration file. See the sample below.

# Configuration

Configuration sample: (/var/homebridge/config.json)

 ```javascript
    "platforms": [
        {
            "platform": "deconz",
            "name": "deconz",
            "host": "127.0.0.1",
            "port": 80,
            "apikey": "ABCDEF1234"
         }
    ]
```
