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
var APP_KEY = [
  "db23f5ab-dc30-4439-8eb5-77caa746d311",
  "23c905fd-c6b7-4fdf-803c-3e960e47e227",
  "25bf6a70-64af-4168-a010-2fe161dce4eb",
  "0d5f306d-fcde-4821-9631-b0af7279cd2b",
  "a8ae7d5f-b085-4941-9b5e-003d6a08b08e",
  "33bc1a79-4247-4a7c-9a89-cd857be93285",
  "e5c5ee48-0eb4-4a44-98fb-10608956aaec",
  "93becfe9-f7b2-4f27-a065-73ad275cda55",
  "88c91081-2488-442f-8e03-044b9b0d7ee2",
  "9fed0793-7fb0-44bd-abea-7ff1cb5be74f"
];

var key = function() {
  return APP_KEY[parseInt(Math.random()*APP_KEY.length)];
}

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
  var file = fs.createWriteStream('result1_' + G + '_' + T + '.jpg');
  file.write(jpegImageData.data, function() {
    img.open('result1_' + G + '_' + T + '.jpg', function(err, image) {
      image.resize(image.width()*30/image.height(), 30, function(err, image) {
        image.writeFile('result2_' + G + '_' + T + '.jpg', function() {
          nodecr.process('result2_' + G + '_' + T + '.jpg',function(err, text) {
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
  var api = 'https://na.api.pvp.net/api/lol/na/v1.4/summoner/by-name/' + name + '?api_key=' + key();
  var data = {}, error = "";
  console.log('Name: ' + name);
  request(api, function (er, response, body) {
    if (!er) {
      if (response.statusCode == 200) {
        var json = JSON.parse(body);
        for (var i in json) {
          var id = json[i].id;
          data['name'] = json[i].name;
          data['id'] = id;
          console.log('ID: ' + id);
          api = 'https://na.api.pvp.net/api/lol/na/v2.4/league/by-summoner/' + id + '?api_key=' + key();
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
              if (error != "") callback({status: 'Error', error: error, name: name});
              else callback({status: 'Success', data: data});
            }   
          });
          api = 'https://na.api.pvp.net/api/lol/na/v1.3/stats/by-summoner/' + id + '/summary?season=SEASON4&api_key=' + key();
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
            if (error != "") callback({status: 'Error', error: error, name: name});
            else callback({status: 'Success', data: data});
          }   
        }
      } else callback({status: 'Error', error: 'Wrong summoner name', name: name});
    } else callback({status: 'Error', error: 'Connection error', name: name});     
  });
}

//G=200 T=40 for test1 test2!
//G=200 T=100 for test3 test4!
/*
ocr('test3.jpg', 200, 100, function(err, text) {
  console.log('Text: ' + text);
})
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
  // console.log(req.files.image);
  var encodedData;

  // var tmp_path = req.files.image.path;
  // var imageBuf = fs.readFileSync(tmp_path);
  // encodedData = imageBuf.toString('base64');

  encodedData = req.body.data;

  if (encodedData == undefined || !encodedData) {
    res.json({status: 'Error', error: 'POST error'});
    return;
  }
  var max_G  = 240,
      min_G  = 180,
      step_G = 20,  
      min_T  = 40,
      max_T  = 100,
      step_T = 20;
  var sync = ((max_G - min_G)/step_G + 1)*((max_T - min_T)/step_T + 1);
  var end = false;
  var arr = [];
  for (var G = max_G; G >= min_G; G -= step_G)
    for (var T = min_T; T <= max_T; T += step_T) {
      ocr('encodedData', encodedData, G, T, function(err, text) {
        text = text.trim();
        //console.log(text);
        sync--;
        if (text.match(/^(\w|\s)*$/g)) {
          console.log(text);
          // getInfo(text, function(data) {
          //   res.json(data);
          // });
          text = text.replace(/\s/g, '');
          text = text.toLowerCase();
          arr.push(text);
        }
        if (sync == 0) {
          arr = _.uniq(arr);
          console.log(arr);
          for (var i in arr) {
            var name = arr[i];
            getInfo(name, function(data) {               if (data['status'] == 'Success' && !end) {
                res.json(data);
                end = true;
              }              
            });
          }
        }
      })
    }
});

app.listen(port);
