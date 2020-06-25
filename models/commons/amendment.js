const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const dayjs = require('dayjs');
const functions = require('../../util/functions');

const amendmentSchema = new Schema({
    id: { type: String, required: true },
    date: { type: String, default: dayjs().format(), validate: [functions.isValidDateFormat, functions.isDateLessEqualToday] },
    rationale: { type: String },
    description: { type: String, required: true },
    amendsReleaseID: { type: String, required: true },
    releaseID: { type: String },
    _id: false
});

module.exports = amendmentSchema;