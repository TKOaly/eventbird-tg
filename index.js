require('dotenv').config()
var TelegramBot = require('node-telegram-bot-api')
var fs = require('fs')
var moment = require('moment')
var cron = require('node-cron')
var tkoalyevents = require('tkoalyevents')
var R = require('ramda')
var request = require('request')
var FoodlistService = require('./services/FoodlistService')
var translations = require('./translations')

var EVENTS_FILE = 'events.json'
var GROUPS_FILE = 'groups.json'

var WEATHER_URL = 'https://query.yahooapis.com/v1/public/yql?q=select%20*%20from%20weather.forecast%20where%20woeid%20in%20(select%20woeid%20from%20geo.places(1)%20where%20text%3D%22helsinki%22)%20and%20u=%27c%27&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys'

var foodlistService = new FoodlistService()

moment.locale('fi')

if (!process.env.API_TOKEN) {
  console.error('No api token found.')
  process.exit(1)
}

var bot = new TelegramBot(process.env.API_TOKEN, { polling: true })

var events = []
var groups = [224942920]
fs.readFile(EVENTS_FILE, (err, eventsData) => {
  if (!err) {
    events = JSON.parse(eventsData)
    console.log('read', events.length, 'events')
  }
  fs.readFile(GROUPS_FILE, (err, groupsData) => {
    if (!err) {
      groups = JSON.parse(groupsData)
      console.log('read', groups.length, 'groups')
    }
    setTimeout(pollEvents, 1000)
    setInterval(pollEvents, 15 * 60 * 1000)
  })
})

function saveEvents (data, cb) {
  fs.writeFile(EVENTS_FILE, JSON.stringify(data), cb)
}

function eventDifference (data, events) {
  var difference = R.difference(data.map(e => e.id), events.map(e => e.id))
  return data.filter(e => difference.includes(e.id))
}

function pollEvents () {
  tkoalyevents(function (data) {
    saveEvents(data)
    var difference = eventDifference(data, events)
    if (difference && difference.length > 0) {
      newEvents(difference)
    }
    events = data
  })
}

function getEventURL (id) {
  return 'http://tko-aly.fi/event/' + id
}

function makeEventHumanReadable (dateFormat) {
  return function (e) {
    return moment(e.starts).format(dateFormat) + ': [' + e.name.trim() + '](' + getEventURL(e.id) + ')'
  }
}

function makeRegistHumanReadable (dateFormat) {
  return function (e) {
    return 'Ilmo aukeaa ' + moment(e.registration_starts).format(dateFormat) + ': [' + e.name.trim() + '](' + getEventURL(e.id) + ')'
  }
}

function listEvents (events, dateFormat, showRegistTimes) {
  var data = showRegistTimes
    ? events.map(makeRegistHumanReadable(dateFormat))
    : events.map(makeEventHumanReadable(dateFormat))

  return data.reduce((initial, event) => initial + event + '\n', '')
}

function todaysEvents () {
  var today = moment()
  var eventsToday = events.filter(e => moment(e.starts).isSame(today, 'day'))
  var registsToday = events.filter(e => moment(e.registration_starts).isSame(today, 'day'))

  if ((eventsToday && eventsToday.length > 0) || (registsToday && registsToday.length > 0)) {
    var message = '*Tänään:* \n' + listEvents(eventsToday, 'HH:mm') + listEvents(registsToday, 'HH:mm', true)
    for (var j = 0; j < groups.length; j++) {
      bot.sendMessage(groups[j], message.trim(), {
        disable_web_page_preview: true,
        parse_mode: 'Markdown'
      })
    }
  }
}

function newEvents (events) {
  if (!events) {
    return
  }

  var res = events.length > 1
    ? '*Uusia tapahtumia:* \n'
    : '*Uusi tapahtuma:* \n'

  res += listEvents(events, 'DD.MM.YYYY HH:mm')
  for (var j = 0; j < groups.length; j++) {
    bot.sendMessage(groups[j], res.trim(), {
      disable_web_page_preview: true,
      parse_mode: 'Markdown'
    })
  }
}

function todaysFood () {
  this.createFoodList = (res, array, cb) => {
    var edullisesti = '*Edullisesti:* \n'
    var makeasti = '*Makeasti:*\n'
    var maukkaasti = '*Maukkaasti:*\n'
    for (var i of array) {
      var warnings = i.warnings.length !== 0
        ? `_(${i.warnings.join(', ')})_`
        : ''

      var foodName = `  -  ${i.name} ${warnings} \n\n`

      switch (i.price.name) {
        case 'Edullisesti':
          edullisesti += foodName
          break
        case 'Makeasti':
          makeasti += foodName
          break
        case 'Maukkaasti':
          maukkaasti += foodName
          break
      }
    }

    var footer = '\n[Äänestä suosikkia!](https://kumpulafood.herokuapp.com)'
    cb(res + edullisesti + maukkaasti + makeasti + footer)
  }

  var restaurantCallback = list => {
    if (!list) {
      return
    }

    var header = `*Päivän ruoka:* \n\n*UniCafe ${list.restaurantName}:* \n\n`
    if (!list.length) {
      for (var j = 0; j < groups.length; j++) {
        bot.sendMessage(groups[j], header + 'ei ruokaa 😭😭😭'.trim(), {
          parse_mode: 'Markdown'
        })
      }
    } else {
      this.createFoodList(header, list, (res) => {
        for (var j = 0; j < groups.length; j++) {
          bot.sendMessage(groups[j], res.trim(), {
            parse_mode: 'Markdown'
          })
        }
      })
    }
  }

  var restaurants = ['exactum', 'chemicum']
  restaurants.map((restaurantName) =>
    foodlistService.fetchRestaurantFoodlist(restaurantName, restaurantCallback)
  )
}

function weather () {
  request.get(WEATHER_URL, (err, res, body) => {
    if (err) return
    var obj = JSON.parse(body).query.results.channel
    var sunrise = moment(obj.astronomy.sunrise, ['h:mm A'])
    var sunset = moment(obj.astronomy.sunset, ['h:mm A'])
    var sunStatus = moment().isBefore(sunrise) ? 'nousee' : 'nousi'
    var condition = translations.conditions[obj.item.condition.code]
    var conditionEmoji = translations.emoji[obj.item.condition.code]

    var resStr = `*Lämpötila on Helsingissä ${obj.item.condition.temp}°C, ${condition} ${conditionEmoji} . `
    resStr += `Aurinko ${sunStatus} ${sunrise.format('HH:mm')} ja laskee ${sunset.format('HH:mm')}.*`

    for (var g of groups) {
      bot.sendMessage(g, resStr.trim(), {
        parse_mode: 'Markdown'
      })
    }
  })
}

if (process.argv.indexOf('pfl') > -1) {
  todaysFood()
}

cron.schedule('0 0 7 * * *', () => {
  todaysEvents()
  weather()
})

cron.schedule('0 0 10 * * 1-5', todaysFood)

bot.on('message', function (msg) {
  if (msg.chat.type !== 'private' && groups.indexOf(msg.chat.id) === -1) {
    console.log('Found a new group:', msg.chat.id, msg.chat.title)
    groups.push(msg.chat.id)
    fs.writeFile(GROUPS_FILE, JSON.stringify(groups))
  }
})
