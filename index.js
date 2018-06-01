const LED_HOST = "192.168.1.56"; // Host of LED controller - TODO: Autodiscover
const LED_PORT = 5577;
const LISTEN_PORT = 41234;       // UDP port to listen on
const changeIterations = 6;      // How many updates for smooth transitions
const transitionTime = 200;      // How long (ms) should the transition take?

const net = require('net');
const client = new net.Socket();
const dgram = require('dgram');
const server = dgram.createSocket('udp4');
const Log = require('log'),
      log = new Log('debug');

// Establish and maintain a socket - cite
// https://stackoverflow.com/a/44503926/811814
var intervalConnect = false;
function connect() {
    client.connect({
        port: LED_PORT,
        host: LED_HOST
    })
    client.setTimeout(5000);
}
function launchIntervalConnect() {
    if (false != intervalConnect) return;
    intervalConnect = setInterval(connect, 5000);
}

function clearIntervalConnect() {
    if (false == intervalConnect) return;
    clearInterval(intervalConnect);
    intervalConnect = false;
}

client.on('connect', () => {
    clearIntervalConnect();
    log.notice('connected to server', 'TCP');
});

client.on('close', launchIntervalConnect);
client.on('error', launchIntervalConnect);
client.on('timeout', launchIntervalConnect);
client.on('end', launchIntervalConnect);
connect();

// Send colours over to the LED controller
// Do not update when the same colour is trying to be set
var lastSend = {};
var sendColour = function(r, g, b) {
    let checksum = r + g + b + 64;
    while (checksum > 256) {
        checksum -= 256;
    }
    let data = new Buffer([0x31, r, g, b, 0, 0, 0x0f, checksum]);
    
    if (data.toString('hex') !== lastSend.toString('hex')) {
        log.debug('Sending r: %s g: %s b: %s', r, g, b);
        client.write(data);
        lastSend = data;
    }
}

// Handle incoming UDP messages, on/off/HEX
// TODO: Determine previousColour by reading it
var previousColour = {r: 0, g: 0, b: 0};
server.on('message', (msg, rinfo) => {
    log.debug('Server received the instruction: #%s', msg)
    
    if (msg == "on") {
        // TODO: Read current value, set to 0x00 0x00 0x00 and transition to it
        let data = new Buffer([0x71, 0x23, 0x0F, 0xA3]);
        client.write(data);
    }
    else if (msg == "off") {
        // TODO: Smooth transition to 0x00 0x00 0x00
        let data = new Buffer([0x71, 0x24, 0x0F, 0xA4]);
        client.write(data);
    } else {
        var msg = msg.toString();
        let red = parseInt(msg.substring(0,2), 16);
        let green = parseInt(msg.substring(2,4), 16);
        let blue = parseInt(msg.substring(4,6), 16);

        // Logic for smoothing changes to hue
        for (var i = 1; i < changeIterations + 1; i++){
            let newRed = ((red - previousColour.r) / changeIterations) * i;
            let newGreen = ((green - previousColour.g) / changeIterations) * i;
            let newBlue = ((blue - previousColour.b) / changeIterations) * i;

            setTimeout( 
                sendColour.bind(
                    null,
                    Math.floor(previousColour.r + newRed),
                    Math.floor(previousColour.g + newGreen),
                    Math.floor(previousColour.b + newBlue),
                ),
                (transitionTime / changeIterations) * i
            );
        }

        previousColour = {r: red, g: green, b: blue};
    }

});

// Bind UDP socket
server.on('listening', () => {
    const address = server.address();
    log.notice('UDP server listening on %s:%s', address.address, address.port);
});
server.bind(LISTEN_PORT);
