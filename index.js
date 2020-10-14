const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const mqtt = require('mqtt');
const strava = require('strava-v3');
const lowdb = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const config = require('./config');

const app = express().use(bodyParser.json());

try {
  fs.mkdirSync('data');
} catch (e) {}
const adapter = new FileSync('data/db.json');
const db = lowdb(adapter);
db.defaults({ activities: [] }).write();

const sessionFile = 'data/strava_config';
let mqttClient = mqttInit();

const sessionConfig = fs.existsSync(sessionFile) ? JSON.parse(fs.readFileSync(sessionFile)) : {};

strava.config({
  access_token: sessionConfig.access_token || config.strava.access_token,
  client_id: config.strava.client_id,
  client_secret: config.strava.client_secret,
  redirect_uri: config.strava.redirect_uri,
});

// Sets server port and logs message on success
app.listen(config.webhook.port, () =>
  console.log(`webhook is listening at port ${config.webhook.port}`)
);

(async () => {
  sendActivities();
})();

async function sendActivities() {
  // reauth always
  const sessionConfig = fs.existsSync(sessionFile) ? JSON.parse(fs.readFileSync(sessionFile)) : {};
  const auth = await strava.oauth.refreshToken(sessionConfig.refresh_token);
  strava.config({ access_token: auth.access_token });
  fs.writeFileSync(sessionFile, JSON.stringify(auth));

  const acts = await strava.athlete.listActivities({ access_token: auth.access_token });
  // console.log('acts: ', acts);

  let newCount = 0;

  for (let act of acts) {
    const data = getActivityData(act);
    const found = db.get('activities').find({ id: data.id }).value();

    if (found) {
      continue;
    }

    newCount++;
    mqttSend(data.topic, data.start, data.finish);

    db.get('activities').push(data).write();
  }

  log(`Found new activities: ${newCount}`);
}

function getActivityData(act) {
  const data = {
    id: act.id,
    start: new Date(act.start_date),
    type: act.type,
    topic: config.webhook.typesTopics[act.type] || config.webhook.typesTopics['default'],
  };
  data.finish = new Date(data.start.getTime() + act.elapsed_time * 1000);
  return data;
}

function log(msg, type = 'info') {
  const tzoffset = new Date().getTimezoneOffset() * 60000; //offset in milliseconds
  const d = new Date(Date.now() - tzoffset)
    .toISOString()
    .replace(/T/, ' ') // replace T with a space
    .replace(/\..+/, ''); // delete the dot and everything after

  console[type](`${d} ${msg}`);
}

function mqttInit() {
  log('Connecting to MQTT...');
  const client = mqtt.connect(`mqtt://${config.mqtt.host}`, {
    port: config.mqtt.port,
    username: config.mqtt.user,
    password: config.mqtt.password,
  });

  client.on('connect', () => {
    log('MQTT connected to ' + config.mqtt.host);
  });

  client.on('offline', () => {
    log('MQTT offline', 'warn');
  });

  return client;
}

function mqttSend(topic, start, finish) {
  const prefix = `mqtt_consumer,host=server.home.popstas.ru,topic=${topic}`;

  const topicOut = config.webhook.mqttOutTopic;
  const startLine = `${prefix} value=1i ${start.getTime()}000000`;
  const finishLine = `${prefix} value=0i ${finish.getTime()}000000`;
  log(`${topicOut}: ${start.toLocaleString('ru-RU')} - ${finish.toLocaleString('ru-RU')}`);
  log(`${topicOut}: ${startLine}`);
  log(`${topicOut}: ${finishLine}`);

  mqttClient.publish(topicOut, startLine);
  mqttClient.publish(topicOut, finishLine);
}

// login
app.get('/login', async (req, res) => {
  const url = strava.oauth.getRequestAccessURL({
    scope: 'activity:read_all,profile:read_all',
  });
  res.redirect(url.toString());
});

// auth
app.get('/auth', async (req, res) => {
  try {
    const auth = await strava.oauth.getToken(req.query.code);
    if (auth.access_token === undefined)
      throw 'Problem with provided code: ' + JSON.stringify(auth);

    config.access_token = auth.access_token;
    strava.config({ access_token: auth.access_token });
    fs.writeFileSync(sessionFile, JSON.stringify(auth));

    res.status(200).send('login success');
  } catch (e) {
    res.status(400).send(e.message + '\n<br><a href="/login">Login</a>');
  }
});

// Creates the endpoint for our webhook
app.post('/webhook', async (req, res) => {
  log('webhook event received!', 'log');
  console.log(req.query);
  console.log(req.body);
  sendActivities();
  res.status(200).send('EVENT_RECEIVED');
});

// Adds support for GET requests to our webhook
app.get('/webhook', (req, res) => {
  // Your verify token. Should be a random string.
  // Parses the query params
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];
  // Checks if a token and mode is in the query string of the request
  if (mode && token) {
    // Verifies that the mode and token sent are valid
    if (mode === 'subscribe' && token === config.strava.verify_token) {
      // Responds with the challenge token from the request
      console.log('WEBHOOK_VERIFIED');
      res.json({ 'hub.challenge': challenge });
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  }
});
