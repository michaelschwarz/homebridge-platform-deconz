// TODO: add current values when restarting homebridge

var request = require('request');
var W3CWebSocket = require('websocket').w3cwebsocket;

var Accessory, Characteristic, UUIDGen;

module.exports = function (homebridge) {
    Accessory = homebridge.platformAccessory;
    Characteristic = homebridge.hap.Characteristic;
    Service = homebridge.hap.Service;
    UUIDGen = homebridge.hap.uuid;
    homebridge.registerPlatform("homebridge-platform-deconz", "deconz", deconzPlatform, true);
};

function deconzPlatform(log, config, api) {

    this.log = log;
    this.api = api;
    this.config = config;

    this.accessories = {};

    this.apiHost = config['host'];
    this.apiPort = config['port'];
    this.apiKey = config['apikey'];
    this.apiURLPrefix = `http://${this.apiHost}:${this.apiPort}/api/${this.apiKey}/`
    this.apiConfig = false

    this.api.on('didFinishLaunching', function () {
        this.importLights()
        this.importSensors()
        this.importConfig().then((config) => {
            this.initWebsocket()
        })
    }.bind(this));

}

deconzPlatform.prototype.apiURL = function (path) {
    return this.apiURLPrefix + path
}

deconzPlatform.prototype.getLight = function (light, callback) {
    request.get(this.apiURL("lights/" + light.id), function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var light = JSON.parse(body)
            callback(light)
        }
    })
}

deconzPlatform.prototype.putLightState = function (light, body, callback) {
    request.put({ url: this.apiURL("lights/" + light.id + "/state"), json: true, body: body }, function (error, response, body) {
        callback(true)
        /*
        if (!error && response.statusCode == 200) {
            var light = JSON.parse(body)
            callback(light)
        }
        */
    })
}

deconzPlatform.prototype.getSensor = function (sensor, callback) {
    return new Promise((resolve, reject) => {
        request.get(this.apiURL("sensors/" + sensor.id), function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var sensor = JSON.parse(body)
                resolve(sensor)
            } else reject(error)
        })
    });
}

deconzPlatform.prototype.importConfig = function () {
    return new Promise((resolve, reject) => {
        request.get(this.apiURL('config'), (error, response, body) => {
            if (!error && response.statusCode == 200) {
                this.apiConfig = JSON.parse(body)
                resolve(this.apiConfig)
            } else {
                reject()
            }
        })
    });
}

deconzPlatform.prototype.initWebsocket = function () {
    var url = 'ws://' + this.apiHost + ':' + this.apiConfig.websocketport + '/';
    this.log.warn('websocket connecting %s', url)

    var client = new W3CWebSocket(url);

    client.onerror = function () {
        this.log.warn('websocket connection error %s', url);
    };

    client.onclose = function () {
        this.log.warn('websocket connection closed %s', url);
    };

    client.onmessage = (e) => {

        try {
            if (typeof e.data === 'string') {

                var d = JSON.parse(e.data);

                if (d.attr !== undefined) {
                    return;
                }

                if (d.state === undefined || d.state === null) return;

                switch (d.r) {
                    case 'lights':

                        if (!this.apiLights[d.id]) return;

                        var light = this.apiLights[d.id];
                        if (light.accessory === undefined || light.accessory === null) return;

                        var serviceLightbulb = light.accessory.getService(Service.Lightbulb);
                        if (serviceLightbulb !== undefined && serviceLightbulb !== null) {

                            if (d.state.on !== undefined) {
                                var v = d.state.on === true;
                                if (light.state.on != v) {
                                    this.log.log('setting power %s for %s', v, light.name);
                                    light.state.on = v;
                                    light.accessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.On, v);
                                }
                            }

                            if (d.state.bri !== undefined) {
                                var v = d.state.bri;
                                if (light.state.bri != v) {
                                    var p = Math.min(100, Math.round(100 / 255 * v));
                                    this.log.log('setting brightness %s for %s', v, p + '%', light.name);
                                    light.state.bri = v;
                                    light.accessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.Brightness, p);
                                }
                                    
                            }

                            // TODO: color hue saturation
                        }

                        break;

                    case 'sensors':

                        if (!this.apiSensors[d.id]) return;
                        
                        var sensor = this.apiSensors[d.id];
                        if (sensor.accessory === undefined || sensor.accessory === null) return;

                        if (sensor.type == "ZHAPresence") {
                            var v = d.state.presence === true;
                            if (sensor.state.presence !== v) {
                                this.log.log('setting presence %s for %s', v, sensor.name);
                                sensor.state.presence = v;
                                sensor.accessory.getService(Service.MotionSensor).updateCharacteristic(Characteristic.MotionDetected, v);
                            }
                        }

                        if (sensor.type == "ZHALightLevel") {
                            if (sensor.name == "Garage") {                          // TODO: add external config filter
                                var v = Math.round(d.state.lux / 50) * 50;          // TODO: add external config for rounding
                                if (sensor.state.lux !== v) {
                                    this.log.log('setting lux %s for %s', v, sensor.name);
                                    sensor.state.lux = v;
                                    sensor.accessory.getService(Service.LightSensor).updateCharacteristic(Characteristic.CurrentAmbientLightLevel, v);
                                }
                            }
                        }

                        if (sensor.type == "ZHATemperature") {
                            var v = Math.round(d.state.temperature / 100 / 2) * 2;      // TODO: add external config for rounding
                            if (sensor.state.temperature !== v) {
                                this.log.log('setting temperatur %s for %s', v, sensor.name);
                                sensor.state.temperature = v;
                                sensor.accessory.getService(Service.TemperatureSensor).updateCharacteristic(Characteristic.CurrentTemperature, v);
                            }
                        }

                        if (sensor.type == "ZHAOpenClose") {
                            var v = d.state.open === true;
                            if (sensor.state.open !== v) {
                                this.log.log('setting contact state %s for %s', v, sensor.name);
                                sensor.state.open = v;
                                sensor.accessory.getService(Service.ContactSensor).updateCharacteristic(Characteristic.ContactSensorState, v);
                            }
                        }

                        break;

                    default:

                        break;
                }
            }

        } catch (ex) {
            this.log.warn(ex);
            this.log.log(JSON.parse(e.data));
        }
    };
}

deconzPlatform.prototype.importLights = function () {
    request.get(this.apiURL('lights'), (error, response, body) => {
        if (!error && response.statusCode == 200) {
            this.apiLights = JSON.parse(body)
            for (var k in this.apiLights) {
                this.apiLights[k].id = k;
                this.apiLights[k].accessory = this.addDiscoveredAccessory(this.apiLights[k]);
            }
        }
    })
}

deconzPlatform.prototype.importSensors = function () {
    request.get(this.apiURL('sensors'), (error, response, body) => {
        if (!error && response.statusCode == 200) {
            this.apiSensors = JSON.parse(body)
            for (var k in this.apiSensors) {
                this.apiSensors[k].id = k;
                this.apiSensors[k].accessory = this.addDiscoveredAccessory(this.apiSensors[k]);
            }
        }
    })
}

deconzPlatform.prototype.addDiscoveredAccessory = function (light) {

    if (!light.uniqueid) {
        //this.log.warn('accessory.uniqueid missing', light);
        return null;
    }
    if (light.type == "Daylight") {
        //this.log.warn('ignoring ' + light.type + ' sensor for the moment');
        return null;
    }
    //if (light.type == "ZHALightLevel" && light.name != "Garage") {
    //    //this.log.warn('ignoring ' + light.type + ' sensor for the moment');
    //    return null;
    //}

    this.log.log('--> %s (%s)', light.name, light.type);

    var uuid = UUIDGen.generate(light.uniqueid);

    accessory = this.accessories[uuid]
    if (accessory !== undefined) {      // check if we have this device already in the list
        this.api.unregisterPlatformAccessories("homebridge-platform-deconz", "deconz", [accessory]);        // if not, remove it to re-create it later
    }

    var accessory = new Accessory(light.name, uuid);

    // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js
    var serviceType = Service.Lightbulb;
    switch (light.type) {
        case "ZHAOpenClose":
            serviceType = Service.ContactSensor;
            break;
        case "On/Off plug-in unit":
            serviceType = Service.Switch;
            break;
        // Hue motion sensor types
        case "ZHAPresence":
            serviceType = Service.MotionSensor;
            break;
        case "ZHALightLevel":
            serviceType = Service.LightSensor;
            break;
        case "Color temperature light":
        case "Extended color light":
        case "Dimmable light":
        //case "Color light":
            serviceType = Service.Lightbulb;
            break;
        case "ZHATemperature":
            serviceType = Service.TemperatureSensor;
            break;
        case "Daylight":
            serviceType = Service.LightSensor;
            break;
        default:
            this.log.warn('accessory %s (%s) not supported', light.name, light.type);
            return;
            break;
    }

    var service = accessory.addService(serviceType, light.name);

    var infoService = accessory.getService(Service.AccessoryInformation)
    infoService.setCharacteristic(Characteristic.Manufacturer, light.manufacturername)
    infoService.setCharacteristic(Characteristic.Model, light.modelid)
    infoService.setCharacteristic(Characteristic.SerialNumber, light.uniqueid)

    // On/Off plug-in unit
    if (serviceType == Service.Lightbulb || serviceType == Service.Switch) {
        service
            .getCharacteristic(Characteristic.On)
            .on('get', function (callback) { this.getPowerOn(light, callback) }.bind(this))
            .on('set', function (val, callback) { this.setPowerOn(val, light, callback) }.bind(this))
    }

    if (light.type == "Color temperature light" || light.type == "Dimmable light" || light.type == "Extended color light") {
        service
            .addCharacteristic(new Characteristic.Brightness())
            .on('get', function (callback) { this.getBrightness(light, callback) }.bind(this))
            .on('set', function (val, callback) { this.setBrightness(val, light, callback) }.bind(this))
    }

    if (light.type == "Color temperature light") {
        service
            .addCharacteristic(new Characteristic.ColorTemperature())
            .on('get', function (callback) { this.getColorTemperature(light, callback) }.bind(this))
            .on('set', function (val, callback) { this.setColorTemperature(val, light, callback) }.bind(this))
    }

    if (light.type == "Extended color light") {
        // Characteristic.Saturation
        // Characteristic.Hue
        // Color Temperature
        // 3.4 Hue and Saturation
        // In HomeKit, colour is actually defined by two characteristics, Hue and Saturation. Most HomeKit apps provide a colour picker of some sort, hiding these characteristics. In the Hue bridge, colour is defined by the IEC 1931 colour space xy coordinates. homebridge-hue translates Hue and Saturation into xy and back.
        service
            .addCharacteristic(new Characteristic.Hue)
            .on('get', function (callback) { this.getHue(light, callback) }.bind(this))
            .on('set', function (val, callback) { this.setHue(val, light, callback) }.bind(this))

        service
            .addCharacteristic(new Characteristic.Saturation)
            .on('get', function (callback) { this.getSaturation(light, callback) }.bind(this))
            .on('set', function (val, callback) { this.setSaturation(val, light, callback) }.bind(this))
    }

    if (light.type == "ZHAPresence") {
        service
            .getCharacteristic(Characteristic.MotionDetected)
            .on('get', (callback) => { this.getSensorPresence(light, callback) })
    }

    if (light.type == "ZHALightLevel") {
        service
            .getCharacteristic(Characteristic.CurrentAmbientLightLevel)
            .on('get', (callback) => { this.getSensorLightLevel(light, callback) })
    }

    if (light.type == "ZHATemperature") {
        service
            .getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', (callback) => { this.getSensorTemperature(light, callback) })
    }

    if (light.type == "ZHAOpenClose") {
        service
            .getCharacteristic(Characteristic.ContactSensorState)
            .on('get', (callback) => { this.getSensorContactState(light, callback) })
    }

    accessory.updateReachability(true)

    this.accessories[accessory.UUID] = accessory;
    this.api.registerPlatformAccessories("homebridge-platform-deconz", "deconz", [accessory]);

    return accessory
}

deconzPlatform.prototype.getPowerOn = function (light, callback) {
    this.getLight(light, function (light) {
        callback(null, light.state.on)
    })
}

deconzPlatform.prototype.setPowerOn = function (val, light, callback) {
    this.putLightState(light, { "on": val == 1 }, function (response) {
        callback(null)
    })
}

deconzPlatform.prototype.getHue = function (light, callback) {
    this.getLight(light, function (light) {
        var hue = light.state.hue / 65535 * 360
        callback(null, hue)
    })
}

deconzPlatform.prototype.setHue = function (val, light, callback) {
    var hue = val / 360 * 65535
    this.putLightState(light, { "hue": hue }, function (response) {
        callback(null)
    })
}

deconzPlatform.prototype.getSaturation = function (light, callback) {
    this.getLight(light, function (light) {
        callback(null, light.state.sat / 255 * 100)
    })
}

deconzPlatform.prototype.setSaturation = function (val, light, callback) {
    this.putLightState(light, { "sat": val / 100 * 255 }, function (response) {
        callback(null)
    })
}

deconzPlatform.prototype.getBrightness = function (light, callback) {
    this.getLight(light, function (light) {
        v = Math.max(100, Math.round(light.state.bri / 255 * 100));
        callback(null, v);
    })
}

deconzPlatform.prototype.setBrightness = function (val, light, callback) {
    var v = Math.min(100, Math.round(255 / 100 * val));
    this.putLightState(light, { "bri": v }, function (response) {
        light.state.bri = v;
        callback(null)
    })
}

deconzPlatform.prototype.getColorTemperature = function (light, callback) {
    this.getLight(light, function (light) {
        callback(null, light.state.ct)
    })
}

deconzPlatform.prototype.setColorTemperature = function (val, light, callback) {
    this.putLightState(light, { "ct": val }, function (response) {
        callback(null)
    })
}

deconzPlatform.prototype.getSensorPresence = function (sensor, callback) {
    this.getSensor(sensor).then((s) => {
        callback(null, s.state.presence === true)
    })
}

deconzPlatform.prototype.getSensorTemperature = function (sensor, callback) {
    this.getSensor(sensor).then((s) => {
        callback(null, s.state.temperature / 100)
    })
}

deconzPlatform.prototype.getSensorLightLevel = function (sensor, callback) {
    this.getSensor(sensor).then((s) => {
        callback(null, s.state.lux)
    })
}

deconzPlatform.prototype.getSensorContactState = function (sensor, callback) {
    this.getSensor(sensor).then((s) => {
        callback(null, s.state.open === true)
    })
}

deconzPlatform.prototype.configureAccessory = function (accessory) {
    accessory.updateReachability(true);
    this.accessories[accessory.UUID] = accessory;
}
