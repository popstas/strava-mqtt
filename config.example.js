module.exports = {
  mqtt: {
    host: '',
    port: ,
    user: '',
    password: ''
  },
  strava: {
    access_token: '',
    client_id: ,
    client_secret: '',
    redirect_uri: '',
    verify_token: '' // random
  },
  webhook: {
    port: 3005,
    mqttOutTopic: 'line',
    typesTopics: {
      Ride: 'actions/workout/cycle',
      Run: 'actions/workout/run',
      Walk: 'actions/workout/walk',
      NordicSki: 'actions/workout/nordic_ski',
      AlpineSki: 'actions/workout/alpine_ski',
      IceSkate: 'actions/workout/ice_skate',
      default: 'actions/workout/other',
    }
  }
};
