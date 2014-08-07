var http = require('http');
var fs = require("fs");
var port = Number(process.env.PORT || 13137);
var express = require("express");
var app = express();

var nodecr = require('nodecr');
var jpeg = require('jpeg-js');
var img = require('lwip');

var request = require('request');
var _ = require('underscore');
var APP_KEY = "db23f5ab-dc30-4439-8eb5-77caa746d311";

/** trim() method for String */
String.prototype.trim = function() {
  return this.replace(/(^\s*)|(\s*$)/g,'');
};


// get text by image
// type: encodedData/image
//    engodeData  : base64 string
//    image       : image src
// G: threshold value
// T: threshold value
// callback(text)
var ocr = function(type, src, G, T, callback) {
  var jpegData;
  if (type == 'encodedData') jpegData = new Buffer(src, 'base64');
  else jpegData = fs.readFileSync(src);
  var rawImageData = jpeg.decode(jpegData);
  var buffer = rawImageData.data;
  var i = 0;
  while (i < buffer.length) {
    var r = buffer[i];
    var g = buffer[i+1];
    var b = buffer[i+2];
    var gray = (r*30 + g*59 + b*11 + 50) / 100;
    var t = Math.abs(r-g) + Math.abs(g-b) + Math.abs(b-r);
    if (gray < G || t > T) gray = 0;
    else {
        gray = 255;
    }
    buffer[i] = gray;
    buffer[i+1] = gray;
    buffer[i+2] = gray;

    i += 4; //alpha is ignored
  }
  var jpegImageData = jpeg.encode(rawImageData);
  var file = fs.createWriteStream('result1.jpg');
  file.write(jpegImageData.data, function() {
    img.open('result1.jpg', function(err, image) {
      image.resize(image.width()*30/image.height(), 30, function(err, image) {
        image.writeFile('result2.jpg', function() {
          nodecr.process('result2.jpg',function(err, text) {
            if (callback != undefined) callback(err, text);
          }, 'eng', 7);
        });
      });
    });
  });

}


// get Summoner info by name
// callback(json)
var getInfo = function(name, callback) {
  var api = 'https://na.api.pvp.net/api/lol/na/v1.4/summoner/by-name/' + name + '?api_key=' + APP_KEY;
  var data = {}, error = "";
  data['name'] = name;
  console.log('Name: ' + name);
  request(api, function (er, response, body) {
    if (!er) {
      if (response.statusCode == 200) {
        var json = JSON.parse(body);
        for (var i in json) {
          var id = json[i].id;
          data['id'] = id;
          console.log('ID: ' + id);
          api = 'https://na.api.pvp.net/api/lol/na/v2.4/league/by-summoner/' + id + '?api_key=' + APP_KEY;
          var sync = 0;
          request(api, function (er, response, body) {
            if (!er) {
              if (response.statusCode == 200) {
                json = JSON.parse(body);
                json = json[id];
                var item = _.findWhere(json, {queue: 'RANKED_SOLO_5x5'});
                if (item == undefined) error = 'Ranked solo 5x5 queue not found';
                else {
                  var entry = _.findWhere(item['entries'], {playerOrTeamId: id.toString()});
                  var rank = item['tier'] + ' ' + entry['division'];
                  data['rank'] = rank;
                  console.log('Rank: ' + rank);
                }
              } else error = 'League not found';              
            } else error = 'Connection error';
            sync++;
            if (sync == 2) {
              if (error != "") callback({statues: 'Error', error: error, name: name});
              else callback({statues: 'Success', data: data});
            }   
          });
          api = 'https://na.api.pvp.net/api/lol/na/v1.3/stats/by-summoner/' + id + '/summary?season=SEASON4&api_key=' + APP_KEY;
          request(api, function (er, response, body) {
            if (!er) {
              if (response.statusCode == 200) {
                json = JSON.parse(body);
                json = json['playerStatSummaries'];
                var item = _.findWhere(json, {playerStatSummaryType: 'RankedSolo5x5'});
                if (item == undefined) error = 'Ranked solo 5x5 not found';
                else {
                  data['wins'] = item['wins'];
                  data['losses'] = item['losses'];
                  console.log('Wins: ' + data['wins']);
                  console.log('Losses: ' + data['losses']);
                }               
              } else error = 'Stats data not found';              
            } else error = 'Connection error';   
          });
          sync++;
          if (sync == 2) {
            if (error != "") callback({statues: 'Error', error: error, name: name});
            else callback({statues: 'Success', data: data});
          }   
        }
      } else callback({statues: 'Error', error: 'Wrong summoner name', name: name});
    } else callback({statues: 'Error', error: 'Connection error', name: name});     
  });
}

//G=200 T=40 for test1 test2!
//G=200 T=100 for test3 test4!
/*
ocr('test3.jpg', 200, 100, function(err, text) {
  console.log('Text: ' + text);
})
*/

var getInfoByImage = function(image, callback) {
  ocr('image', image, 200, 100, function(err, text) {
    text = text.trim();
    getInfo(text, callback);
  })
}

var getInfoByBase64Image = function(encodedData, callback) {
  ocr('encodedData', encodedData, 200, 100, function(err, text) {
    text = text.trim();
    getInfo(text, callback);
  })

}


/* 
getInfoByPhoto('test4.jpg', function(data) {
  console.log(data);
});
*/


/*
 * Set-up the Express app.
 */
app.configure(function() {    
    app.use(express.bodyParser());  
});
app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res) {
  res.send('It works!');
});

app.get('/getInfo/:name', function(req, res) {
  var name = req.param('name');
  getInfo(name, function(data) {
    res.json(data);
  });
});


app.post('/getRankInfoWithImageData', function(req, res) {
  console.log(req.files.image);
  var tmp_path = req.files.image.path;
  var imageBuf = fs.readFileSync(tmp_path);
  var encodedData = imageBuf.toString('base64');
  
  //var encodedData = req.body.data;
  if (encodedData == undefined || !encodedData) {
    res.json({statues: 'Error', error: 'POST error'});
    return;
  }
  ocr('encodedData', encodedData, 200, 100, function(err, text) {
    text = text.trim();
    getInfo(text, function(data) {
      res.json(data);
    });
  })
});

app.listen(port);
