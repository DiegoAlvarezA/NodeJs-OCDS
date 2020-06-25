const express = require('express');
const router = express.Router();
const passport = require('passport');
const { check, body } = require('express-validator');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_KEY);

const { validate, speedLimiter, isAuth } = require('../middleware');
const User = require('../models/user/user');

router.post('/signup', [
    check('email')
        .exists().withMessage('Email es requerido')
        .isEmail().withMessage('Email inválido')
        .custom((value, { req }) => {
            return User.findOne({ email: value }).then(userDoc => {
                if (userDoc) {
                    return Promise.reject(
                        'Correo electrónico ya existe, elija uno diferente.'
                    );
                }
            });
        })
        .normalizeEmail(),
    check('userName')
        .exists().withMessage('Se requiere nombre de usuario')
        .matches(/^(?=.{8,20}$)(?![_.-])(?!.*[_.-]{2})[a-zA-Z0-9._-]+(?<![_.-])$/)
        .withMessage('Minimo 8, máximo 20 caracteres. No puede comenzar o terminar, ni tener una secuencia de caracteres repetidos por: -_.')
        .custom((value, { req }) => {
            return User.findOne({ userName: value }).then(userDoc => {
                if (userDoc) {
                    return Promise.reject(
                        'El nombre de usuario ya existe, elija uno diferente.'
                    );
                }
            });
        })
        .trim(),
    body(
        'password',
        'Ingrese una contraseña con solo números/texto y al menos 8 caracteres..'
    )
        .isLength({ min: 8 })
        .isAlphanumeric()
        .trim(),
    body('confirmPassword')
        .exists().withMessage('confirmPassword es requerido')
        .trim()
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Contraseñas no coinciden');
            }
            return true;
        })
],
    validate,
    (req, res, next) => {
        passport.authenticate('local-signup', (err, user, info) => {
            if (err) {
                return res.status(401).json(err);
            }
            if (user) {
                return res.status(201).json({
                    status: true,
                    message: 'Nuevo usuario registrado',
                    data: user.userName
                });
            } else {
                res.status(401).json({
                    status: false,
                    message: info.message,
                    data: []
                });
            }
        })(req, res, next);
    });

router.post('/login', [
    speedLimiter,
    body('email')
        .isEmail()
        .withMessage('Por favor, introduce una dirección de correo electrónico válida.')
        .normalizeEmail(),
    body('password', 'La contraseña tiene que ser válida.')
        .isLength({ min: 8 })
        .isAlphanumeric()
        .trim()
],
    validate,
    (req, res, next) => {
        passport.authenticate('local-login', (err, user, info) => {
            if (err) {
                return res.status(401).json(err);
            }
            if (!user) {
                let code = 401;
                if (info.statusCode) {
                    code = info.statusCode
                    res.setHeader('Retry-After', info.retrySecs);
                };
                return res.status(code).json({
                    status: false,
                    message: info.message,
                    retrySecs: info.retrySecs
                });
            }
            req.logIn(user, function (err) {
                if (err) { return res.status(401).json(err); }
                res.status(200).json({
                    status: true,
                    message: 'Inicio de sesión exitoso',
                    data: req.user.userName
                });
            })
        })(req, res, next);
    });

router.get('/logout', (req, res, next) => {
    req.logout();
    res.json({
        status: true,
        message: 'Sesión finalizada'
    });
});

router.get('/profile', isAuth, (req, res, next) => {
    res.json({
        status: true,
        message: 'Usuario logueado',
        data: req.user.userName
    });
    //res.render('profile')
});

router.post('/recover', (req, res) => {
    User.findOne({ $or: [{ email: req.body.userNameOrEmail }, { userName: req.body.userNameOrEmail }] })
        .then(user => {
            if (!user) return res.status(200).json({ status: true, message: 'Si el email o nombre de usuario existe, se enviará un correo para confirmar el cambio de contraseña' });

            user.generatePasswordReset();
            user.save()
                .then(user => {
                    let link = 'http://' + req.headers.host + '/api/reset/' + user.resetPasswordToken;
                    const mailOptions = {
                        to: user.email,
                        from: process.env.SENDGRID_FROM_EMAIL,
                        subject: 'Solicitud cambio de contraseña SECOP3',
                        text: `Hola ${user.userName} \n 
                        Haga clic en el siguiente enlace ${link} para restablecer su contraseña. \n\n 
                        Si no solicitó esto, ignore este correo electrónico y su contraseña permanecerá sin cambios.\n`
                    };
                    sgMail.send(mailOptions, (error, result) => {
                        if (error) return res.status(500).json({ message: error });

                        res.status(200).json({ status: true, message: 'Si el email o nombre de usuario existe, se enviará un correo para confirmar el cambio de contraseña' });
                    });
                })
                .catch(err => res.status(500).json({ status: false, message: err.message }));
        })
        .catch(err => res.status(500).json({ status: false, message: err.message }));
});

router.get('/reset/:token', (req, res) => {
    User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, '-_id')
        .select('userName email resetPasswordExpires')
        .then((user) => {
            if (!user) return res.status(401).json({ status: false, message: 'El token no es válido o ha expirado.' });
            res.json({
                status: true,
                message: 'Usuario',
                data: user
            });
        })
        .catch(err => res.status(500).json({ status: false, message: err.message }));
});

router.post('/reset/:token',
    [
        check('password').not().isEmpty().isLength({ min: 8 }).isAlphanumeric().trim()
            .withMessage('Ingrese una contraseña con solo números/texto y al menos 8 caracteres.'),
        check('confirmPassword').exists().withMessage('confirmPassword es requerido')
            .trim()
            .custom((value, { req }) => {
                if (value !== req.body.password) {
                    throw new Error('Contraseñas no coinciden');
                }
                return true;
            })
    ],
    validate,
    (req, res) => {
        User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } })
            .then((user) => {
                if (!user) return res.status(401).json({ status: false, message: 'El token no es válido o ha expirado.' });

                user.password = req.body.password;
                user.resetPasswordToken = undefined;
                user.resetPasswordExpires = undefined;

                user.save((err) => {
                    if (err) return res.status(500).json({ status: false, message: err.message });

                    const mailOptions = {
                        to: user.email,
                        from: process.env.SENDGRID_FROM_EMAIL,
                        subject: 'Tu contraseña ha sido cambiada SECOP3',
                        text: `Hola ${user.userName} \n 
                    La contraseña de su cuenta ${user.email} acaba de ser cambiada.\n`
                    };

                    sgMail.send(mailOptions, (error, result) => {
                        if (error) return res.status(500).json({ status: false, message: error.message });

                        res.status(200).json({ status: true, message: 'Contraseña ha sido actualizada' });
                    });
                });
            });
    });

module.exports = router;