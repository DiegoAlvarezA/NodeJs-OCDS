const { validationResult } = require('express-validator');
const slowDown = require("express-slow-down");
const multer = require('multer');
const FILE_PATH = 'releases';
const organizationReference = require('../models/organizationReference/organizationReference');
const path = require('path');

module.exports = {
    validate: (req, res, next) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(422).json({ status: false, errors: errors.array() });
        }
        next();
    },
    isAuth: (req, res, next) => {
        if (req.isAuthenticated()) {
            return next();
        }
        res.status(401).json({
            status: false,
            message: 'Unauthorized'
        });
    },
    speedLimiter: slowDown({
        windowMs: 15 * 60 * 1000, // 15 minutes
        delayAfter: 100, // allow 100 requests per 15 minutes, then...
        delayMs: 500 // begin adding 500ms of delay per request above 100:
    }),
    upload: multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, `${FILE_PATH}/`);
            },
            filename: (req, file, cb) => {
                organizationReference.findOne({ user: req.user._id }, (err, organization) => {
                    cb(null, `releases-${organization.name.replace(/\s/g, '-')}-${Date.now()}${path.extname(file.originalname)}`)
                });
            }
        }),
        fileFilter: (req, file, cb) => {
            if (!file.originalname.match(/\.(xls|xlsx)$/)) {
                return cb(new Error('Solo se permiten archivos xls/xlsx'), false);
            }
            cb(null, true);
        },
        limits: {
            fileSize: 50000,
            fieldNameSize: 50000
        }
    })
}