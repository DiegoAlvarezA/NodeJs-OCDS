const mongoose = require('mongoose');
const Constants = require('../../util/constants');
const Schema = mongoose.Schema;
const dayjs = require('dayjs');
const http = require('http');
const functions = require('../../util/functions');

const documentSchema = new Schema({
    id: { type: String, required: true },
    documentType: { type: String, enum: Constants.DOCUMENT_TYPE, required: true },
    title: { type: String, required: true },
    url: { type: String, required: true, validate: functions.isURL },
    datePublished: { type: String, default: dayjs().format(), validate: [functions.isValidDateFormat, functions.isDateLessEqualToday] },
    format: { type: String, enum: Constants.MIME_TYPE },
    language: { type: String, enum: Constants.LANGUAGE, required: true, default: 'es' },
    _id: false
});

documentSchema.pre('validate', function (next) {
    const that = this;
    if (that.format == null || that.format.length > 0) {
        http.request(that.url, { method: 'HEAD' }, (res) => {
            const format = res.headers['content-type'].split(';')[0];
            that.format = format;
            return next();
        }).on('error', (err) => {
            console.error(err);
        }).end();
    } else {
        return next();
    }
});

module.exports = documentSchema;