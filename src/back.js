const mongoose = require("mongoose");
const express = require("express"); // imports do not work, we use require
const bodyParser = require('body-parser');
const addrs = require("email-addresses");
const voteDappUtil = require(
    "../vote-dapp-front/vote-dapp-contract/misc/ballot-utils");

const app  = express();
const root = "vote-dapp-front/build/";
const env = process.env;
const serverIsInProdMode = env.NODE_ENV === "production";
const networkAccess = serverIsInProdMode ? env.MONGO_NAME : "localhost";

mongoose.connect(`mongodb://${networkAccess}:
  ${env.MONGO_PORT}/${env.DB_NAME}`,
    {useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true},
    () => {console.log("connection established")})
    .catch(error => handleError(error));
let db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
    let accessedFile = "";
    let ballotName   = "";
    let ballotSchema = new mongoose.Schema({
        name: {
            unique : true, // must stay this way
            required : true,
            type : String},
        address: {
            type : String},
        images: [Buffer]
    });
    let Ballot = mongoose.model('Ballot', ballotSchema);

    // used to store ballot info during ballot deployment
    let temporaryStorage = {
        name: null,
        mails: null,
        codes: null,
        images: null
    };

    app.use(bodyParser.json());
    app.get('/', function (req, res)
    {
        res.sendFile("index.html",{root:root});
    }).get('/api/:ballotName',function (req, res){
        ballotName = req.params.ballotName;
        Ballot.find({ name: ballotName }, (err, ballot) => {
            if (err) return console.error(err);
            if(ballot.length === 0)
                notFoundAnswer(req,res);
            else
                res.json(ballot); // send in json
        });
    }).get('/*', function (req, res)
    {
        accessedFile = req.originalUrl;
        if(!accessedFile.includes("..")) // for security
            res.sendFile(accessedFile,{root:root}, () => {
                // no callback set
            });
        else
            notFoundAnswer(req, res);
    }).post('/api/new-ballot',function (req,res) {
        let receivedJson = req.body;
        let _name        = receivedJson.name;
        let _mails       = receivedJson.mails;
        let _images      = receivedJson.images;

        if (Buffer.byteLength(_name) <= 32){
            let newBallot = new Ballot({
                name: _name
            });
            let computedMails = addrs.parseAddressList(_mails);
            let codes = [];
            let voterCodeHashes = [];
            let tempCode;

            computedMails.forEach(() => {
                // creating random codes ex: om5v3gorggk
                tempCode = Math.random().toString(36).substring(2);
                codes.push(tempCode);
                voterCodeHashes.push(voteDappUtil.strToHash(tempCode));
            });
            newBallot.save(function (err) {
                if (err) {
                    res.status(422).send(err);
                    console.log("error in ballot saving :");
                    console.log(err);
                } else {
                    // could use ES6 destructured assign here
                    temporaryStorage.codes = codes;
                    temporaryStorage.mails = computedMails;
                    temporaryStorage.name = _name;
                    res.status(200).json(voterCodeHashes);
                }
            });
        }
        else
            res.status(400).send('Bad request');
    }).post('/api/set-ballot-address',function (req,res) {
        const receivedJson = req.body;
        const {name, address} = receivedJson;

        if (name !== temporaryStorage.name){ // error
            const errMsg = "error: there has been an interference" +
                "in the ballot data exchange process"
            res.status(422).send(errMsg);
            console.log(errMsg);
        } else { // right name
            Ballot.find({name: name}).exec((err,ballot) => {
                if (err) return console.error(err);
                console.log(ballot[0]);
            });
            res.status(200).send("OK");
        }
    }).use(function(req, res) // if no above path is recognized
    {
        notFoundAnswer(req,res);
    });

    app.listen(3000, function () {
        console.log('Express-js listening on port 3000');
    });
});

function notFoundAnswer(req,res) {
    res.setHeader('Content-Type', 'text/plain');
    res.status(404).send('Error 404');
}

function handleError(error) {
    console.log(error);
}