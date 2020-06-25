require('./config/keys');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const morgan = require('morgan');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const MongoStore = require('connect-mongo')(session);
const cachegoose = require('cachegoose');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

const app = express();

const virtualDirPath = process.env.NODE_ENV === 'dev' ? __dirname : process.env.virtualDirPath;
app.use(helmet());
cachegoose(mongoose, {
    engine: 'redis',
    port: 6379,
    host: 'localhost'
});
app.set('trust proxy', 1)
app.use(
    cors({
        credentials: true,
        origin: true
    })
);
app.use(morgan('dev'));
app.use(bodyParser.json({ limit: '10kb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(mongoSanitize());
app.use(xss());
app.use(express.static(path.join(__dirname, 'public/dist')));
mongoose.connect(process.env.URLDB, { useNewUrlParser: true });

app.use(session({
    proxy: true,
    name: 'sessionId',
    secret: process.env.SEED,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 19 * 60000 },
    store: new MongoStore({
        mongooseConnection: mongoose.connection
    })
}));
global.mongoConn = mongoose.connection;
global.cache = cachegoose;
cachegoose.clearCache(null, () => {
    console.log('CacheClear')
})
app.use(passport.initialize());
app.use(passport.session());

require('./passport/local-auth');
app.use('/api', require('./routes/index'));
app.get('*', function (req, res) {
    res.sendFile('index.html', { root: path.join(virtualDirPath, 'public/dist') });
});
app.use((error, req, res, next) => {
    if (typeof error !== 'object') {
        error = error.toString();
    };
    res.status(400).json({
        error: error,
        status: false,
    });
});
async function startServer() {
    app.listen(process.env.PORT, err => {
        if (err) {
            console.log(err);
            return;
        }
        console.log(`Server is ready !`);
    });
}
startServer();
