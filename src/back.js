const mongoose = require("mongoose");
const express = require("express"); // imports do not work, we use require

const app  = express();
const root = "vote-dapp-front/build/";
const env = process.env;
const serverIsInProdMode = env.NODE_ENV === "production";
const networkAccess = serverIsInProdMode ? env.MONGO_NAME : "localhost";

mongoose.connect(`mongodb://${networkAccess}:
  ${env.MONGO_PORT}/${env.DB_NAME}`,
    {useNewUrlParser: true, useUnifiedTopology: true},
    () => {console.log("connection established")})
    .catch(error => handleError(error));
let db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
    let accessedFile = "";
    let ballotName   = "";
    let ballotSchema = new mongoose.Schema({
        name: {
            unique : true,
            required : true,
            type : String},
        address: {
            unique : true,
            required : true,
            type : String},
        images: [Buffer]
    });
    let Ballot = mongoose.model('Ballot', ballotSchema);

    app.get('/', function (req, res)
    {
        res.sendFile("index.html",{root:root});
    }).get('/api/:ballotName',function (req, res){
        // TODO : remove logs
        console.log("okyo");
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
                console.log(accessedFile);
                // no callback set
            });
        else
            notFoundAnswer(req, res);
    }).post('/api/new-ballot',function (req,res) {
        let receivedJson = req.body;
        console.log(req);
        let _name        = receivedJson.name;
        let _mails       = receivedJson.mails;
        let _images      = receivedJson.images;
        let errorOccurred = false;

        if (Buffer.byteLength(_name) <= 32){
            let newBallot = new Ballot({
                name : _name,
                address: {},
                images: _images
            });
            newBallot.save(function (err) {
                if (err) {
                    res.status(422).send(err);
                    errorOccurred = true;
                }
            });
            if (! errorOccurred)
                res.status(200).send('OK');
        }
        else
            res.status(400).send('Bad request');
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
