const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/user/user');
const { RateLimiterMongo, RateLimiterRes } = require('rate-limiter-flexible');

const maxWrongAttemptsFromIPperDay = 100;
const maxConsecutiveFailsByUsernameAndIP = 10;

const limiterSlowBruteByIP = new RateLimiterMongo({
    storeClient: mongoConn,
    keyPrefix: 'login_fail_ip_per_day',
    points: maxWrongAttemptsFromIPperDay,
    duration: 60 * 60 * 24,
    blockDuration: 60 * 60 * 3, // Block for 3 hours, if 100 wrong attempts per day
});

const limiterConsecutiveFailsByUsernameAndIP = new RateLimiterMongo({
    storeClient: mongoConn,
    keyPrefix: 'login_fail_consecutive_username_and_ip',
    points: maxConsecutiveFailsByUsernameAndIP,
    duration: 60 * 60 * 24 * 14, // Store number for 14 days since first fail
    blockDuration: 60 * 60, // Block for 1 hour
});

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    const user = await User.findById(id);
    done(null, user);
});

passport.use('local-signup', new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password',
    passReqToCallback: true
}, async (req, email, password, done) => {
    const user = await User.findOne({ email: email });
    if (user) {
        return done(null, false, { message: 'Email inválido' });
    } else {
        const newUser = new User();
        newUser.userName = req.body.userName;
        newUser.email = email;
        newUser.password = password;
        await newUser.save();
        done(null, newUser);
    }
}));

passport.use('local-login', new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password',
    passReqToCallback: true
}, async (req, email, password, done) => {
    const usernameIPkey = `${email}_${req.ip}`;
    let resUsernameAndIP;
    try {
        let retrySecs = 0;

        const resGet = await Promise.all([
            limiterConsecutiveFailsByUsernameAndIP.get(usernameIPkey),
            limiterSlowBruteByIP.get(req.ip),
        ]);
        resUsernameAndIP = resGet[0];
        const resSlowByIP = resGet[1];

        // Check if IP or Username + IP is already blocked
        if (resSlowByIP !== null && resSlowByIP.consumedPoints > maxWrongAttemptsFromIPperDay) {
            retrySecs = Math.round(resSlowByIP.msBeforeNext / 1000) || 1;
        } else if (resUsernameAndIP !== null && resUsernameAndIP.consumedPoints > maxConsecutiveFailsByUsernameAndIP) {
            retrySecs = Math.round(resUsernameAndIP.msBeforeNext / 1000) || 1;
        }

        if (retrySecs > 0) {
            return done(null, false, { statusCode: 429, retrySecs });
        }
    } catch (err) {
        return done(err);
    }
    User.findOne({ email: email }, async (err, user) => {
        if (err) {
            return done(err);
        };
        if (!user || !user.comparetPassword(password)) {
            try {
                await Promise.all([
                    limiterConsecutiveFailsByUsernameAndIP.consume(usernameIPkey),
                    limiterSlowBruteByIP.consume(req.ip)
                ])
                return done(null, false, { message: 'Correo electrónico o contraseña no válidos' });
            } catch (rlRejected) {
                if (rlRejected instanceof RateLimiterRes) {
                    return done(null, false, { statusCode: 429, retrySecs: Math.round(rlRejected.msBeforeNext / 1000) || 1 });
                } else {
                    return done(rlRejected);
                }
            }
        } else {
            if (resUsernameAndIP !== null && resUsernameAndIP.consumedPoints > 0) {
                try {
                    await limiterConsecutiveFailsByUsernameAndIP.delete(usernameIPkey);
                } catch (err) {
                    console.log(err);
                }
            }
            return done(null, user);
        }
    });
}));