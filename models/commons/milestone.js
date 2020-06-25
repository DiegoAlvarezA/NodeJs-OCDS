const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const functions = require('../../util/functions');

const milestoneSchema = new Schema({
    id: { type: String, required: true },
    title: { type: String, required: true },
    type: {
        type: String,
        enum: ['preProcurement', 'approval', 'engagement', 'assessment', 'delivery', 'reporting', 'financing'],
        required: true
    },
    description: String,
    code: String,
    dueDate: { type: String, validate: functions.isValidDateFormat },
    dateMet: { type: String, validate: functions.isValidDateFormat },
    dateModified: { type: String, validate: functions.isValidDateFormat },
    status: {
        type: String,
        enum: ['scheduled', 'met', 'notMet', 'partiallyMet'],
        required: true
    },
    documents: {
        type: [require('../commons/document')],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    _id: false
});

module.exports = milestoneSchema;