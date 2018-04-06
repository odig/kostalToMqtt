const fs = require('fs')
const http = require('http')
const cheerio = require('cherio')

const energieAktuell = 11
const energieTotal = 13
const energieTag = 17
const status = 19
const string1Spannung = 30
const l1Spannung = 32
const string1Strom = 34
const l1Leistung = 36
const string2Spannung = 40
const l2Spannung = 42
const string2Strom = 44
const l2Leistung = 46
const l3Spannung = 53
const l3Leistung = 58

// sample config.json
/*
{
  "kostalUserName": "pvserver",
  "kostalPassword": "pvwr",
  "kostalServer": "lk-kb2.fritz.box",
  "mqttServer": "mqtt.fritz.box",
  "mqttUserName": "mqtt",
  "mqttPassword": "mqtt",
  "publish": true,
  "identifier": "devices/status/",
  "statusTimer": 180,
}
*/

// Start Winston Logger
const winston = require('winston');
const env = process.env.NODE_ENV || 'info';
const logDir = 'log';
// Create the log directory if it does not exist
if (!fs.existsSync(logDir)) {
	fs.mkdirSync(logDir);
}
const tsFormat = () => (new Date()).toLocaleTimeString();
const logger = new (winston.Logger)({
	transports: [
		// colorize the output to the console
		new (winston.transports.Console)({
			timestamp: tsFormat,
			colorize: true,
			level: env === 'development' ? 'debug' : 'info'
		}),
		new (winston.transports.File)({
			filename: `${logDir}/app.log`,
			timestamp: tsFormat,
			json: false,
			level: env === 'development' ? 'debug' : 'info'
		})
	]
});

// config
let config
let path

path = process.cwd() + '/config.json'
if (fs.existsSync(path)) {
	config = require('config.json')(path)
} else {
	path = '/etc/kostalToMqtt' + '/config.json'
	if (fs.existsSync(path)) {
		config = require('config.json')(path)
	} else {
		path = __dirname + '/config.json'
		if (fs.existsSync(path)) {
			config = require('config.json')(path)
		} else {
			logger.warn('no config.json found --> use defaults')
			config = {}
		}
	}
}

if (config.kostalUserName == null) config.kostalUserName = 'pvserver'
if (config.kostalPassword == null) config.kostalPassword = 'pvwr'
if (config.kostalServer == null) config.kostalServer = 'lk-kb2.fritz.box'
if (config.mqttServer == null) config.mqttServer = 'ds1515.fritz.box'
if (config.mqttUserName == null) config.mqttUserName = 'mqtt'
if (config.mqttPassword == null) config.mqttPassword = 'mqtt'
if (config.statusTimer == null) config.statusTimer = 300
if (config.identifier == null) config.identifier = 'kostal/'

logger.info('Using config ' + path)
logger.info(JSON.stringify(config, null, 4))

const mqtt = require('mqtt')

//const

//vars
let mqttAvailable = false
let mqttConnection = null
let terminating = false

///////////////////////////////////////////////////////////////////////////////
//MQTT Stuff
///////////////////////////////////////////////////////////////////////////////
function mqttConnect() {
	if (config.mqttUserName) {
		mqttConnection = mqtt.connect('mqtt://' + config.mqttServer, {
			username: config.mqttUserName,
			password: config.mqttPassword
		})
	} else {
		mqttConnection = mqtt.connect('mqtt://' + config.mqttServer, {})
	}

	mqttConnection.on('connect', function () {
		mqttAvailable = true
	})
}

function mqttPublish(path, value) {
	if (isNaN(value)) {
		return 'Not a Number!';
	} else {
		if (mqttAvailable) {
			let publishString = config.identifier + path
			logger.info("publish:", publishString, value)
			mqttConnection.publish(publishString, value.toString())
		}
	}
}

///////////////////////////////////////////////////////////////////////////////
//Application Stuff
///////////////////////////////////////////////////////////////////////////////
function doStuff() {
	http.get('http://' + config.kostalUserName + ':' + config.kostalPassword + '@' + config.kostalServer + '/', (res) => {
		if (res.statusCode !== 200) {
			console.error(new Error(`Request Failed.\n` + `Status Code: ${res.statusCode}`))
			// consume response data to free up memory
			res.resume()
			return
		}

		res.setEncoding('utf8')
		let data = ''
		res.on('data', (chunk) => { data += chunk })
		res.on('end', () => {
			//console.log('end')
			const $ = cheerio.load(data)
			let tds = $("td").text().split('\n')
			//console.log(tds)
			mqttPublish('energieAktuell', parseFloat(tds[energieAktuell]))
			mqttPublish('energieTotal', parseFloat(tds[energieTotal]))
			mqttPublish('energieTag', parseFloat(tds[energieTag]))
			mqttPublish('status', tds[status] === '  Aus '?'0':'1')
			mqttPublish('statusString', tds[status])
			mqttPublish('string1Spannung', parseFloat(tds[string1Spannung]))
			mqttPublish('l1Spannung', parseFloat(tds[l1Spannung]))
			mqttPublish('string1Strom', parseFloat(tds[string1Strom]))
			mqttPublish('l1Leistung', parseFloat(tds[l1Leistung]))
			mqttPublish('string2Spannung', parseFloat(tds[string2Spannung]))
			mqttPublish('l2Spannung', parseFloat(tds[l2Spannung]))
			mqttPublish('string2Strom', parseFloat(tds[string2Strom]))
			mqttPublish('l2Leistung', parseFloat(tds[l2Leistung]))
			mqttPublish('l3Spannung', parseFloat(tds[l3Spannung]))
			mqttPublish('l3Leistung', parseFloat(tds[l3Leistung]))
		})
	}).on('error', (e) => {
		console.error(`Got error: ${e.message}`)
	});
}

function killProcess() {
	terminating = true

	if (process.exitTimeoutId) {
		return
	}

	process.exitTimeoutId = setTimeout(process.exit, 1000)
	logger.info('process will exit in 1 second')

	mqttConnection.end()
}

function run() {
	process.on('SIGTERM', killProcess)
	process.on('SIGINT', killProcess)
	process.on('uncaughtException', function (e) {
		logger.info(e)
		killProcess()
	})

	mqttConnect()

	setInterval(doStuff, config.statusTimer * 1000)
}

run()
