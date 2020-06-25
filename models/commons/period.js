const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const functions = require('../../util/functions');

const periodSchema = new Schema({
    startDate: { type: String, required: true, validate: functions.isValidDateFormat },
    endDate: { type: String, validate: [functions.isValidDateFormat, functions.isDateGreaterEqualStartDate] },
    maxExtentDate: { type: String, validate: [functions.isValidDateFormat, functions.isDateGreaterEqualStartDate] },
    durationInDays: Number,
    _id: false
});

module.exports = periodSchema;