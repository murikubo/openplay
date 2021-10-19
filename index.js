const express = require('express');
const app = express();
const bodyparser = require('body-parser');
let configFile = require('./config/config.json');

app.use(bodyparser.urlencoded({ 'extended': 'true' }));
app.use(bodyparser.json());

Promise.resolve()
    .then(() => {
        app.listen(configFile.Use_Port, () => console.log(`app listening on port ${configFile.Use_Port}`))
        app.get('/', (req, res) => res.send('You are listening to radio happy!'))
        return true;
    }).then(() => {
        const router = require('./router')(app);
    })
