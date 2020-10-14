Send last activities from Strava to MQTT.

http://developers.strava.com/docs/getting-started/

https://developers.strava.com/docs/webhookexample/

For output Strava activities with Grafana.

My case:

Strava -> MQTT -> Telegraf mqtt_consumer -> InfluxDB -> Grafana

MQTT send data to topic `line`, example:
```
actions/workout/walk: mqtt_consumer,host=server.home.popstas.ru,topic=actions/workout/walk value=1i 1601361273000000000
```

Telegraf assume `line` topic as line protocol data, add it to telegraf.conf:
```
[[inputs.mqtt_consumer]]
    servers = [ "localhost:1883" ]
    qos = 0
    client_id = "telegraf-mqtt"
    username = "user"
    password = "pass"
    data_format = "influx"
    topics = [ "line" ]
```

In InfluxDB you will get `mqtt_consumer` measurement with topic = `actions/workout/walk`, value = 1 for start and 0 for stop.

Use `/login` location for authorize your app with needed access scopes.