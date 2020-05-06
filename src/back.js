const mongoose = require("mongoose");
const express = require("express"); // imports do not work, we use require
const bodyParser = require('body-parser');
const addrs = require("email-addresses");
const nodemailer = require('nodemailer');
const fs = require("fs");
const web3 = require("web3");
const HDWalletProvider = require("@truffle/hdwallet-provider");
const ballotInterface = require(
    "../vote-dapp-front/vote-dapp-contract/build/Ballot");
const voteDappUtil = require(
    "../vote-dapp-front/vote-dapp-contract/misc/ballot-utils");
const app  = express();
const root = "vote-dapp-front/build/";
const env = process.env;
const serverIsInProdMode = env.NODE_ENV === "production";
const networkAccess = serverIsInProdMode ? env.MONGO_NAME : "localhost";
// changes to the config file are taken into account at server restart
let mailConfig;
try {
    mailConfig = require("../config/mail");
} catch {
    console.log("mail config file not found, switching to default");
    mailConfig = require("../config/mail-default");
}
const transporter = nodemailer.createTransport({
    service: mailConfig.service,
    host: mailConfig.host,
    port: (mailConfig.port ? mailConfig.port : undefined),
    secure: mailConfig.secure,
    auth: (mailConfig.enableAuth ? mailConfig.auth : undefined),
    tls: mailConfig.tls
});

// used to store ballot info during ballot deployment
let temporaryStorage = {
    name: null,
    mails: null,
    codes: null,
    images: null
};

let web3Instance = new web3(new HDWalletProvider(mailConfig.privateKey,
    "https://rinkeby.infura.io/v3/7697fcd995504eec91d5e6fd4514aef3"));
let web3Accounts;
web3Instance.eth.getAccounts().then(res => web3Accounts = res);


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

    app.use(bodyParser.json());
    app.use((req, res, next) => { // cors to Infura
        res.header('Access-Control-Allow-Origin',
            'https://rinkeby.infura.io/v3/7697fcd995504eec91d5e6fd4514aef3');
        res.header('Access-Control-Allow-Methods', 'POST,GET,OPTIONS,PUT,DELETE');
        res.header('Access-Control-Allow-Headers', 'Content-Type,Accept,X-Requested-With');
        next();
    });
    app.get('/', function (req, res)
    {
        res.sendFile("index.html",{root:root});
    }).get('/api/get-address/:ballotName',function (req, res){
        ballotName = req.params.ballotName; // no need for decode uri
        Ballot.find({ name: ballotName }, (err, ballot) => {
            if (err) return console.error(err);
            if(ballot.length === 0)
                notFoundAnswer(req,res);
            else
                res.status(200).json(ballot[0].address); // send in json
        });
    }).get('/*', function (req, res) {
        accessedFile = req.originalUrl;
        if(!accessedFile.includes("..")) /* for security, but doesn't work
        (dunno why) */
            if (fs.existsSync((serverIsInProdMode ? root : "")
                + accessedFile)) {
                res.sendFile(accessedFile, {root: root}, () => {
                    // no callback set
                });
            } else {
                res.sendFile("index.html",{root:root});
            }
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
    })  // .post down here finalises ballot's creation process
        .post('/api/set-ballot-address',function (req,res) {
        const receivedJson = req.body;
        const {name, address} = receivedJson;

        if (name !== temporaryStorage.name){ // error
            const errMsg = "error: there has been an interference" +
                "in the ballot data exchange process";
            res.status(422).send(errMsg);
            console.log(errMsg);
        } else { // right name
            Ballot.find({name: name}).exec((err,ballot) => {
                if (err) return console.error(err);
                ballot[0].address = address;
                ballot[0].save(); // setting ballot's address
                sendMails(name);
            });
            res.status(200).send("OK");
        }
    }).post('/api/vote', (req, res) => {
        console.log("vote received");
        const receivedJson = req.body;
        const {_address,_code,_vote} = receivedJson;
        const contract = new web3Instance.eth.Contract(
            ballotInterface.abi,_address);

        contract.methods.vote(_vote,_code).send({from: web3Accounts[0]})
            .then(() => {
            res.status(200).send("OK");
        }).catch(error => {
            console.log(error);
            res.status(502).send(error);
        });
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

function sendMails(ballotName) {
    let mailOptions;
    let mailAddress;
    let codeUri;
    let link;
    let linkPort = env.SERVED_ON_PORT === "80" ? "" : `:${env.SERVED_ON_PORT}`;
    let nameUri = encodeURIComponent(ballotName);
    let localAddress = mailConfig.url;

    temporaryStorage.mails.forEach((mail,index) => {
        mailAddress = mail.address;
        codeUri = encodeURIComponent(temporaryStorage.codes[index]);
        link = `${localAddress}${linkPort}/` +
        `?code=${codeUri}&name=${nameUri}`;
        mailOptions = {
            to: mailAddress,
            subject: mailConfig.message.subject,
            html: `<p>Cher(e) ${mailAddress}</p>` + mailConfig.message.html +
                `<a href="${link}">lien du scrutin</a>`,
            text: `Cher(e) ${mail.parts.name} \n` + mailConfig.message.text +
                `\n ${link}`
        };
        transporter.sendMail(mailOptions, (error,info) => {
            if (error)
                handleError("error from sendMail " +
                    `on ${mailAddress}` + error);
            else
                console.log(`mail sent to ${mailAddress}: ` + info.response);
        });
    });
}

function handleError(error) {
    console.log(error);
}