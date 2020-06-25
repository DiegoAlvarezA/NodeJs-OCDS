const express = require('express');

const app = express();

app.use(require('./auth'));
app.use(require('./contract'));
app.use(require('./organization'));

module.exports = app;