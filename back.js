const express = require('express');
const app = express();
const mongoose = require('mongoose');

mongoose.connect(`mongodb://${process.env.MONGO_NAME}:${process.env.MONGO_PORT}/${process.env.DB_NAME}`,
    {useNewUrlParser: true, useUnifiedTopology: true},
    () => {console.log("connection established")})
    .catch(error => handleError(error));
let db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {

    app.get('/', function (req, res)
    {

    }).use(function(req, res)
    {
        res.setHeader('Content-Type', 'text/plain');
        res.status(404).send('Error 404');
    });

    app.listen(3000, function () {
        console.log('Express-js listening on port 3000')
    });
});