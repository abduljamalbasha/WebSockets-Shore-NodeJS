var express = require('express');
var bodyParser = require('body-parser');
var cors = require('cors');
var app = express();
var fs = require('fs');
var io = require('socket.io-client');
var config = require('./config/config');
var socket = io.connect(config.URL);
var klaw = require('klaw-sync');
var logger = require('./utils/logger').logger;
var { logging } = require('./utils/logs');
var uuid = require('uuid/v5');
var moment = require('moment');
var path = require('path');
app.use(bodyParser.json());
app.use(cors());

var fileIndex = 0;



socket.on(config.connect, () => {
  // logger.info("Vessel 1 Connected to Shore");
  socket.emit('clientName', { clientId: config.clientId, clientName: "Shore" }, (value) => {
    console.log("Connected to Server");
  })
  socket.emit(config.shipReadyToSend, { ready: config.shipReadyToSendValue }, (value) => {
    if (true === value) {
      const folders = klaw(config.communicationDirectory, { nofile: true });
      folders.forEach(folder => {
        var pathSplit = folder.path.split('\\');
        if (pathSplit[pathSplit.length - 1] === config.sendDirectory) {
          var destinationId = pathSplit[pathSplit.length - 2];
          readDirectory(config.filesFromClient, folder.path, destinationId);
          setInterval(() => {
            readDirectory(config.filesFromClient, folder.path, destinationId);
          }, 30000);
        }
      });
    }
  });

  socket.emit(config.shipReadyToReceive, { ready: config.shipReadyToReceiveValue, clientId: config.clientId });

  socket.on(config.disconnect, (listener) => {
    logger.info("Client Disconnected");
  });
});

function readDirectory(nspName, folderPath, destinationId) {
  const files = klaw(folderPath, { nodir: true });
  fileIndex = 0;
  if (files.length !== 0)
    transportFile(nspName, files, files.length, destinationId);
}

async function transportFile(nspName, files, fileCount, destinationId) {
  var url = files[fileIndex].path;
  var folderArr = url.split('\\');
  var fileName = folderArr[folderArr.length - 1];
  try {
    fs.exists(url, (exists) => {
      if (exists) {
        var startTime = moment(new Date(), 'DD-MMM-YYYY, HH:mm:ss').utc();
        logging(fileName, "Shore", "server", "Shore", destinationId, url);
        var data = fs.readFileSync(url);
        var buff = Buffer.from(data);
        socket.emit(nspName, {
          fileName: fileName, fileContent: buff, destinationId: destinationId, timeInitated: moment(new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Calcutta'
          })).format('DD-MM-YYYY, HH:mm:ss')
        }, value => {
          var endTime = moment(new Date(), 'DD-MMM-YYYY, HH:mm:ss').utc();
          logger.info("ACK - " + value);
          var secondsDifference = endTime.diff(startTime, 'seconds');
          var milliseconds = endTime.diff(startTime, 'milliseconds');
          logger.info(secondsDifference + 's ' + milliseconds + 'ms taken for ' + fileName);
          fs.unlink(url, (err) => {
            if (!err) {
              if (fileIndex < fileCount - 1) {
                setTimeout(() => {
                  fileIndex++;
                  transportFile(nspName, files, fileCount, destinationId);
                }, 1000)
              }
            }
          });
        })
      }

    })

  } catch (error) {
    console.log('error: ', error);
  }
}

socket.on(config.filesToClient, async (message, callback) => {
  var fileName = message.fileName;
  var fileContent = Buffer.from(message.fileContent);
  var vesselId = message.vesselId;
  var uuId = uuid(fileName, config.uuid);
  try {
    // await checkDirectoryExists(config.communicationDirectory + destinationId);
    if (!fs.existsSync(config.communicationDirectory))
      fs.mkdirSync(config.communicationDirectory);
    fs.writeFileSync(config.communicationDirectory + vesselId + '\\' + config.receiveDirectory + '\\' + fileName, fileContent);
    logger.info(uuId + " -Shore has received file " + fileName + "  sent from vessel " + vesselId);
  } catch (error) {
    console.log('error: ', error);
  }
  callback(uuId + ' - ' + "Shore has received " + message.fileName + " sent from vessel " + vesselId);
});


async function directoryExists(folderPath) {
  try {
    if (!fs.existsSync(folderPath))
      fs.mkdirSync(folderPath);
  } catch (error) {
    console.log('error: ', error);
  }
}

app.get('/logs', (req, res) => {
  res.sendFile(path.join(__dirname + '\\log\\trace-logs-23-01-2019.log'));
})

app.listen(config.port, () => {
  logger.info(`Server is up in port ${config.port}`);
})